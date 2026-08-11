import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
// re-register the single source-of-truth loader (path math lives there, keyed to its own __dirname).
// container overrides the relative dev path via COLS_CACHE_LOADER (absolute path to public/core/nodejs-importmap-loader.js).
register(process.env.COLS_CACHE_LOADER
  ? pathToFileURL(process.env.COLS_CACHE_LOADER).href
  : '../../../public/core/nodejs-importmap-loader.js', import.meta.url)
