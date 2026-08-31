// Dedicated flapi proxy server. Storage remains external; default port is 6001.
import { pathToFileURL } from 'node:url'
import { createFlapiApp } from '../flapi-proxy.js'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  (await createFlapiApp()).listen(Number(process.env.PORT || 58047), '0.0.0.0')
