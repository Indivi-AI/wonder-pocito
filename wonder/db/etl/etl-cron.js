// gcloudCronEtl — deploys a Cloud Run Job + Cloud Scheduler in <region>; outputs land in
//   gs://<bucket>/schm/etls/<id>/sessions-<date>.parquet
//   gs://<bucket>/schm/etls/<id>/state.json     ← {lastRun, id}
//   gs://<bucket>/schm/etls/<id>/runs/<ts>.json ← per-run summary
//
// One-time setup per project (run by hand once):
//   PN=$(gcloud projects describe indiviai --format='value(projectNumber)')
//   SA="${PN}-compute@developer.gserviceaccount.com"
//   gcloud services enable run.googleapis.com cloudscheduler.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project=indiviai
//   gcloud artifacts repositories create etls --repository-format=docker --location=me-west1 --project=indiviai
//   gcloud storage buckets add-iam-policy-binding gs://logs-bucket-me-west1 --member="serviceAccount:${SA}" --role=roles/storage.objectAdmin
// (run.invoker is granted per-job by gcloudCronEtl on first deploy — no project-wide IAM needed)
//
// Operational:
//   manual run:  gcloud run jobs execute etl-<id> --region=me-west1 --async
//   tail logs:   gcloud beta run jobs logs read etl-<id> --region=me-west1
//   pause:       gcloud scheduler jobs pause etl-<id>-sched --location=me-west1
//   delete:      gcloud scheduler jobs delete etl-<id>-sched --location=me-west1
//                gcloud run jobs delete etl-<id> --region=me-west1

import { dsls, coreUtils } from '@jb6/core'
import '@jb6/core/misc/jb-cli.js'
import './etl-dsl.js'

const { tgp: { Component }, common: { Data } } = dsls

const RUN_ETL_SH = `#!/bin/bash
START_MS=$(date +%s%3N)
BASE="gs://\${ETL_BUCKET}/schm/etls/\${ETL_ID}"
gcloud storage cp "$BASE/script.sh" /tmp/s.sh
ETL_OUTPUT="$BASE" bash /tmp/s.sh
EXIT=$?
END_MS=$(date +%s%3N); DUR=$((END_MS - START_MS))
STATUS=$([ $EXIT -eq 0 ] && echo ok || echo failed)
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
printf '{"ts":%s,"durationMs":%s,"status":"%s","exitCode":%s,"id":"%s"}' "$END_MS" "$DUR" "$STATUS" "$EXIT" "$ETL_ID" \\
  | gcloud storage cp - "$BASE/runs/$TS.json"
printf '{"lastRun":%s,"lastStatus":"%s","lastDurationMs":%s,"id":"%s","version":"%s"}' "$END_MS" "$STATUS" "$DUR" "$ETL_ID" "$VERSION" \\
  | gcloud storage cp - "$BASE/state.json"
exit $EXIT
`

const sh = cmd => coreUtils.runBashScript(cmd)
const trim = r => String(r.stdout ?? '').trim()

