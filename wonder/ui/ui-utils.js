import { jb } from '@jb6/core'

jb.wonderUtils ||= {}

const isLocalRuntime = ctx => ctx?.vars.isLocalHost !== undefined ? ctx.vars.isLocalHost
  : !!(globalThis.location?.hostname === 'localhost' || globalThis.location?.hostname?.startsWith('192.168'))

const createShortUrl = async (longUrl, alias, ctx) => {
  const baseUrl = location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://share.indivi.ai'
  if (isLocalRuntime(ctx)) {
    const url = new URL(longUrl), hashParams = new URLSearchParams(url.hash.slice(1))
    hashParams.delete('noAuth')
    longUrl = `${url.origin}/wonder.html${url.search}${hashParams.size ? `#${hashParams}` : ''}`
  }
  try {
    const response = await fetch(`${baseUrl}/create-url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: longUrl, alias })
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return `${baseUrl}/s/${(await response.json()).shortUrl}`
  } catch (error) {
    ctx?.vars.errorLogger?.error?.({t: 'createShortUrlFailed'}, {}, {ctx, error})
    return longUrl
  }
}

const shareHandler = async shareData => {
  globalThis.lastShare = shareData
  if (navigator.share) return navigator.share(shareData)
}

Object.assign(jb.wonderUtils, { createShortUrl, shareHandler })
