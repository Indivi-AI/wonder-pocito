import { dsls } from '@jb6/core'
import '@jb6/llm-guide'

const { 'llm-guide': { Doclet } } = dsls

Doclet('workflowElementFix.comax', {
  impl: `COMAX promotion schema:
- KupaDoc_Lines.MivzaNo = Mivza.C. Name, planned dates and mechanism are Mivza.Nm, Mivza.FromDate, Mivza.ToDate and Mivza.MivzaTypeNm.
- Mivza_Prt is only the promotion-item bridge: MivzaC, PrtC, AlutMimushYehida and ByDateUpd. It has no name, date or mechanism columns.
- Join Mivza_Prt with both mp.MivzaC = l.MivzaNo and mp.PrtC = l.PrtC when item membership is needed.`
})
