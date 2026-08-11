import path from 'path'
import fsp from 'fs/promises'
import { coreUtils, jb } from '@jb6/core'

const { getStaticServeConfig, calcRepoRoot } = coreUtils
jb.serverUtils = jb.serverUtils || {}
Object.assign(jb.serverUtils, { serveEditSource })

function serveEditSource(app, {express}) {
  let _staticMappings
  app.post('/editSource', express.json(), async (req, res) => {
    try {
      const host = req.hostname || req.headers.host?.split(':')[0]
      if (host !== 'localhost' && host !== '127.0.0.1')
        return res.status(403).json({ error: 'editSource only allowed from localhost' })
      const { filePath, range, newText, expectedText } = req.body
      const repoRoot = await calcRepoRoot()
      _staticMappings = _staticMappings || (await getStaticServeConfig(repoRoot)).staticMappings
      const mapping = [..._staticMappings].sort((a,b) => b.urlPath.length - a.urlPath.length).find(m => filePath.startsWith(m.urlPath))
      const fullPath = mapping ? path.join(mapping.diskPath, filePath.slice(mapping.urlPath.length)) : path.join(repoRoot, filePath)
      console.log('editSource', { filePath, fullPath, mapping: mapping?.urlPath })
      const content = await fsp.readFile(fullPath, 'utf8')
      const lines = content.split('\n')
      const fromOffset = lines.slice(0, range.start.line).reduce((s, l) => s + l.length + 1, 0) + range.start.col
      const toOffset = lines.slice(0, range.end.line).reduce((s, l) => s + l.length + 1, 0) + range.end.col
      if (expectedText != null && content.slice(fromOffset, toOffset) !== expectedText)
        return res.status(409).json({ error: 'expectedText mismatch', found: content.slice(fromOffset, toOffset) })
      const newContent = content.slice(0, fromOffset) + newText + content.slice(toOffset)
      await fsp.writeFile(fullPath, newContent, 'utf8')
      res.json({ ok: true })
    } catch (e) {
      console.error('editSource error:', e)
      res.status(500).json({ error: e.stack })
    }
  })
}
