import { dsls } from '@jb6/core'
import '@jb6/react/tests/react-testers.js'
import './platform-v0.js'

const {
  test: { Test, test: { reactTest } },
  common: { boolean: { and, contains } },
  react: { 'react-comp': { PlatformV0 }, 'ui-action': { actions, click, waitForText } }
} = dsls
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
