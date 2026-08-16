import { dsls } from '@jb6/core'
import './wonder-mcp-tools.js'

const { mcp: { Tool, tool } } = dsls

Tool('uploadRoomLambdaOnPrem', {
  description: 'Publish a room lambda to the MinIO-backed on-prem environment.',
  params: [
    {id: 'lambdaId', as: 'string'},
    {id: 'roomId', as: 'string'},
    {id: 'entryPath', as: 'string'}
  ],
  impl: (ctx, {}, args) => tool.uploadRoomLambda.$runWithCtx(ctx, args)
})

Tool('uploadRoomAppletOnPrem', {
  description: 'Publish a React room applet and its browser closure to the MinIO-backed on-prem environment.',
  params: [
    {id: 'roomId', as: 'string'},
    {id: 'entryPath', as: 'string'},
    {id: 'entryCompFullId', as: 'string'},
    {id: 'ogTitle', as: 'string'},
    {id: 'ogDescription', as: 'string'},
    {id: 'ogImage', as: 'string'},
    {id: 'ogImageLocalPath', as: 'string'}
  ],
  impl: (ctx, {}, args) => tool.uploadRoomApplet.$runWithCtx(ctx, args)
})

Tool('updateLambdasAndAppletsOnPrem', {
  description: 'Refresh every lambda and applet in an on-prem room from current source.',
  params: [{id: 'roomId', as: 'string', mandatory: true}],
  impl: (ctx, {}, args) => tool.updateLambdasAndApplets.$runWithCtx(ctx, args)
})
