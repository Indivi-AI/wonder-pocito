import { dsls } from '@jb6/core'
import '@wonder/db/room-lambda-def.js'

const { common: { Lambda, data: { asIs } } } = dsls

Lambda('ping', {
  impl: asIs({pong: true, lambdaMarker: 'room-tests-codex-2026-08-11'})
})
