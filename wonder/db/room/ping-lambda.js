import { dsls } from '@jb6/core'
import './room-lambda-dsl.js'

const { common: { Lambda, data: { asIs } } } = dsls

Lambda('ping', { permissionByPath: 'usersRO', impl: asIs({ pong: true, lambdaMarker: 'room-tests-codex-2026-08-11' }) })
