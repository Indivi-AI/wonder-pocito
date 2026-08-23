import { reactUtils } from './react-utils.js'
import './automation.js'

Object.assign(reactUtils, {probeReactComp, prettyPrintNode})

async function probeReactComp(ctx, reactCmp) {
  const win = globalThis.window
  if (!win) return {error: 'probeReactComp: no global window'}
  const host = win.document.createElement('div')
  reactUtils.installMutationObserver(win)
  reactUtils.createRoot(host).render(reactUtils.hh(ctx, reactCmp))
  await win.waitForMutations(10)
  const result = prettyPrintNode(host)
  host.remove()
  return result
}

function prettyPrintNode(node, indent = 0) {
  const pad = ' '.repeat(indent)
  return [...(node?.childNodes || [])].map(child => {
    if (child.nodeType === Node.TEXT_NODE) return child.textContent.trim() && `${pad}${child.textContent.trim()}\n`
    if (child.nodeType !== Node.ELEMENT_NODE) return ''
    const tag = child.tagName.toLowerCase(), attrs = [...child.attributes].map(a => ` ${a.name}="${a.value}"`).join('')
    const children = [...child.childNodes].filter(n => n.nodeType !== Node.TEXT_NODE || n.textContent.trim())
    if (!children.length) return `${pad}<${tag}${attrs}></${tag}>\n`
    if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE)
      return `${pad}<${tag}${attrs}>${children[0].textContent.trim()}</${tag}>\n`
    return `${pad}<${tag}${attrs}>\n${prettyPrintNode(child, indent + 2)}${pad}</${tag}>\n`
  }).join('')
}
