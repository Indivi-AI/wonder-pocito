import { dsls } from '@jb6/core'
import '@jb6/common'

const { common: { Data } } = dsls

Data('wonderPlatformFlapiRequest', {
  params: [
    {id: 'method', as: 'string', defaultValue: 'GET'},
    {id: 'path', as: 'string', mandatory: true},
    {id: 'body', as: 'object'},
    {id: 'flapiBaseUrl', as: 'string', mandatory: true}
  ],
  impl: async ({}, {}, {method, path, body, flapiBaseUrl}) => (await fetch(`${flapiBaseUrl}${path}`, {method,
    ...(body != null ? {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {})})).json()
})

const { wonderPlatformFlapiRequest } = dsls.common.data

Data('wonderPlatformFlapiCall', {
  params: [
    {id: 'operation', as: 'string', mandatory: true},
    {id: 'packageId', as: 'string'},
    {id: 'partial', as: 'string'},
    {id: 'body', as: 'object'},
    {id: 'flapiBaseUrl', as: 'string'},
    {id: 'request', dynamic: true, defaultValue: wonderPlatformFlapiRequest('%$method%', '%$path%', {
      body: '%$body%',
      flapiBaseUrl: '%$flapiBaseUrl%'
    })}
  ],
  impl: (ctx, {}, {operation, packageId, partial, body, flapiBaseUrl, request}) => {
    const routes = {
      search: ['GET', `/package/v1/search/${encodeURIComponent(partial || '')}`],
      quick: ['GET', `/package/v1/quick/${encodeURIComponent(packageId || '')}`],
      metadata: ['GET', `/package/v2/${encodeURIComponent(packageId || '')}`],
      run: ['POST', `/package/v3/${encodeURIComponent(packageId || '')}`]
    }
    const [method, path] = routes[operation]
    return request(ctx.setVars({method, path, body, flapiBaseUrl}))
  }
})