Component('gcloudCronEtl', {
  moreTypes: 'etl<etl>',
  description: 'deploy a Cloud Run Job + Scheduler; outputs to gs://<bucket>/schm/etls/<id>/',
  params: [
    {id: 'id', as: 'string'},
    {id: 'version', as: 'string', defaultValue: '', description: 'output schema version, exposed to the job as $VERSION env and recorded in state.json'},
    {id: 'dockerfile', as: 'string', asIs: true},
    {id: 'extract',   as: 'string', asIs: true},
    {id: 'transform', as: 'string', asIs: true},
    {id: 'load',      as: 'string', asIs: true},
    {id: 'schedule', as: 'string', defaultValue: '0 * * * *'},
    {id: 'timeoutSec', as: 'number', defaultValue: 1800},
    {id: 'memory', as: 'string', defaultValue: '8Gi'},
    {id: 'cpu', as: 'string', defaultValue: '2'},
    {id: 'region', as: 'string', defaultValue: 'me-west1'},
    {id: 'bucket', as: 'string', defaultValue: 'logs-bucket-me-west1'},
    {id: 'project', as: 'string', defaultValue: 'indiviai'},
    {id: 'extraEnv', as: 'string', defaultValue: '', description: 'comma-separated KEY=VAL pairs appended to --set-env-vars'}
  ],
  impl: async (ctx, { etlLogger }, { id, version, dockerfile, extract, transform, load, schedule, timeoutSec, memory, cpu, region, bucket, project, extraEnv }) => {
    const buildDir = `/tmp/etl-build-${id}`
    await sh(`mkdir -p '${buildDir}'`)
    await sh(`cat > '${buildDir}/Dockerfile' << '__DF_EOF__'\n${dockerfile}\n__DF_EOF__`)
    await sh(`cat > '${buildDir}/run-etl.sh' << '__RUN_EOF__'\n${RUN_ETL_SH}\n__RUN_EOF__\nchmod +x '${buildDir}/run-etl.sh'`)
    const hash = trim(await sh(`cat '${buildDir}/Dockerfile' '${buildDir}/run-etl.sh' | sha256sum | cut -c1-12`))
    // Image tag is hash-based and id-independent — ETLs sharing the same Dockerfile share the same image (no rebuild).
    const tag = `${region}-docker.pkg.dev/${project}/etls/runner:${hash}`
    const imgExists = trim(await sh(`gcloud artifacts docker images describe '${tag}' --quiet >/dev/null 2>&1 && echo 1 || echo 0`))
    if (imgExists !== '1') {
      etlLogger?.info?.({ t: 'building image', tag }, {}, { ctx })
      await sh(`cd '${buildDir}' && gcloud builds submit . --tag='${tag}' --project='${project}' --quiet`)
    } else etlLogger?.info?.({ t: 'image cached', tag }, {}, { ctx })

    await sh(`cat > '${buildDir}/script.sh' << '__SH_EOF__'\n${extract}\n${transform}\n${load}\n__SH_EOF__\ngcloud storage cp '${buildDir}/script.sh' 'gs://${bucket}/schm/etls/${id}/script.sh'`)
    etlLogger?.info?.({ t: 'script.sh uploaded' }, {}, { ctx })

    const envStr = `ETL_BUCKET=${bucket},ETL_ID=${id}${version ? `,VERSION=${version}` : ''}${extraEnv ? ',' + extraEnv : ''}`
    await sh(`gcloud run jobs deploy etl-${id} --image='${tag}' --region='${region}' --task-timeout=${timeoutSec}s --memory='${memory}' --cpu='${cpu}' --set-env-vars='${envStr}' --project='${project}' --quiet`)
    etlLogger?.info?.({ t: 'job deployed', name: `etl-${id}` }, {}, { ctx })

    const projNum = trim(await sh(`gcloud projects describe '${project}' --format='value(projectNumber)'`))
    const sa = `${projNum}-compute@developer.gserviceaccount.com`
    await sh(`gcloud run jobs add-iam-policy-binding etl-${id} --member='serviceAccount:${sa}' --role=roles/run.invoker --region='${region}' --project='${project}' --quiet`)
    const jobUri = `https://${region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${project}/jobs/etl-${id}:run`
    const schedArgs = `--location='${region}' --schedule='${schedule}' --uri='${jobUri}' --http-method=POST --oauth-service-account-email='${sa}' --project='${project}' --quiet`
    await sh(`gcloud scheduler jobs update http etl-${id}-sched ${schedArgs} 2>/dev/null || gcloud scheduler jobs create http etl-${id}-sched ${schedArgs}`)
    etlLogger?.info?.({ t: 'scheduler upserted', schedule }, {}, { ctx })

    await sh(`gcloud run jobs execute etl-${id} --async --region='${region}' --project='${project}' --quiet`)
    etlLogger?.info?.({ t: 'execution triggered' }, {}, { ctx })

    const stateRaw = trim(await sh(`gcloud storage cat 'gs://${bucket}/schm/etls/${id}/state.json' 2>/dev/null || echo '{}'`))
    let state = {}
    try { state = JSON.parse(stateRaw || '{}') } catch {}
    return { ...state, deployed: true, image: tag, schedule, jobName: `etl-${id}` }
  }
})
