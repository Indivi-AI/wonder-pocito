import { dsls } from '@jb6/core'

const { common: { Data } } = dsls

Data('pocitoAgnoChatContinuation', {
  params: [
    {id: 'baseUrl', as: 'string', defaultValue: '%$agnoTestBaseUrl%'},
    {id: 'model', as: 'string', defaultValue: '%$agnoTestModel%'}
  ],
  impl: async (ctx, {agentOsLogger}, {baseUrl, model}) => {
    const {execFile} = await import('node:child_process'), {promisify} = await import('node:util')
    const {existsSync} = await import('node:fs'), {join, resolve} = await import('node:path')
    const {fileURLToPath} = await import('node:url'), pocito = fileURLToPath(new URL('../', import.meta.url))
    const venvs = process.env.POCITO_DEPS_DIR ? join(process.env.POCITO_DEPS_DIR, 'venvs')
      : existsSync('/opt/pocito/venvs/agno-server/bin/python') ? '/opt/pocito/venvs'
      : join(resolve(pocito, process.env.POCITO_DATA_DIR || '.local-data'), 'venvs')
    const env = {...process.env, OPENAI_BASE_URL: baseUrl || process.env.OPENAI_BASE_URL
      || `${(process.env.LITELLM_HOST || 'http://localhost:4000').replace(/\/(v1\/?)?$/, '')}/v1`,
      OPENAI_MODEL: model || process.env.OPENAI_MODEL || 'chat', OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'unused'}
    const {stdout} = await promisify(execFile)(join(venvs, 'agno-server/bin/python'),
      [join(pocito, 'on-prem/vllm-repro/test_application.py')], {env, timeout: 360000})
    const result = {nonStreaming: stdout.includes('stream=False;'), streaming: stdout.includes('stream=True;')}
    agentOsLogger?.info?.({t: 'agnoChatContinuation', ...result, output: stdout.trim()}, {}, {ctx})
    return result
  }
})
