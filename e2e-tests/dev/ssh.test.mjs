import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('image startup allows SSH as pocito and sudo without credentials', {skip: !existsSync('/etc/ssh/sshd_config_pocito')}, t => {
  const knownHostsDir = mkdtempSync(join(tmpdir(), 'pocito-ssh-'))
  t.after(() => rmSync(knownHostsDir, {recursive: true, force: true}))
  const identity = execFileSync('ssh', ['-p', '2222', '-o', 'BatchMode=yes', '-o', 'PreferredAuthentications=none',
    '-o', 'StrictHostKeyChecking=accept-new', '-o', `UserKnownHostsFile=${join(knownHostsDir, 'known_hosts')}`,
    'pocito@127.0.0.1', 'id -un && sudo -n id -u'], {encoding: 'utf8', timeout: 10000})
  assert.equal(identity.trim(), 'pocito\n0')
})
