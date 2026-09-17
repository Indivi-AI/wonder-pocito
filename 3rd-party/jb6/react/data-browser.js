import { coreUtils, dsls} from '@jb6/core'
import { reactUtils } from '@jb6/react'
import '@jb6/common'
import '@jb6/core/misc/pretty-print.js'

const { 
    tgp: { Const, TgpType, 'ctx-enricher': { Var } }, 
    common: { Data,
      data: { pipeline, join, prettyPrint, slice, list, replace},
      boolean: {and,startsWith,contains,isOfType}
    }
  } = dsls
  
const { h, L, useState, useEffect, useRef, useContext } = reactUtils
const { globalsOfTypeIds, Ctx } = coreUtils

Object.assign(reactUtils,{DataBrowser})

const ContentTypeView = TgpType('content-type-view','react')

const contentTypeView = ContentTypeView('contentTypeView', {
  params: [
    { id: 'detect', as: 'boolean', dynamic: true, byName: true },
    { id: 'singleLine', as: 'string', dynamic: true },
    { id: 'multiLine', as: 'string', dynamic: true, defaultValue: '%%' },
    { id: 'reactComp', type: 'react-comp<react>' },
    { id: 'priority', as: 'number', defaultValue: 10 },
  ]
})

const cutLine = Data('cutLine', {
  params: [
    {id: 'length', defaultValue: 60}
  ],
  impl: join('', {
    items: list(
      slice(0, '%$length%'),
      ({data},{},{length}) => data.length > length ? ` ... ${data.length-length} more` : ''
    )
  })
})

ContentTypeView('html', {
  impl: contentTypeView({
    detect: and(startsWith('<'), contains('>')),
    singleLine: pipeline(replace('\n', '', { useRegex: true, regexFlags: 'g' }), cutLine()),
    reactComp: (value) => h('div:border rounded p-2 bg-gray-50', {},
      h('div:text-xs text-gray-600 mb-2', {}, 'HTML Preview:'),
      h('div:border rounded p-2 bg-white max-h-32 overflow-auto', {
        dangerouslySetInnerHTML: { __html: value }
      })
    )
  })
})

ContentTypeView('json', {
  impl: contentTypeView({
    detect: isOfType('object'),
    singleLine: pipeline(prettyPrint('%%', { singleLine: true }), cutLine()),
    multiLine: prettyPrint('%%'),
    reactComp: (value) => h('pre:bg-gray-900 text-green-400 p-2 rounded text-xs overflow-auto max-h-32', {}, 
      coreUtils.prettyPrint(value))
  })
})

ContentTypeView('text', {
  impl: contentTypeView({
    detect: isOfType('string'),
    singleLine: pipeline(replace('\n', '\\n', { useRegex: true, regexFlags: 'g' }), cutLine()),
    reactComp: (value) => h('div:whitespace-pre-wrap break-words', {}, value)
  })
})


function detectContentTypeView(value) {
  const view = globalsOfTypeIds(ContentTypeView).map(id=>dsls.react['content-type-view'][id].$run())
    .filter(x=>x.detect(value)).sort((x,y) => x.priority - y.priority)[0] || dsls.react['content-type-view'].text.$run()
  return view
}

function DataBrowser({ data, path = [], maxDepth = 3 }) {
  const [expandedPaths, setExpandedPaths] = useState(new Set())
  const [viewModes, setViewModes] = useState(new Map()) // path -> mode
  
  const toggleExpanded = (currentPath) => {
    const pathKey = currentPath.join('.')
    const newExpanded = new Set(expandedPaths)
    if (newExpanded.has(pathKey)) {
      newExpanded.delete(pathKey)
    } else {
      newExpanded.add(pathKey)
    }
    setExpandedPaths(newExpanded)
  }
  
  const setViewMode = (currentPath, mode) => {
    const pathKey = currentPath.join('.')
    const newModes = new Map(viewModes)
    newModes.set(pathKey, mode)
    setViewModes(newModes)
  }
  
  const renderValue = (value, currentPath, depth = 0) => {
    const pathKey = currentPath.join('.')
    const isExpanded = expandedPaths.has(pathKey)
    const currentMode = viewModes.get(pathKey) || 'singleLine'
    const view = detectContentTypeView(value)
    debugger
    
    if (depth > maxDepth)
      return h('span:text-gray-400 text-xs', {}, '...')
    
    // For objects and arrays, show expandable structure
    if (typeof value === 'object' && value !== null) {
      const isArray = Array.isArray(value)
      const keys = isArray ? value.map((_, i) => i) : Object.keys(value)
      
      return h('div', {},
        h('div:flex items-center gap-1', {},
          keys.length > 0 && h('button:text-xs text-gray-500 hover:text-gray-700', {
            onClick: () => toggleExpanded(currentPath)
          }, isExpanded ? '▼' : '▶'),
          h('span:font-medium text-xs', {}, 
            isArray ? `Array[${value.length}]` : `Object{${keys.length}}`
          )
        ),
        
        isExpanded && h('div:ml-4 mt-1 space-y-1', {},
          ...keys.slice(0, 20).map(key => {
            const childPath = [...currentPath, key]
            return h('div:text-xs', { key },
              h('span:text-gray-600 font-mono mr-2', {}, `${key}:`),
              renderValue(value[key], childPath, depth + 1)
            )
          }),
          keys.length > 20 && h('div:text-gray-400 text-xs', {}, `... ${keys.length - 20} more`)
        )
      )
    }
    
    // For primitive values, show with content type views
    const ctxToUse = new Ctx().setData(value)
    debugger
    return h('div', {},
      h('div:flex items-center gap-2', {},
        //h('span:text-xs px-1 bg-gray-200 rounded', {}, contentType),
        currentMode === 'singleLine' && h('span:text-xs', {}, view.singleLine(ctxToUse)),
        h('div:flex gap-1', {},
          ['singleLine', 'multiLine', 'reactComp'].map(mode =>
            h('button:text-xs px-1 rounded', {
              key: mode,
              className: currentMode === mode 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 hover:bg-gray-200',
              onClick: () => setViewMode(currentPath, mode)
            }, mode === 'singleLine' ? 'sum' : mode === 'reactComp' ? 'comp' : mode)
          )
        )
      ),
      
      currentMode === 'multiLine' && h('div:mt-1 bg-gray-50 p-2 rounded text-xs font-mono whitespace-pre-wrap max-h-32 overflow-auto', {}, 
        view.multiLine(ctxToUse)
      ),
      
      currentMode === 'reactComp' && h('div:mt-1', {},
        view.reactComp(value)
      )
    )
  }
  
  return h('div:text-xs', {}, renderValue(data, path))
}
