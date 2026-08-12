import { dsls } from '@jb6/core'
import '@jb6/llm-guide/essentials.js'

const { 'llm-guide': { Doclet } } = dsls

Doclet('workflowElementFix.duckdb', {
  impl: `DuckDB Binder Error and missing-column errors are local fixes when aliases, joins, selected columns, grouping, or table references can be corrected inside the element.`
})
