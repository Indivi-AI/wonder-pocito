import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/automation.js'
import '@jb6/react/tests/react-testers.js'
import './wonder-platform-runtime.js'
import './wonder-platform.js'
import './wonder-platform-tests.js'

const {
  common: { boolean: { and, contains, notContains } },
  react: { 'react-comp': { wonderPlatformTestApp }, 'ui-action': { actions, click, waitForText } },
  test: { Test, test: { reactTest } }
} = dsls

const { wonderPlatformClickInSection } = dsls.react['ui-action']

Test('wonderPlatform.pickerPromotesBuildNew', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(),
    and(contains('הנחיות בסיס'), notContains('אישור בחירה')), {
    userActions: actions(
      waitForText('אנליסט הוכחת קיום'), click('אנליסט הוכחת קיום'), waitForText('חיבורים'), click('חיבורים'),
      wonderPlatformClickInSection('מיומנויות', 'הוספה'), waitForText('אישור בחירה'),
      click('aria-label="בניית מיומנות חדש"'), waitForText('הנחיות בסיס')),
    logger: 'uiLogger'})
})
