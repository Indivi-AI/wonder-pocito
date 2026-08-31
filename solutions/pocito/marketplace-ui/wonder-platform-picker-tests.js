import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/automation.js'
import '@jb6/react/tests/react-testers.js'
import './wonder-platform-runtime.js'
import './wonder-platform.js'
import './pocito-tests.js'

const {
  common: { boolean: { and, contains, notContains } },
  react: { 'react-comp': { wonderPlatformTestApp }, 'ui-action': { actions, click, waitForText } },
  test: { Test, test: { reactTest } }
} = dsls

const { wonderPlatformClickInSection } = dsls.react['ui-action']

Test('wonderPlatform.pickerPromotesBuildNew', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(),
    and(contains('שם להצגה'), notContains('אישור בחירה')), {
    userActions: actions(
      waitForText('אנליסט הוכחת קיום'), click('אנליסט הוכחת קיום'), waitForText('יכולות'), click('יכולות'),
      wonderPlatformClickInSection('מיומנויות', 'חיבור קיים'), waitForText('אישור בחירה'),
      click('aria-label="בניית מיומנות חדשה"'), waitForText('שם להצגה')),
    logger: 'uiLogger'})
})
