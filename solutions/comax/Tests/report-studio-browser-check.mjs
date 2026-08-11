import { chromium } from '../../../node_modules/playwright/index.mjs'

const opt = k => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
// publish once: uploadRoomApplet({ roomId: 'comax', entryPath: '@wonder-admin/comax/demo/App/report-studio.js', entryCompFullId: 'react-comp<react>reportStudio' })
const url = opt('url') || 'http://127.0.0.1:3000/room/comax/applet/reportStudio?logger=uiLogger,dbLogger'
const out = opt('out') || '/tmp/report-studio-browser-check.png'
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => ['error', 'warning'].includes(m.type()) && !m.text().includes('cdn.tailwindcss.com') && errors.push(`${m.type()}: ${m.text()}`))
  await page.goto(url, { waitUntil: 'networkidle', timeout: 12000 })
  await page.getByRole('button', { name: 'Set demo goal' }).click()
  const goal = await page.locator('label').filter({ hasText: 'goal' }).locator('textarea').inputValue()
  await page.getByRole('button', { name: /^Run$/ }).click()
  await page.getByText('ReactComp: promotionReportPanel').waitFor({ timeout: 120000 })
  await page.getByRole('button', { name: 'SQL rows' }).click()
  await page.getByRole('columnheader', { name: 'active_promos' }).waitFor({ timeout: 5000 })
  await page.screenshot({ path: out, fullPage: true })
  if (goal != 'Studio edited goal' || errors.length) throw new Error(JSON.stringify({ goal, errors }))
  console.log(JSON.stringify({ ok: true, goal, reactComp: 'promotionReportPanel', sqlRows: 'active_promos', screenshot: out }, null, 2))
} finally {
  await browser.close()
}
