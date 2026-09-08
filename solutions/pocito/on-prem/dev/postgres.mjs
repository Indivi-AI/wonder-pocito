import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function startPostgres(env) {
  const data = env.PGDATA || join(homedir(), '.local/share/pocito/postgres')
  const run = (command, args) => execFileSync(command, args, {env, stdio: 'inherit'})
  mkdirSync(data, {recursive: true})
  if (!existsSync(join(data, 'PG_VERSION')))
    run('initdb', ['-D', data, '-U', 'pocito', '--auth=trust', '--encoding=UTF8', '--no-locale'])
  run('pg_ctl', ['-D', data, '-l', join(data, 'server.log'), '-o', "-h 127.0.0.1 -p 5432 -k ''", '-w', 'start'])
  process.once('exit', () => run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']))
  run('psql', ['postgresql://pocito@127.0.0.1:5432/postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE EXTENSION IF NOT EXISTS vector'])
  env.PGVECTOR_URL = 'postgresql+psycopg://pocito@127.0.0.1:5432/postgres'
}
