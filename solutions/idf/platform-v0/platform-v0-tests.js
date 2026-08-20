import { coreUtils, dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import './platform-v0.js'

const {
  test: { Test, test: { dataTest, reactTest } },
  common: { data: { asIs }, boolean: { and, contains, equals } },
  react: { 'react-comp': { PlatformV0 }, 'ui-action': { actions, click, waitForText } }
} = dsls
Test('platformV0.moduleContracts', {
  impl: dataTest({
    calculate: ctx => {
      const ids = ['data<common>platformV0Config', 'data<common>platformMarketplaceApi', 'data<common>platformAgnoRun',
        'data<common>platformReportMarkers', 'react-comp<react>PlatformV0Navigation', 'react-comp<react>PlatformV0Marketplace',
        'react-comp<react>PlatformV0ResourceModal', 'react-comp<react>PlatformV0VerifiedReport', 'react-comp<react>PlatformV0ChatComposer',
        'react-comp<react>PlatformV0Chat', 'react-comp<react>PlatformV0Evaluation', 'react-comp<react>PlatformV0']
      const parsed = dsls.common.data.platformReportMarkers.$runWithCtx(ctx, {text: 'alpha [[report:a]] beta [[report:a]] [[report:b]]'})
      return {result: {registered: ids.every(id => coreUtils.compByFullId(id)), ...parsed}}
    },
    expectedResult: equals('%result%', asIs({registered: true, content: 'alpha beta', reportIds: ['a', 'b']}))
  })
})
Test('platformV0.skillUpload', {
  impl: reactTest(PlatformV0(), and(contains('מיומנות חדשה'), contains('העלאת SKILL.md או ZIP')), {
    userActions: actions(
      waitForText('פלאגין חדש'),
      click('מיומנויות'),
      waitForText('מיומנות חדשה'),
      click('מיומנות חדשה'),
      waitForText('העלאת SKILL.md או ZIP')
    )
  })
})
Test('platformV0.deletePlugin', {
  impl: reactTest(PlatformV0(), contains('מחיקת אנליסט הוכחת קיום'), {
    userActions: waitForText('אנליסט הוכחת קיום')
  })
})
Test('platformV0.chatUi', {
  impl: reactTest({
    testedComp: PlatformV0(),
    expectedResult: and(contains('שיחה מתמשכת'), contains('כתוב הודעה לפלאגין…'), contains('Verified Report')),
    userActions: actions(waitForText('פלאגין חדש'), click('צ׳אט'), waitForText('Verified Report'))
  })
})
Test('platformV0.reportsMarketplace', {
  impl: reactTest(PlatformV0(), and(contains('פערי הוכחת קיום'), contains('דוח מאומת חדש')), {
    userActions: actions(waitForText('פלאגין חדש'), click('דוחות מאומתים'), waitForText('פערי הוכחת קיום'))
  })
})
