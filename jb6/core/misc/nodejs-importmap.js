import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./packages/core/misc/nodejs-importmap-loader.js', pathToFileURL('./'))