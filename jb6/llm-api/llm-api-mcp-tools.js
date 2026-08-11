import { dsls, coreUtils } from '@jb6/core'
import './skills.js1'
import '@jb6/mcp'
const { 
  tgp: { TgpType, any: { typeAdapter } },
  common: {
    data: { bookletsContent}
  },
  'llm-guide' : { Booklet, 
    booklet: { booklet }
  },
  mcp: { Tool,
    tool: { mcpTool }
  }
} = dsls


// Tool('askExternalLLmWithBooklet', {
//   params: [
//     {id: 'bookletAndModel', type: 'bookletAndModel<llm-guide>', madatory: true},
//     {id: 'prompt', as: 'text', madatory: true}
//   ],
//   impl: mcpTool('%$bookletAndModel.booklet% ##\n%$prompt%')
// })