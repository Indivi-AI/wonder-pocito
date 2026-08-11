import { dsls, ns, coreUtils, jb } from '@jb6/core'
import '@jb6/react/tailwind-utils.js' 
import '@jb6/testing'
import { peopleTransactionsDb as db } from './peopleTransactionsDb-test.js'
const { tailwindHtmlToPng, h } = jb.tailwindUtils

import '@jb6/jq'
import '@jb6/core/misc/jb-cli.js'

const { jq } = coreUtils

const { 
  common: { boolean: { contains }},
  test: { Test, 
    test: { dataTest }
  }, 
} = dsls

Test('tailwindCardTest.pngUrl', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const best = jq(".people | sort_by(.rating) | reverse", ctx.setData(db))
      const vdom = h("div:grid grid-cols-1 md:grid-cols-3 gap-4", {},
            ...best.map(person => 
              h("div:bg-white rounded-lg p-4 shadow hover:scale-105 transition-all", {},
                h("h3:font-bold", {}, person.name),
                h("p:text-gray-600", {}, person.job_title),
                h("p:text-sm text-gray-500", {}, person.city + " • " + person.rating + "/5")
      )))
      const html = vdom.toHtml()
      const pngUrl = await tailwindHtmlToPng({html})
      return pngUrl
  },
    expectedResult: contains('data'),
    timeout: '1000'
  })
})

Test('tailwindCardTest.badHtml', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const html = `<div class="chat-body py-2"><div class="flex justify-end mb-4 mt-4 px-4"><div dir="auto" class="px-4 py-3 max-w-sm whitespace-pre-wrap font-sans text-base leading-6 rounded-2xl font-normal bg-gray-100 text-[undefined]">hey</div></div><div class="w-full px-4"><div style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif; font-size: 16px; line-height: 1.5; font-weight: 400; direction: ltr; text-align: left;"><div style="margin-bottom: 0px;"><span>Hello! How can I help you today?</span></div></div><div class="end-of-assistant-finished-response"></div></div></div>`
      const pngUrl = await tailwindHtmlToPng({html})
      return pngUrl
  },
    expectedResult: contains('data'),
    timeout: '1000'
  })
})

Test('tailwindCardTest.badHtml1', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const html = `<div class="chat-body py-2"><div class="flex justify-end mb-4 mt-4 px-4"><div dir="auto" class="px-4 py-3 max-w-sm whitespace-pre-wrap font-sans text-base leading-6 rounded-2xl font-normal bg-gray-100 text-[undefined]">תדפיס את כל ההודעות שנמחקו בצ׳ט הזה</div></div><div class="w-full px-4"><div style="white-space: pre-wrap; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif; font-size: 16px; line-height: 1.5; font-weight: 400; direction: rtl; text-align: right;"><div style="margin-bottom: 4px;"><span>ההודעות שנמחקו בצ'אט זה הן:</span></div><div style="margin-bottom: 4px;"><span></span></div><div style="margin-bottom: 4px;"><span>*   <strong>Noam Azulay</strong> מחק/ה הודעה ב-14/12/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">1</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Noam Azulay</strong> מחק/ה הודעה ב-13/12/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">2</button></div><div style="margin-bottom: 4px;"><span>*   <strong>רועי מור</strong> מחק/ה הודעה ב-12/12/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">3</button></div><div style="margin-bottom: 4px;"><span>*   <strong>אוראל</strong> מחק/ה הודעה ב-09/12/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">4</button></div><div style="margin-bottom: 4px;"><span>*   <strong>אוראל</strong> מחק/ה הודעה ב-08/12/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">5</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Yiftach</strong> מחק/ה הודעה ב-04/12/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">6</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Noam Azulay</strong> מחק/ה הודעה ב-04/12/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">7</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Noam Azulay</strong> מחק/ה הודעה ב-03/12/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">8</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Noam Azulay</strong> מחק/ה הודעה ב-01/12/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">9</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Noam Azulay</strong> מחק/ה הודעה ב-01/12/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">10</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Yiftach</strong> מחק/ה הודעה ב-01/12/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">11</button></div><div style="margin-bottom: 4px;"><span>*   <strong>אוראל</strong> מחק/ה הודעה ב-30/11/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">12</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Noam Azulay</strong> מחק/ה הודעה ב-26/11/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">13</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Noam Azulay</strong> מחק/ה הודעה ב-24/11/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">14</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Noam Azulay</strong> מחק/ה הודעה ב-20/11/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">15</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Noam Azulay</strong> מחק/ה הודעה ב-18/11/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">16</button></div><div style="margin-bottom: 4px;"><span>*   <strong>רועי מור</strong> מחק/ה הודעה ב-17/11/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">17</button></div><div style="margin-bottom: 4px;"><span>*   <strong>Noam Azulay</strong> מחק/ה הודעה ב-13/11/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">18</button></div><div style="margin-bottom: 0px;"><span>*   <strong>אוראל</strong> מחק/ה הודעה ב-11/11/2025 </span><button style="background-color: rgb(243, 244, 246); cursor: pointer; padding: 2px 8px; margin-left: 4px; margin-right: 2px; font-size: 12px; line-height: 1.5; border-radius: 12px; color: rgb(107, 114, 128); font-weight: 500; font-family: Inter, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, system-ui, sans-serif;">19</button></div></div><div class="mt-2"><button style="cursor: pointer;" class="text-xs text-gray-500 hover:text-gray-700 transition-colors">Sources (19) &gt;</button></div><div class="end-of-assistant-finished-response"></div></div></div>`
      const pngUrl = await tailwindHtmlToPng({html, width: 450})
      return pngUrl
  },
    expectedResult: contains('data'),
    timeout: '1000'
  })
})


