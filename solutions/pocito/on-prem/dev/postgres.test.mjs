import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

test('air-gapped npm launcher manages bundled PostgreSQL and preserves external services',
  {skip: !process.env.POCITO_TEST_MINIO_ENDPOINT, timeout: 600000}, async t => {
    const directory = mkdtempSync(join(tmpdir(), 'pocito-postgres-')), data = join(homedir(), '.local/share/pocito/postgres'), cleanups = [], processes = []
    assert.ok(!existsSync(data), 'Run this suite in a fresh disposable dev container without a home volume')
    t.afterEach(async () => { for (const stop of processes.splice(0).reverse()) await stop() })
    t.after(async () => {
      for (const cleanup of cleanups.reverse()) await cleanup()
      for (const path of [data, directory]) rmSync(path, {recursive: true, force: true})
    })
    const env = {...process.env, POCITO_ENV_FILE: '/dev/null', POCITO_PORT: '3000', MARKETPLACE_PORT: '7777', AGENT_OS_PORT: '7778',
      MINIO_ENDPOINT: process.env.POCITO_TEST_MINIO_ENDPOINT, MINIO_ACCESS_KEY: 'wonder', MINIO_SECRET_KEY: 'wonder-minio-local',
      MARKETPLACE_S3_BUCKET: 'indiviai-wonder', MINIO_STORAGE_CLASS: 'STANDARD', MARKETPLACE_DATA_DIR: join(directory, 'marketplace'),
      PGDATA: undefined, PGVECTOR_URL: '', AGNO_API_URL: '', LITELLM_HOST: '', LITELLM_CONFIG: 'solutions/pocito/on-prem/litellm/config.yaml'}
    const run = (command, args) => execFileSync(command, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim()
    const sql = (port, query) => run('psql', [`postgresql://pocito@127.0.0.1:${port}/postgres`, '-v', 'ON_ERROR_STOP=1', '-Atc', query])
    const waitFor = async (check, output = () => '') => {
      for (let attempt = 0; attempt < 480; attempt++) {
        if (await check().catch(() => false)) return
        await delay(250)
      }
      assert.fail(`Service did not become ready\n${output()}`)
    }
    const launch = (vars = {}, command = 'npm', args = ['run', 'pocito-dev-airgapped']) => {
      const child = spawn('/usr/bin/tini', ['-s', '-g', '--', command, ...args],
        {env: {...env, ...vars}, detached: true, stdio: ['ignore', 'pipe', 'pipe']})
      let output = ''
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk })
      const closed = new Promise(resolve => child.once('close', code => resolve(code)))
      const stop = async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
        await closed
      }
      processes.push(stop)
      return {stop, output: () => output}
    }
    const health = async (url = 'http://127.0.0.1:7778/healthz') =>
      (await fetch(url, {signal: AbortSignal.timeout(2000)})).json()
    const ready = async (app, vector = 'ok', agno = 'http://127.0.0.1:7778/healthz') => {
      await waitFor(async () => {
        const state = await health(agno)
        return state.object_store === 'ok' && state.vector_store === vector
      }, app.output)
      await waitFor(async () => (await fetch('http://127.0.0.1:3000/health')).ok, app.output)
    }

    await t.test('missing URL initializes pgvector; shutdown and restart retain vectors', async () => {
      const first = launch({PGVECTOR_URL: undefined})
      await ready(first)
      assert.equal(readFileSync(join(data, 'PG_VERSION'), 'utf8').trim(), '17')
      assert.equal(sql(5432, "SELECT extname FROM pg_extension WHERE extname='vector'"), 'vector')
      assert.equal(sql(5432, 'SHOW listen_addresses'), '127.0.0.1')
      assert.equal(sql(5432, 'SHOW data_directory'), data)
      sql(5432, "CREATE TABLE fallback_test (embedding vector(3)); INSERT INTO fallback_test VALUES ('[1,2,3]')")
      assert.equal(sql(5432, "SELECT embedding <-> '[1,2,3]'::vector FROM fallback_test"), '0')
      await first.stop()
      assert.ok(!existsSync(join(data, 'postmaster.pid')), first.output())
      assert.match(run('pg_controldata', [data]), /Database cluster state:\s+shut down/)
      const restarted = launch()
      await ready(restarted)
      assert.equal(sql(5432, "SELECT embedding <-> '[1,2,3]'::vector FROM fallback_test"), '0')
      await restarted.stop()
    })

    const external = join(directory, 'external'), unused = join(directory, 'unused')
    run('initdb', ['-D', external, '-U', 'pocito', '--auth=trust', '--encoding=UTF8', '--no-locale'])
    run('pg_ctl', ['-D', external, '-l', join(external, 'server.log'), '-o', "-h 127.0.0.1 -p 5433 -k ''", '-w', 'start'])
    cleanups.push(() => run('pg_ctl', ['-D', external, '-m', 'fast', '-w', 'stop']))
    sql(5433, 'CREATE EXTENSION vector')
    const externalUrl = 'postgresql+psycopg://pocito@127.0.0.1:5433/postgres'
    await t.test('configured URL uses the external database and leaves it running', async () => {
      const app = launch({PGVECTOR_URL: externalUrl, PGDATA: unused})
      await ready(app)
      assert.ok(!existsSync(unused))
      await app.stop()
      assert.equal(sql(5433, 'SELECT 1'), '1')
    })
    await t.test('unreachable configured database never starts a fallback', async () => {
      const app = launch({PGVECTOR_URL: externalUrl.replace('5433', '5434'), PGDATA: unused})
      await ready(app, 'unreachable')
      assert.ok(!existsSync(unused))
      await app.stop()
    })
    await t.test('external Agno with no database URL does not start PostgreSQL', async () => {
      const agno = launch({PGVECTOR_URL: externalUrl, AGENT_OS_PORT: '7780'}, '/opt/pocito/venvs/agno-server/bin/python',
        ['solutions/pocito/agno-server/agno_server.py'])
      await waitFor(async () => (await health('http://127.0.0.1:7780/healthz')).vector_store === 'ok', agno.output)
      const app = launch({AGNO_API_URL: 'http://127.0.0.1:7780', PGDATA: unused})
      await ready(app, 'ok', 'http://127.0.0.1:7780/healthz')
      assert.ok(!existsSync(unused))
      await app.stop()
      assert.equal((await health('http://127.0.0.1:7780/healthz')).vector_store, 'ok')
      await agno.stop()
    })
  })
