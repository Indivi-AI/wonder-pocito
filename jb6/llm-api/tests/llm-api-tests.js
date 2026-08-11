import { coreUtils, dsls, ns, jb } from '@jb6/core'
import '@jb6/llm-api/tests/llm-api-tester.js'

const {
  tgp: { TgpType },
  common: { Data, Action, Boolean,
    data: { pipeline, filter, join, property, obj, delay, asIs, pipe, list }, 
    Boolean: { contains, equals, and, notContains },
    Prop: { prop }
  },
  'llm-api': { Prompt,
    prompt: { prompt, user, system, includeBooklet, includeFiles },
    model: {llama_33_70b_versatile, claude_code_sonnet_4, sonnet_4, opus_4, claude3Haiku, gemini_2_5_flash, gemini_2_5_pro, gemini_2_5_flash_lite_preview, gemini_2_0_flash, gemini_1_5_flash, gemini_1_5_flash_8b, gemini_1_5_pro, o1, o1_mini, o4_mini, gpt_4o, gpt_4o_mini, gpt_35_turbo_0125, gpt_35_turbo_16k}
  },
  test: { Test, 
    test: { llmTest, dataTest }
  }
} = dsls
const { llm } = ns

Test('llmTest.hello', {
  HeavyTest: true,
  impl: llmTest(prompt(system('please answer very shortly'), user('say "israel"')), contains('srael'), {
    maxTokens: '2'
  })
})

Test('llmTest.hello.withCache', {
  HeavyTest: true,
  impl: llmTest(prompt(system('please answer very shortly'), user('say "USA"')), contains('USA'), {
    maxTokens: '10',
    useLocalStorageCache: true
  })
})
