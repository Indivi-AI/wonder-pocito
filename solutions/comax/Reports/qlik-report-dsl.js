import { jb, dsls } from '@jb6/core'
import '@wonder/verified-queries/verified-queries-dsl.js'

const { coreUtils: { callerCompId } } = jb
const { 'verified-queries': { VerifiedReport } } = dsls
const defined=obj=>Object.fromEntries(Object.entries(obj).filter(([,v])=>v!=null))

VerifiedReport('qlikReport', {
  params:[
    {id:'title',asIs:true},{id:'description',asIs:true},{id:'whenToUse',asIs:true},{id:'qlikScreen',asIs:true},{id:'controls',asIs:true},{id:'routePhrases',asIs:true},{id:'questionsCovered',asIs:true},{id:'analysisLogic',asIs:true},{id:'answerInstructions',asIs:true},{id:'exampleQuestions',asIs:true},{id:'caveats',asIs:true},{id:'executiveSummary',type:'query-slot'},{id:'summary',type:'query-slot'},{id:'reactComp',asIs:true},{id:'sections',type:'report-section[]'},{id:'materialize',as:'boolean'},{id:'id',as:'string'}
  ],
  impl:(ctx,{}, {id,sections,...args})=>defined({id:id||callerCompId(ctx.jbCtx),kind:'qlik-report',...args,sections:(sections||[]).map(s=>({...s,executiveSummary:s.executiveSummary||s.summary}))})
})
