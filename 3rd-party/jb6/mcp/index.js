import { coreUtils, dsls } from '@jb6/core'
import '@jb6/core/misc/import-map-services.js'
import { startMcpServer } from './mcp-utils.js'
import './mcp-jb-tools.js'
import './mcp-fs-tools.js'

//console.error('Starting jb6 MCP server script...')
if (coreUtils.isNode) {
    const path = await import('path')

    process.on('SIGINT', () => {
        console.error('Received SIGINT, shutting down...')
        process.exit(0)
    })
      
    process.on('SIGTERM', () => {
        console.error('Received SIGTERM, shutting down...')
        process.exit(0)
    })
    
    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error)
    })
    const args = process.argv.slice(2)
    if (args[0] == '--start') {
        const repoRoot = args[1]
        if (repoRoot && repoRoot.startsWith('--repoRoot='))
            jb.coreRegistry.repoRoot = path.resolve(repoRoot.split('--repoRoot=').pop())
        else 
            jb.coreRegistry.repoRoot = await coreUtils.calcRepoRoot()
        await coreUtils.ensureImportMapsInCli()
        const { importMap } = await coreUtils.calcImportData()
        const extraMcp = `${jb.coreRegistry.repoRoot}/.jb6/mcp.js`


        if (await exists(extraMcp))
            await import(extraMcp)

        try {                  
            const exclude = ['text','doclet']
            const allTools = coreUtils.globalsOfTypeIds(dsls.mcp.tool,'all').filter(id => !exclude.includes(id))
                .map(id=>({id, toolComp: dsls.mcp.tool[id][coreUtils.asJbComp] }))
        
            const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js")     
            await startMcpServer(new StdioServerTransport(), { allTools, importMap })
        } catch(error) {
            console.error("jb6 Server error:", error)
            process.exit(1)
        }
    }
}

async function exists(path) {
  const { access } = await import('fs/promises')
  return access(path).then(() => true, () => false)
}
