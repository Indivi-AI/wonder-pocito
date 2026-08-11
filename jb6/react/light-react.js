// LightReactComp — minimal reactive runtime for static product pages
// No React, no virtual DOM, no diffing. Just DOM creation + setState reactivity.

const state = {}
const comps = {}
let _rerender = null

function setState(key, value) {
  state[key] = value
  if (_rerender) _rerender()
  else document.querySelectorAll('[data-show-when]').forEach(el => {
    try { el.style.display = evaluate(el.dataset.showWhen) ? '' : 'none' } catch(e) {}
  })
}

const evaluate = expr => Function(...Object.keys(state), `return (${expr})`)(...Object.values(state))

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  children = children.flat(Infinity).filter(x => x != null && x !== false)
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'style' && typeof v === 'object')
      Object.assign(el.style, v)
    else if (k.startsWith('on') && typeof v === 'function')
      el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k.startsWith('data-'))
      el.setAttribute(k, v)
    else if (k === 'className')
      el.className = v
    else
      el.setAttribute(k, v)
  }
  for (const child of children)
    el.append(typeof child === 'object' ? child : document.createTextNode(String(child)))
  return el
}

// dynamic: true support — wrap param value as deferred function
function resolveParams(paramDefs, values, ctx) {
  return Object.fromEntries(paramDefs.map(p => [p.id,
    p.dynamic ? (dynamicCtx) => {
      const mergedCtx = dynamicCtx ? { ...ctx, data: dynamicCtx.data ?? ctx.data, vars: { ...ctx.vars, ...dynamicCtx.vars } } : ctx
      const raw = values[p.id] ?? p.defaultValue
      return typeof raw === 'function' ? raw(mergedCtx) : coerce(p, raw)
    } : coerce(p, values[p.id] ?? p.defaultValue)
  ]))
}

function coerce(param, value) {
  if (value == null) return param.as === 'string' ? '' : param.as === 'number' ? null : param.as === 'array' ? [] : value
  if (param.as === 'string') return '' + value
  if (param.as === 'number') return Number(value)
  if (param.as === 'boolean') return !!value && value !== 'false'
  if (param.as === 'array') return Array.isArray(value) ? value : [value]
  return value
}

function LightReactComp(id, { params = [], impl }) {
  comps[id] = { params, impl }
}

function lightComp({ hFunc, componentDidMount }) {
  const impl = hFunc
  impl.componentDidMount = componentDidMount
  return impl
}

function mount(compId, targetEl, props = {}) {
  const comp = comps[compId]
  if (!comp) throw new Error(`LightReactComp '${compId}' not found`)
  _rerender = () => {
    const ctx = { data: props, vars: { h, setState, state } }
    const resolvedArgs = resolveParams(comp.params, {}, ctx)
    const dom = comp.impl(ctx, ctx.vars, resolvedArgs)(props)
    targetEl.innerHTML = ''
    targetEl.append(dom)
    if (comp.impl.componentDidMount) comp.impl.componentDidMount(ctx, { ...ctx.vars, topElem: dom })
  }
  _rerender()
}

export { h, setState, state, LightReactComp, lightComp, mount, evaluate, resolveParams }
