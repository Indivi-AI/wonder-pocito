import { jb, dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import '@jb6/core/misc/pretty-print.js'
import '@wonder-admin/finance/v3/ai/verified-reports.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const compCode = fullId => coreUtils.prettyPrintComp(coreUtils.compByFullId(fullId), { tgpModel: jb })
const REPORT_DEF_CODE = `Data('finance3ProductEconomics.finance3', {
  description: 'Product economics: product revenue, cost, margin, payment expense and commercial profitability with predefined query and UI.',
  whenToUse: 'Product revenue, cost, margin, payment expense or commercial profitability',
  params: [
    {id: 'id', as: 'string'}
  ],
  impl: wGet('package://57235?id=%$id%')
})`
const productEconomicsCode = [REPORT_DEF_CODE, compCode('react-comp<react>finance3ProductEconomics.reportView.finance3')].join('\n\n')

const COLS = 'product,customer_type,payment_channel,gross_value,completed_value,estimated_cost,gross_margin,payment_fees,txns'.split(',')
const jan2025Rows = `Smartphone|Consumer|Wallet|2581641.2|1182360.84|3633010|-40.72|87775.8|47
Coffee Machine|Enterprise|Wallet|1549736.02|1934583.1|519840|66.46|52691.02|37
Tablet|SMB|Card|1429948.01|212249.01|1844080|-28.96|41468.49|38
Tablet|Consumer|Wallet|1415770.23|658812.01|2699200|-90.65|48136.19|46
Laptop|SMB|Wallet|1248231.39|129164.57|4590480|-267.76|42439.87|36
Coffee Machine|SMB|Wallet|1200303.64|1371460.51|558125|53.5|40810.32|37
Tablet|Enterprise|Wallet|1110321.98|880671.94|1441440|-29.82|37750.95|42
Smartphone|Consumer|Card|1046863.05|762284.54|3501400|-234.47|30359.03|36
Coffee Machine|Consumer|Wallet|1009093.73|608900.73|607620|39.79|34309.19|35
Headphones|SMB|Card|889595.99|244802.06|367785|58.66|25798.28|52
Smartphone|SMB|Card|780726.51|457678.6|2255820|-188.94|22641.07|45
Headphones|Enterprise|Wallet|729818.75|869973.67|344135|52.85|24813.84|41
Coffee Machine|Enterprise|Card|724807.3|1230842.68|703000|3.01|21019.41|42
Laptop|Enterprise|Wallet|674733.11|847429.78|5852800|-767.42|22940.93|43
Coffee Machine|Consumer|Offline|558792.23|552001.57|146775|73.73|0|17
Laptop|SMB|Card|537048.78|167046.09|5870780|-993.16|15574.41|40
Smartphone|SMB|Offline|482969.23|264401.26|454690|5.86|0|19
Laptop|Consumer|Wallet|312644.55|184738.45|4465860|-1328.41|10629.91|50
Smartphone|SMB|Wallet|264014.82|-309297.96|2489520|-842.95|8976.5|39
Headphones|Consumer|Card|247131.02|-283799.71|399960|-61.84|7166.8|40
Coffee Machine|SMB|Card|218298.01|-200966.62|858515|-293.28|6330.64|42
Headphones|Consumer|Wallet|208782.4|-180933.27|285010|-36.51|7098.6|36
Headphones|Enterprise|Offline|161704.26|33421.53|267135|-65.2|0|16
Laptop|SMB|Offline|127839.87|449387.82|965340|-655.12|0|12
Headphones|SMB|Offline|101625.05|-3927.08|34100|66.45|0|15
Tablet|Consumer|Offline|101287.07|122.09|286160|-182.52|0|17
Tablet|SMB|Offline|98466.77|-12462.57|52080|47.11|0|12
Coffee Machine|Enterprise|Offline|21837.97|-62167.27|204440|-836.17|0|16
Headphones|Consumer|Offline|15731.57|14508.98|73590|-367.79|0|15
Laptop|Enterprise|Card|-18391.22|-1622876.58|6109480|33319.55|-533.35|38
Smartphone|Enterprise|Wallet|-97292.95|-357553.49|2120930|2279.94|-3307.96|33
Coffee Machine|Consumer|Card|-153445.21|-480090.62|574845|474.63|-4449.91|39
Smartphone|Enterprise|Card|-174452.23|569909.51|4027430|2408.61|-5059.11|45
Laptop|Consumer|Offline|-353260.53|3450.5|918840|360.1|0|9
Coffee Machine|SMB|Offline|-382935.42|-195708.1|133475|134.86|0|15
Smartphone|Consumer|Offline|-384019.26|-218848.45|2128310|654.22|0|11
Tablet|Enterprise|Offline|-672279.06|-454434.9|416920|162.02|0|15
Laptop|Enterprise|Offline|-976909.07|-735596.52|2373980|343.01|0|12
Laptop|Consumer|Card|-1032106.05|-505562.52|3785720|466.8|-29931.08|45
Headphones|Enterprise|Card|-1136882.87|-835860.39|325380|128.62|-32969.6|48
Tablet|SMB|Wallet|-1231104.57|-891876.54|1829520|248.61|-41857.56|41
Headphones|SMB|Wallet|-1349939.32|-1068404.51|350020|125.93|-45897.94|40
Tablet|Enterprise|Card|-1868256.24|-631030.82|2025800|208.43|-54179.43|32
Smartphone|Enterprise|Offline|-1982704.27|-751218.33|1529710|177.15|0|17
Tablet|Consumer|Card|-2030124.36|-1111620.3|1295000|163.79|-58873.61|37`
  .split('\n').map(line => Object.fromEntries(line.split('|').map((cell, i) => [COLS[i], i > 2 ? +cell : cell])))

const VERIFIED_BADGE = 'https://upload.wikimedia.org/wikipedia/commons/e/e4/Twitter_Verified_Badge.svg'
const win = (h, title, body) => h('div:win', {}, h('div:chrome', {}, h('i'), h('i'), h('i'), title), body)
const CSS = `.vr-report{overflow:auto;padding:12px;font-size:14px;line-height:1.45}
.reveal .vr-report h2,.reveal .vr-report h3{color:#172033;line-height:1.25}
.idf-deck .reveal .slides .vr-report section{height:auto}`

ReactComp('idfVerifiedReportsViz', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState } }) => () => {
      const [view, setView] = useState('preview')
      return h('div:iv', {}, h('style', {}, CSS), h('div:iv-title', {}, 'Verified Reports'),
        h('div:iv-sub', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
          h('img', { src: VERIFIED_BADGE, width: 28, height: 28, alt: '' }),
          'Pre Built UI and parameterized Queries that can be used by AI'),
        h('div:toggle', {}, ...['preview', 'code'].map(id =>
          h('button', { key: id, className: view == id ? 'on' : '', onClick: () => setView(id) }, id))),
        view == 'preview'
          ? h('div:applet-frame vr-report', {},
              hh(ctx, dsls.react['react-comp']['finance3ProductEconomics.reportView.finance3'], { rows: jan2025Rows }))
          : win(h, 'admin/finance/v3/ai/verified-reports.js', h('pre:code-pane', {}, productEconomicsCode)))
    }
  })
})
