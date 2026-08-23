import { dsls } from '@jb6/core'

const { 
  'llm-api' : { Model, Provider,
    model: { model },
    provider: { providerByApi, providerByCli }
   }
} = dsls

const openAI = Provider('openAI', {
  impl: providerByApi('openAI', 'OPENAI_API_KEY', {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: ({},{apiKey}) => ({Authorization: `Bearer ${apiKey}`, Accept: 'application/text' }),
    useProxy: true
  })
})

const anthropic = Provider('anthropic', {
  impl: providerByApi('anthropic', 'ANTHROPIC_API_KEY', {
    url: 'https://api.anthropic.com/v1/messages',
    headers: ({},{apiKey}) => ({'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
    useProxy: true
  })
})

const gemini = Provider('gemini', {
  impl: providerByApi('gemini', 'GEMINI_API_KEY', {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/%$model%:generateContent',
    headers: ({},{apiKey}) => ({'Content-Type': 'application/json', 'x-goog-api-key': apiKey }),
    useProxy: true
  })
})

const groq = Provider('groq', {
  impl: providerByApi('groq', 'GROK_API_KEY', {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: ({},{apiKey}) => ({'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }),
    useProxy: true
  })
})

// CLI version using the working Gemini CLI

const claudeCode = Provider('claudeCode', {
  impl: providerByCli({
    name: 'anthropic',
    cli: `mkdir -p /tmp/clean && cd /tmp/clean && echo '%$prompt%' | claude -p --model %$model% --output-format stream-json --verbose`,
    processResult: ({data}) => data.split('\n').filter(Boolean).map(x=>JSON.parse(x)).map(x=>x.message).filter(Boolean).filter(x=>x.type == 'message').flatMap(x=>x.content).map(x=>x.text).filter(Boolean).join('##\n')
      //JSON.stringify(data.split('\n').filter(Boolean).map(x=>JSON.parse(x)).filter(x=>x.type == 'result' || x.type == 'message'))
  })
})

const geminiCli = Provider('geminiCli', {
  impl: providerByCli('gemini-cli', `mkdir -p /tmp/clean && cd /tmp/clean && echo '%$prompt%' | gemini -p --model %$model%`)
})



Model('llama_guard_4_12b', {
  description: 'cheap(0.59~0.79) very fast(~300), excellent reasoning',
  impl: model('meta-llama/llama-guard-4-12b', {
    price: [0.59,0.79],
    provider: groq(),
    bestFor: 'Cost-effective high-quality tasks: code generation, business analysis, jq queries, React components, reasoning tasks, data processing, content generation with excellent quality at low cost',
    doNotUseFor: 'Tasks requiring absolute maximum intelligence, multimodal processing, very long context reasoning (>100k tokens effectively)',
    reasoning: true,
    codingScore: 82,
    mathScore: 85,
    contextWindow: 128000,
    responseSpeed: 300,
    latency: 0.3,
    factualAccuracy: 82
  })
})

Model('llama_33_70b_versatile', {
  description: 'cheap(0.59~0.79) very fast(~300), excellent reasoning',
  impl: model('llama-3.3-70b-versatile', {
    price: [0.59,0.79],
    provider: groq(),
    bestFor: 'Cost-effective high-quality tasks: code generation, business analysis, jq queries, React components, reasoning tasks, data processing, content generation with excellent quality at low cost',
    doNotUseFor: 'Tasks requiring absolute maximum intelligence, multimodal processing, very long context reasoning (>100k tokens effectively)',
    reasoning: true,
    codingScore: 82,
    mathScore: 85,
    contextWindow: 128000,
    responseSpeed: 300,
    latency: 0.3,
    factualAccuracy: 82
  })
})

Model('gpt_oss_120b', {
  description: 'medium price(0.15~0.75) very fast(~540), excellent reasoning, open-weight MoE',
  impl: model('openai/gpt-oss-120b', {
    price: [0.15, 0.75], // $0.15 input, $0.75 output per M tokens on Groq
    provider: groq(),
    bestFor: 'High-reasoning tasks requiring transparency: advanced coding, mathematical reasoning, research applications, agentic workflows, function calling, chain-of-thought debugging, scientific analysis, custom fine-tuning scenarios',
    doNotUseFor: 'Multimodal tasks (text-only model), ultra-high-volume production without caching, tasks requiring maximum safety alignment, creative writing where proprietary models excel',
    reasoning: true,
    codingScore: 87.3, // HumanEval pass rate
    mathScore: 96.6, // AIME 2025 score 
    contextWindow: 128000, // 128K tokens
    responseSpeed: 540, // tokens/sec on Groq infrastructure
    latency: 0.20, // TTFT in seconds from Baseten benchmarks
    factualAccuracy: 94.2, // MMLU score
    architecture: 'MoE', // Mixture of Experts
    totalParameters: 117000000000, // 117B total parameters
    activeParameters: 5100000000, // 5.1B active per forward pass
    layers: 36,
    experts: 128, // with Top-4 routing
    license: 'Apache-2.0',
    chainOfThought: true, // Full CoT transparency
    toolUse: true, // Native function calling and structured outputs
    openWeight: true // Can be downloaded and run locally
  })
})

// Updated Gemini models with current working API names (July 2025)

Model('gemini_2_5_flash', {
  description: 'medium price(0.15~0.60) fast(285), reasoning',
  impl: model('gemini-2.5-flash', { 
    price: [0.15, 0.60], // Validated: $0.15 input, $0.60 output (non-thinking)
    provider: geminiCli(),
    bestFor: 'High-volume production tasks requiring reasoning: real-time chatbots, coding assistance, large-scale data analysis, content generation with thinking capabilities, interactive applications',
    doNotUseFor: 'Ultra-high complexity reasoning tasks that need maximum intelligence, budget-sensitive projects (more expensive than 2.0 Flash), tasks requiring stable production models',
    reasoning: true,
    mathScore: 78.0, // AIME 2025 - cited from search results
    contextWindow: 1000000, // 1M tokens verified
    responseSpeed: 285.1, // tokens/sec from Artificial Analysis
    latency: 0.33, // seconds TTFT from Artificial Analysis
    factualAccuracy: 80.9 // MMLU score from Artificial Analysis
  })
})

Model('gemini_2_5_pro', {
  description: 'expensive(1.25~10) slow(145), max intelligence',
  impl: model('gemini-2.5-pro', { // Updated: stable model name (no "preview")
    price: [1.25, 10], // Validated from official Google pricing
    provider: geminiCli(), 
    bestFor: 'Complex reasoning tasks: advanced math, science, STEM problems, large codebase analysis (1M+ tokens), deep research, complex coding projects, agentic applications requiring highest intelligence',
    doNotUseFor: 'Simple Q&A, basic content generation, cost-sensitive projects, high-frequency/low-complexity tasks, real-time applications requiring fast responses',
    reasoning: true,
    codingScore: 63.2, // SWE-bench Verified - validated from multiple sources
    contextWindow: 1000000, // 1M tokens
    responseSpeed: 145.2, // tokens/sec from Artificial Analysis
    latency: 36.47 // seconds TTFT from Artificial Analysis (high due to thinking)
  })
})

Model('gemini_2_5_flash_lite_preview', {
  description: 'cheap(0.075~0.30) fastest(250), lite reasoning',
  impl: model('gemini-2.5-flash-lite-preview-06-17', { // Added: current preview model
    price: [0.075, 0.30], // Lower cost model
    provider: geminiCli(),
    bestFor: 'Cost-efficient, high-throughput tasks with reasoning: basic chatbots with thinking, simple content generation, translation, summarization, classification at scale',
    doNotUseFor: 'Complex reasoning, multimodal tasks requiring high accuracy, detailed analysis, creative writing, advanced coding projects',
    reasoning: true, // Flash-Lite is a reasoning model but optimized for speed
    contextWindow: 1000000,
    responseSpeed: 250.0, // Optimized for speed
    latency: 0.25 // Lower latency than regular 2.5 models
  })
})

Model('gemini_2_0_flash', {
  description: 'cheap(0.1~0.4) fast(205), multimodal',
  impl: model('gemini-2.0-flash', { 
    price: [0.1, 0.4], // Validated pricing
    provider: geminiCli(), 
    bestFor: 'Balanced multimodal tasks: agent applications, tool use, real-time video/audio processing, general-purpose coding, content generation, balanced speed and quality needs',
    doNotUseFor: 'Complex reasoning requiring deep analysis, highest accuracy requirements, tasks needing extended thinking, ultra-low-cost applications',
    reasoning: false,
    contextWindow: 1000000, // 1M tokens
    responseSpeed: 205.5, // tokens/sec from Artificial Analysis
    latency: 0.36 // seconds TTFT from Artificial Analysis
  })
})

// Note: Gemini 1.5 models are being deprecated for new projects as of April 29, 2025
// Only available for existing projects with prior usage

Model('gemini_1_5_flash', {
  description: 'cheap(0.075~0.3) fast(175), deprecated',
  impl: model('gemini-1.5-flash', { 
    price: [0.075, 0.3], // Validated pricing
    provider: geminiCli(), 
    bestFor: 'Fast multimodal processing: real-time chat, document summarization, image/video captioning, data extraction from long documents, customer service automation',
    doNotUseFor: 'Complex reasoning tasks, detailed analysis requiring nuance, creative writing, advanced problem-solving, tasks needing highest accuracy. NOT available for new projects.',
    reasoning: false,
    codingScore: 71.5, // HumanEval verified from search results
    factualAccuracy: 77.9, // MMLU validated from search results
    contextWindow: 1000000,
    responseSpeed: 175.6, // tokens/sec from Artificial Analysis
    latency: 0.31, // seconds TTFT from Artificial Analysis
    deprecated: true // Added flag for deprecated models
  })
})

Model('gemini_1_5_flash_8b', {
  description: 'ultra-cheap(0.037~0.15) fast, deprecated',
  impl: model('gemini-1.5-flash-8b', { 
    price: [0.0375, 0.15], // Validated pricing
    provider: geminiCli(), 
    bestFor: 'Ultra-low-cost, high-speed tasks: simple classification, basic translation, lightweight chat, transcription, simple content generation at massive scale',
    doNotUseFor: 'Complex multimodal tasks, detailed reasoning, creative content, advanced coding, any task requiring deep understanding or nuanced responses. NOT available for new projects.',
    reasoning: false,
    contextWindow: 1000000,
    deprecated: true // Added flag for deprecated models
  })
})

Model('gemini_1_5_pro', {
  description: 'expensive(1.25~5) slow(90), 2M context, deprecated',
  impl: model('gemini-1.5-pro', { 
    price: [1.25, 5], // Validated pricing
    provider: geminiCli(), 
    bestFor: 'Long-context analysis: processing extensive documents (2M tokens), detailed code analysis, complex reports, legal document analysis, comprehensive research tasks',
    doNotUseFor: 'Simple tasks where speed matters more than depth, real-time applications, cost-sensitive high-volume tasks, basic Q&A. NOT available for new projects.',
    reasoning: false,
    contextWindow: 2000000, // 2M tokens verified
    responseSpeed: 90.1, // tokens/sec from Artificial Analysis
    latency: 0.58, // seconds TTFT from Artificial Analysis
    deprecated: true // Added flag for deprecated models
  })
})

// CLAUDE MODELS - Only scores with direct citations included

Model('claude_code_sonnet_4', {
  description: 'expensive(3~15) slow(82), top coding, agentic',
  impl: model('claude-sonnet-4-20250514', { 
    price: [3, 15], // Validated from Anthropic API pricing
    provider: claudeCode(), 
    bestFor: 'Agentic coding workflows: file editing, command execution, complex coding projects, debugging, refactoring, tool-integrated development tasks',
    doNotUseFor: 'Simple text generation, basic Q&A, tasks not requiring file system access, non-coding applications, cost-sensitive projects',
    reasoning: true,
    factualAccuracy: 86.5, // MMLU validated from search results
    codingScore: 72.7, // SWE-bench Verified - extensively validated
    mathScore: 70.5, // AIME benchmark from search results
    contextWindow: 200000, // 200K tokens verified
    responseSpeed: 82.1, // tokens/sec from Artificial Analysis
    latency: 1.49 // seconds TTFT from Artificial Analysis
  })
})

Model('sonnet_4', {
  description: 'expensive(3~15) slow(82), top coding, reasoning',
  impl: model('claude-sonnet-4-20250514', { 
    price: [3, 15], // Validated from multiple sources
    provider: anthropic(), 
    bestFor: 'High-quality reasoning: complex analysis, creative writing, detailed explanations, research, coding assistance, nuanced conversations',
    doNotUseFor: 'High-volume simple tasks, cost-sensitive applications, real-time speed-critical applications, basic content generation',
    reasoning: true,
    factualAccuracy: 86.5, // MMLU validated from search results
    codingScore: 72.7, // SWE-bench Verified extensively validated
    mathScore: 70.5, // AIME from search results
    contextWindow: 200000, // 200K tokens
    responseSpeed: 82.1, // tokens/sec from Artificial Analysis
    latency: 1.49 // seconds TTFT from Artificial Analysis
  })
})

Model('opus_4', {
  description: 'ultra-expensive(15~75), premium intelligence',
  impl: model('claude-opus-4-20250514', { 
    price: [15, 75], // Validated from Anthropic pricing
    provider: anthropic(), 
    bestFor: 'Ultra-complex reasoning: most advanced mathematics, scientific research, complex multi-hour coding projects, strategic planning, PhD-level analysis, sustained agentic workflows',
    doNotUseFor: 'Simple tasks, real-time applications, cost-sensitive projects, basic content generation, high-volume processing',
    reasoning: true,
    factualAccuracy: 88.8, // MMLU tied with o3 from search results
    codingScore: 72.5, // SWE-bench Verified (79.4% with parallel compute) from search results
    mathScore: 75.5, // AIME (90.0% high-compute mode) from search results
    contextWindow: 200000 // 200K tokens
  })
})

Model('claude3Haiku', {
  description: 'medium(0.25~1.25) slow(79), cost-effective',
  impl: model('claude-3-5-haiku-20241022', {
    price: [0.25,1.25],
    provider: claudeCode(),
    bestFor: 'Fast, cost-effective tasks: customer support, simple analysis, basic content generation, quick Q&A, summarization',
    doNotUseFor: 'Complex reasoning, detailed analysis, creative writing, advanced coding, tasks requiring deep understanding',
    reasoning: false,
    codingScore: 75.9,
    contextWindow: 200000,
    responseSpeed: 79.6,
    latency: 1.09,
    factualAccuracy: 73.8
  })
})

// OPENAI MODELS - Only scores with direct citations included

Model('o1', {
  description: 'ultra-expensive(15~60), ultra-reasoning',
  impl: model('o1-preview-2024-09-12', { 
    price: [15, 60], // Extensively validated pricing
    provider: openAI(), 
    bestFor: 'Ultra-complex reasoning: advanced mathematics, scientific research, complex problem-solving, strategic planning, PhD-level analysis',
    doNotUseFor: 'Simple tasks, real-time applications, cost-sensitive projects, basic content generation, high-volume processing',
    reasoning: true,
    contextWindow: 128000 // 128K tokens validated
  })
})

Model('o1_mini', {
  description: 'expensive(3~12), moderate reasoning',
  impl: model('o1-mini-2024-09-12', { 
    price: [3, 12], // Validated pricing
    provider: openAI(), 
    bestFor: 'Moderate complexity reasoning: coding problems, math, science, logical analysis at reasonable cost',
    doNotUseFor: 'Simple tasks, real-time speed requirements, ultra-complex research, basic content generation',
    reasoning: true,
    factualAccuracy: 82.0, // MMLU validated from search results
    contextWindow: 128000 // 128K tokens
  })
})

Model('o4_mini', {
  description: 'medium(1.1~4.4) fast(94), best small model',
  impl: model('o4-mini-2025', { 
    price: [1.10, 4.40], // Latest pricing validated
    provider: openAI(), 
    bestFor: 'Best-performing small model: math, coding, visual tasks, cost-efficient reasoning with high performance',
    doNotUseFor: 'Ultra-complex long-duration tasks, tasks requiring maximum context, non-STEM domains needing broad knowledge',
    reasoning: true,
    factualAccuracy: 83.2, // MMLU validated from search results
    responseSpeed: 94.6, // tokens/sec from Artificial Analysis
    latency: 56.36, // seconds TTFT from Artificial Analysis
    contextWindow: 128000 // 128K tokens
  })
})

Model('gpt_4o', {
  description: 'expensive(2.5~10) fast(177), multimodal',
  impl: model('gpt-4o-2024-08-06', { 
    price: [2.5, 10], // Validated pricing
    provider: openAI(), 
    bestFor: 'Multimodal tasks: image analysis, vision-text combination, general high-quality responses, balanced performance across modalities',
    doNotUseFor: 'Simple text-only tasks, ultra-complex reasoning (use o1), cost-sensitive high-volume applications',
    reasoning: false,
    factualAccuracy: 88.7, // MMLU leading validated from search results
    codingScore: 54.6, // SWE-bench performance from search results
    contextWindow: 128000, // 128K tokens
    responseSpeed: 177.1, // tokens/sec from Artificial Analysis (March 2025)
    latency: 0.49 // seconds TTFT from Artificial Analysis
  })
})

Model('gpt_4o_mini', {
  description: 'medium(0.15~0.60) slow(63), cost-efficient',
  impl: model('gpt-4o-mini', { 
    price: [0.15, 0.60], // Validated pricing
    provider: openAI(), 
    bestFor: 'Cost-efficient tasks: customer support, simple analysis, basic coding, quick responses, high-volume applications',
    doNotUseFor: 'Complex reasoning, advanced coding, detailed analysis, tasks requiring latest knowledge',
    reasoning: false,
    factualAccuracy: 82.0, // MMLU validated from search results
    codingScore: 87.2, // HumanEval validated from search results
    mathScore: 87.0, // MGSM validated from search results
    contextWindow: 128000, // 128K tokens
    responseSpeed: 63.0, // tokens/sec from Artificial Analysis
    latency: 0.49 // seconds TTFT from Artificial Analysis
  })
})

Model('gpt_35_turbo_0125', {
  description: 'cheap(0.5~1.5) fast(117), basic tasks',
  impl: model('gpt-3.5-turbo-0125', { 
    price: [0.5, 1.5], // Validated pricing
    provider: openAI(), 
    bestFor: 'Cost-effective general tasks: chatbots, content generation, simple analysis, customer service, basic coding assistance',
    doNotUseFor: 'Complex reasoning, advanced coding, detailed analysis, tasks requiring latest knowledge, long-context processing',
    reasoning: false,
    contextWindow: 16385, // ~16K tokens
    responseSpeed: 117.8, // tokens/sec from Artificial Analysis (GPT-4.1 as reference for newer models)
    latency: 0.45 // seconds TTFT from Artificial Analysis
  })
})

Model('gpt_35_turbo_16k', {
  description: 'expensive(3~4) fast(117), 16K context',
  impl: model('gpt-3.5-turbo-16k-0613', {
    price: [3,4],
    provider: openAI(),
    bestFor: 'Longer document processing: document analysis, content generation with more context, extended conversations',
    doNotUseFor: 'Complex reasoning, advanced tasks, latest information needs, ultra-long context requirements',
    reasoning: false,
    contextWindow: 16385,
    responseSpeed: 117.8,
    latency: 0.45
  })
})