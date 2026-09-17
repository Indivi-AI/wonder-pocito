import { dsls } from '@jb6/core'
import '@wonder/db/db-drivers.js'
import './wonder-platform-agent-wurl.js'

const { common: { data: { wonderPlatformWUrlResponse } },
  wonder: { DbDriverInterceptor, 'db-driver-interceptor': { dbDriverInterceptor } } } = dsls
DbDriverInterceptor('wonderPlatformMarketplace', {
  impl: dbDriverInterceptor({
    whenAndWhyToUse: 'Route marketplace resources and harness-selected agents through their runtime adapters.',
    designConcerns: 'The singular agent path is runtime-only; plural agents remains the Swagger CRUD resource.',
    pre: wonderPlatformWUrlResponse('%$url%', '%$fileName%', {
      opts: '%$opts%',
      baseUrl: '%$marketplaceBaseUrl%',
      agnoBaseUrl: '%$agnoBaseUrl%'
    })
  })
})
