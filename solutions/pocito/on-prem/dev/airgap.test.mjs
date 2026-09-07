import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const onPrem = fileURLToPath(new URL('../', import.meta.url))
const run = (file, args, options = {}) => execFileSync(file, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options}).trim()
const fixture = t => {
  const directory = mkdtempSync(join(onPrem, 'images/.test-')), source = join(directory, 'source')
  const kit = join(source, 'solutions/pocito/on-prem/images'), exporter = join(source, 'solutions/pocito/on-prem/export-airgap.sh')
  mkdirSync(kit, {recursive: true})
  t.after(() => rmSync(directory, {recursive: true, force: true}))
  cpSync(join(onPrem, 'export-airgap.sh'), exporter)
  cpSync(join(onPrem, '../local-dev-readme.md'), join(source, 'solutions/pocito/local-dev-readme.md'))
  writeFileSync(join(source, '.gitignore'), 'solutions/pocito/on-prem/images/\n')
  writeFileSync(join(source, 'version.txt'), 'first\n')
  const git = (...args) => run('git', ['-C', source, ...args])
  git('init', '-b', 'release/offline')
  git('config', 'user.name', 'Airgap Test')
  git('config', 'user.email', 'airgap-test@example.invalid')
  git('add', '.')
  git('commit', '-m', 'Initial code')
  const exportCode = () => run('bash', [exporter, '--code'], {env: {...process.env, DOCKER_HOST: 'unix:///nonexistent-pocito-test.sock'}})
  return {directory, source, kit, exporter, git, exportCode}
}

test('code-only export clones and updates a real checkout, independently of image checksums', t => {
  const {directory, source, kit, git, exportCode} = fixture(t), checkout = join(directory, 'host checkout')
  const bundle = join(kit, 'wonder-pocito.bundle'), imageChecksums = readFileSync(join(onPrem, 'images/SHA256SUMS'))
  writeFileSync(join(kit, 'SHA256SUMS'), imageChecksums)
  git('branch', 'unexported')
  git('tag', 'unexported-tag')
  writeFileSync(join(source, 'version.txt'), 'uncommitted\n')
  exportCode()
  assert.deepEqual(run('git', ['bundle', 'list-heads', bundle]).split('\n').map(line => line.split(' ')[1]), ['HEAD', 'refs/heads/release/offline'])
  assert.equal(readFileSync(join(kit, 'SHA256SUMS.code'), 'utf8').split(' ')[0], createHash('sha256').update(readFileSync(bundle)).digest('hex'))
  assert.match(readFileSync(join(kit, 'README.md'), 'utf8'), /^# Air-gapped development container\n/)
  for (const command of ['git clone', 'type=bind,src=$POCITO_CHECKOUT', 'git merge --ff-only', 'docker cp', 'setfacl'])
    assert.ok(readFileSync(join(kit, 'README.md'), 'utf8').includes(command), command)
  run('git', ['clone', '--branch', 'release/offline', '--origin', 'bundle', bundle, checkout])
  assert.equal(readFileSync(join(checkout, 'version.txt'), 'utf8'), 'first\n')
  writeFileSync(join(source, 'version.txt'), 'second\n')
  git('commit', '-am', 'Update code')
  exportCode()
  run('git', ['-C', checkout, 'fetch', bundle, 'refs/heads/release/offline'])
  run('git', ['-C', checkout, 'merge', '--ff-only', 'FETCH_HEAD'])
  assert.equal(readFileSync(join(checkout, 'version.txt'), 'utf8'), 'second\n')
  assert.deepEqual(readFileSync(join(kit, 'SHA256SUMS')), imageChecksums)
  assert.ok(!existsSync(join(source, 'wonder-pocito.bundle')))
  assert.ok(!readdirSync(kit).some(name => name.startsWith('.export.')))
})

test('invalid modes and detached HEAD preserve the previous export', t => {
  const {kit, exporter, git, exportCode} = fixture(t)
  exportCode()
  const bundle = readFileSync(join(kit, 'wonder-pocito.bundle'))
  for (const args of [['--unknown'], ['--code', '--images']])
    assert.notEqual(spawnSync('bash', [exporter, ...args]).status, 0)
  git('checkout', '--detach')
  assert.throws(exportCode)
  assert.deepEqual(readFileSync(join(kit, 'wonder-pocito.bundle')), bundle)
  assert.ok(!readdirSync(kit).some(name => name.startsWith('.export.')))
})

test('entrypoint preserves local changes, Git configuration, working directory and command arguments', t => {
  const {source} = fixture(t), configuration = readFileSync(join(source, '.git/config'))
  writeFileSync(join(source, 'version.txt'), 'local changes\n')
  const result = run('sh', [join(onPrem, 'dev/pocito-entrypoint.sh'), process.execPath, '-e',
    'process.stdout.write(JSON.stringify([process.cwd(), ...process.argv.slice(1)]))', 'argument with spaces'],
  {env: {...process.env, POCITO_REPO_DIR: source}})
  assert.deepEqual(JSON.parse(result), [source, 'argument with spaces'])
  assert.deepEqual(readFileSync(join(source, '.git/config')), configuration)
  assert.equal(readFileSync(join(source, 'version.txt'), 'utf8'), 'local changes\n')
  const missing = spawnSync('sh', [join(onPrem, 'dev/pocito-entrypoint.sh'), 'true'],
    {encoding: 'utf8', env: {...process.env, POCITO_REPO_DIR: join(source, 'missing')}})
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /Bind-mount a Git checkout/)
})

test('every exported setup shell block parses as Bash', () => {
  const readme = readFileSync(join(onPrem, '../local-dev-readme.md'), 'utf8').split('## Air-gapped development container\n')[1]
  for (const [, script] of readme.matchAll(/```sh\n([\s\S]*?)```/g))
    assert.equal(spawnSync('bash', ['-n'], {input: script}).status, 0, script)
})
