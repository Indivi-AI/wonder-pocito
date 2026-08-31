// schematicsNightly — the unattended trigger for the pipeline. advanceSchematicsDay already IS the nightly
// chain (build the newly-arrived day, re-mature the day that just settled, write state); this file only says
// where and when it runs, and under whose identity.
//
// WHY GCS.node.gcpIdentity AND NOT THE signedRoom DRIVER. signedRoom:// resolves through short-lived signed
// URLs minted per user by the signed-url server, so every write is attributed to a signed-in human. A cron has
// no human. GCS.node.gcpIdentity reaches the SAME bucket over the authenticated bucket API using the runtime's
// own GCP identity, and ctx.vars.db overrides the scope's default driver (db-drivers-utils.js), so the wUrls
// in the cube stay exactly as they are — signedRoom://schematicsBI/... — and only the transport changes.
// Nothing about the room, its ACL, or the dashboard's own reads is weakened: this is a second door for a
// machine, not an open one.
//
// THE IDENTITY IS ALREADY RIGHT, THE IMAGE IS NOT. gcloudCronEtl deploys with the project's default compute
// service account, and that account happens to hold both halves of what this job needs: storage.objectViewer
// at the project level, which is how gs://schematics-gcs-dump grants read, and storage.objectAdmin on
// gs://indiviai-wonder-protected. So no serviceAccount param is required after all.
//
// NOT DEPLOYABLE YET, for one reason: gcloudCronEtl's runner (RUN_ETL_SH in wonder/db/etl/etl-cron.js) fetches
// its script and writes state.json with `gcloud storage cp`, and the wonder image carries node, duckdb,
// python3, fastavro and google-cloud-storage but no gcloud — the job would die on its first command.
// schematicsNightlyReadiness asserts this, and Test('schematicsNightly.deployable') FAILS today on purpose.
//
// WORTH KNOWING, because it bites the demo button rather than this profile: wonder-protected-rooms-sa, which
// runs the signed-rooms service and therefore the `Next day` lambda, has NO storage read anywhere outside the
// protected bucket. It can write the silver it produces but cannot read the bronze it is made from, so the
// SAME ETL that will run here as a cron cannot run there as a lambda. Opposite halves, opposite failures.

import { dsls, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@wonder/db/etl/etl-dsl.js'
import '@wonder/db/etl/etl-cron.js'
import './demo-advance-day.js'

const { tgp: { Component }, common: { Data }, etl: { etl: { gcloudCronEtl } } } = dsls

Component('schematicsNightly', {
  moreTypes: 'etl<etl>',
  description: 'deploy the nightly schematics advance as a Cloud Run Job + Scheduler',
  impl: gcloudCronEtl({
    id: 'schematics-nightly',
    version: 'cdc-v1',
    schedule: '0 3 * * *',
    // Datastream lands continuously and the fresh day is built deliberately immature, so the hour only has to
    // sit after midnight UTC. 03:00 leaves room for a late bronze flush without colliding with the next day.
    timeoutSec: 3600,
    memory: '8Gi',
    cpu: '4',
    // The build context Cloud Build receives holds only the Dockerfile and run-etl.sh, so the repo cannot be
    // COPYed in — it has to arrive as the base image. wonder:latest is the same image the servers run, which
    // is what makes the cron and the dashboard provably the same code.
    dockerfile: `FROM me-west1-docker.pkg.dev/indiviai/cloud-run-source-deploy/wonder:latest
COPY run-etl.sh /usr/local/bin/run-etl.sh
RUN chmod +x /usr/local/bin/run-etl.sh
WORKDIR /usr/src/app
ENTRYPOINT ["/usr/local/bin/run-etl.sh"]`,
    // Bronze is read in place from the Datastream sink, so there is nothing to stage down first.
    extract: `echo "bronze is read in place from gs://schematics-gcs-dump"`,
    transform: `cat > /tmp/nightly.mjs <<'__NIGHTLY_EOF__'
import { dsls, coreUtils } from '@jb6/core'
import '@wonder/db/db-drivers-live-repo.js'
import '@solution/schematics/demo-advance-day.js'
const ctx = new coreUtils.Ctx().setVars({ db: 'GCS.node.gcpIdentity', cacheStrategy: 'noCache' })
const res = await ctx.run(dsls.etl.etl.advanceSchematicsDay())
console.log(JSON.stringify({ asOf: res.asOf, matured: res.matured, freshObjs: res.freshObjs, maturedObjs: res.maturedObjs }))
__NIGHTLY_EOF__
cd /usr/src/app && node --import ./nodejs-importmap.js /tmp/nightly.mjs`,
    // advanceSchematicsDay writes the silver, the gold, etl-runs/<day>.json and pipeline-state.json itself —
    // the load step is inside the ETL because the state record must not advance unless the parquets landed.
    load: `echo "silver, gold and pipeline-state.json were written by advanceSchematicsDay"`
  })
})

Data('schematicsNightlyReadiness', {
  description: 'the infrastructure prerequisites schematicsNightly needs before it can be deployed',
  params: [
    { id: 'dockerfiles', as: 'array', defaultValue: ['cloud-services/wonder.docker', 'cloud-services/wonder-base.docker'],
      description: 'the layers that build the image the cron job would run in' },
    { id: 'bronzeBucket', as: 'string', defaultValue: 'schematics-gcs-dump' },
    { id: 'project', as: 'string', defaultValue: 'indiviai' },
    { id: 'lambdaIdentity', as: 'string', defaultValue: 'wonder-protected-rooms-sa@indiviai.iam.gserviceaccount.com',
      description: 'runs the signed-rooms service, and so the demo button' }
  ],
  impl: async (ctx, {}, { dockerfiles, bronzeBucket, project, lambdaIdentity }) => {
    const { promises: fsp } = await import('fs')
    const image = (await Promise.all(dockerfiles.map(f => fsp.readFile(f, 'utf8').catch(() => '')))).join('\n')
    // the bronze bucket grants read to projectViewer, so project-level storage roles are what decide access
    const iam = await coreUtils.runBashScript(`gcloud projects get-iam-policy ${project} --flatten='bindings[].members'`
      + ` --filter='bindings.members:${lambdaIdentity} AND bindings.role:roles/storage'`
      + ` --format='value(bindings.role)' 2>/dev/null`)
    const lambdaCanReadBronze = /roles\/storage/.test(String(iam.stdout ?? ''))
    const blockers = [
      !/gcloud|google-cloud-(cli|sdk)/.test(image) && {
        blocks: 'the nightly cron',
        what: 'no gcloud in the image',
        why: "gcloudCronEtl's run-etl.sh fetches script.sh and writes state.json with `gcloud storage cp`",
        fix: 'install google-cloud-cli in cloud-services/wonder-base.docker' },
      !lambdaCanReadBronze && {
        blocks: 'the demo button, which runs the same ETL as a lambda',
        what: `${lambdaIdentity} holds no project-level storage role`,
        why: `gs://${bronzeBucket} grants read to projectViewer, so an SA without a project storage role cannot read bronze`,
        fix: `grant roles/storage.objectViewer on gs://${bronzeBucket} to ${lambdaIdentity}` }
    ].filter(Boolean)
    return { ready: blockers.length === 0, blockers }
  }
})
