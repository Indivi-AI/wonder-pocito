// Scheduled CRM sync (every 15 min) via Cloud Run Job + Cloud Scheduler. Runs two steps:
//   1. heyreach-sync.mjs — LinkedIn conversations → contacts
//   2. fathom-sync.mjs   — Fathom meetings → contact.meetings; unmatched → fathom-unmatched.json (CRM banner)
// Reuses the Wonder cron infra (gcloudCronEtl). Both Node scripts are read from disk at deploy time and
// shipped inside the job's script.sh via quoted heredocs (no shell expansion, no escaping, no drift).
// Job auth = Cloud Run metadata SA (no key file). fathom-sync reads its API key from GCS (no env needed).
//
// ── IAM: nothing to grant ──
//   The job runs as 365199207445-compute@developer.gserviceaccount.com (gcloudCronEtl default),
//   and reads/writes the public bucket gs://indiviai-wonder/${CRM_ROOM}/ (anonymous GET+PUT), so it
//   reads heyreach-api-key.json + read/writes contacts.json out of the box. (The ETL one-time enables in
//   wonder/db/etl/etl-cron.js header must be done once — already done since other ETLs run.)
//
// ── DEPLOY (no all-tests edit needed; MCP auto-imports from $location) ──
//   curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' \
//     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"runTgpSnippet",
//          "arguments":{"profileText":"{$:'\''test<test>deployHeyreachSyncCron'\''}"}}}'
//
// ── OPS ──
//   run now:  gcloud run jobs execute etl-crm-heyreach-sync --region=me-west1 --async
//   logs:     gcloud beta run jobs logs read etl-crm-heyreach-sync --region=me-west1
//   pause:    gcloud scheduler jobs pause etl-crm-heyreach-sync-sched --location=me-west1

import { dsls, coreUtils } from '@jb6/core'
import '@jb6/testing'
import '@wonder/db/etl/etl-cron.js'
import { CRM_ROOM } from './crm.config.mjs'

const {
  test: { Test, test: { dataTest } },
  common: { boolean: { contains }, data: { join } },
  etl: { etl: { gcloudCronEtl } }
} = dsls

const { readFileSync } = coreUtils.isNode ? await import('fs') : {}
const read = f => readFileSync(new URL(f, import.meta.url), 'utf8')

const DOCKERFILE = `FROM gcr.io/google.com/cloudsdktool/cloud-sdk:slim
RUN apt-get update && apt-get install -y curl ca-certificates \\
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \\
 && apt-get install -y nodejs \\
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm init -y >/dev/null 2>&1 && npm i @google-cloud/storage google-auth-library >/dev/null 2>&1
COPY run-etl.sh /usr/local/bin/run-etl.sh
RUN chmod +x /usr/local/bin/run-etl.sh
ENTRYPOINT ["/usr/local/bin/run-etl.sh"]`

const EXTRACT = coreUtils.isNode ? `cat > /app/sync.mjs << '__SYNC_EOF__'
${read('./heyreach-sync.mjs')}
__SYNC_EOF__
cat > /app/fathom.mjs << '__FATHOM_EOF__'
${read('./fathom-sync.mjs')}
__FATHOM_EOF__
cd /app && node sync.mjs && node fathom.mjs` : ''

Test('deployHeyreachSyncCron', {
  impl: dataTest({
    calculate: gcloudCronEtl({
      id: 'crm-heyreach-sync',
      dockerfile: DOCKERFILE,
      schedule: '*/15 * * * *',
      timeoutSec: 600,
      extract: EXTRACT,
      transform: '',
      load: `echo "[$(date -u +%H:%M:%SZ)] heyreach sync done"`,
      extraEnv: `CRM_ROOM=${CRM_ROOM}`
    }),
    expectedResult: contains('execution triggered', { allText: join('\n', { items: '%etlLog/t%' }) }),
    timeout: 12000,
    logger: 'etlLogger'
  })
})
