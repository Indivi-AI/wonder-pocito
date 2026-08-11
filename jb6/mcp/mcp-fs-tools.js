import { dsls, coreUtils } from '@jb6/core'
import './mcp-utils.js'
const { pathJoin } = coreUtils
  
const {
  tgp: { Component },
  common: { Data, Action,
    data: { asIs }
  },
  mcp: { Tool,
    tool: { mcpTool }
  }
} = dsls

 
const getFilesContent = Data('getFilesContent', {
  description: 'Read the content of one or more files from the repository. Essential for understanding existing code before making changes.',
  params: [
    {id: 'filesPaths', as: 'string', asIs: true, mandatory: true, description: 'Comma-separated relative file paths (e.g., "packages/common/jb-common.js,packages/ui/ui-core.js")'},
  ],
  impl: async (ctx, {}, { filesPaths}) => {
      const repoRoot = jb.coreRegistry.repoRoot
      try {
        const { readFileSync } = await import('fs')
        const { pathJoin, estimateTokens } = coreUtils
        const files = filesPaths.split(',').map(filePath => {
          const fullPath = pathJoin(repoRoot, filePath.trim())
          const fileContent = readFileSync(fullPath, 'utf8')
          return {
            filePath: filePath.trim(),
            content: fileContent,
            tokens: estimateTokens(fileContent)
          }
        })
        return files.map(file => `=== File: ${file.filePath} (${file.tokens} tokens) ===\n${file.content}`).join('\n\n')
        
      } catch (error) {
        return `Error reading files: ${error.message}`
      }
    }
})

Action('saveToFile', {
  params: [
    {id: 'filePath', as: 'string', asIs: true, mandatory: true, description: 'Relative file path where timestamp will be added'},
    {id: 'content', as: 'string', asIs: true, mandatory: true, description: 'Content to add to the file'},
  ],
  impl: async (ctx, {}, {filePath, content}) => {
    try {
      const { writeFileSync } = await import('fs')
      const { join } = await import('path')
      writeFileSync(join(jb.coreRegistry.repoRoot, filePath), content, 'utf8')      
    } catch (error) {
      logError(error,{ctx})
    }
  }
})

Tool('getFilesContent', {
  description: 'Read the content of one or more files from the repository. Essential for understanding existing code before making changes.',
  params: [
    {id: 'filesPaths', as: 'string', asIs: true, mandatory: true, description: 'Comma-separated relative file paths (e.g., "packages/common/jb-common.js,packages/ui/ui-core.js")'},
  ],
  impl: mcpTool(getFilesContent('%$filesPaths%'))
})
  
Tool('replaceFileSection', {
    description: 'Replace a section in a file with new text, starting from a specific line and matching old section text',
    params: [
      { id: 'filePath', as: 'string', asIs: true, mandatory: true, description: 'relative filePath of the file in the repo' },
      { id: 'newSectionText', as: 'string', asIs: true, mandatory: true, description: 'new section text to replace with' },
      { id: 'fromLine', as: 'number', mandatory: true, description: 'line number to start replacement from (1-indexed)' },
      { id: 'oldSectionText', as: 'string', asIs: true, mandatory: true, description: 'old section text to find and replace for validation' }
    ],
    impl: mcpTool(async (ctx, {}, {filePath,newSectionText,fromLine,oldSectionText}) => {
      try {
        const { readFileSync, writeFileSync } = await import('fs')
        const fullPath = pathJoin(jb.coreRegistry.repoRoot, filePath)  
        const content = readFileSync(fullPath, 'utf8')
        const lines = content.split('\n')
      
        if (fromLine < 1 || fromLine > lines.length)
          return `Error line number ${fromLine} is out of range (1-${lines.length})`
        
        const beforeLines = lines.slice(0, fromLine - 1)
        const contentAfterLine = lines.slice(fromLine - 1).join('\n')
        if (!contentAfterLine.includes(oldSectionText))
          return 'Error. Old section text not found starting from the specified line'

        const updatedContentAfterLine = contentAfterLine.replace(oldSectionText, newSectionText)        
        const newContent = [...beforeLines, updatedContentAfterLine].join('\n')
        
        writeFileSync(fullPath, newContent, 'utf8')
        return 'File section replaced successfully'
      } catch (error) {
        return `Error. ${error.message}`
      }
    })
})

Tool('appendToFile', {
  description: 'Add a timestamp to a file, useful for logging or tracking changes.',
  params: [
    {id: 'filePath', as: 'string', asIs: true, mandatory: true, description: 'Relative file path where timestamp will be added'},
    {id: 'content', as: 'string', asIs: true, mandatory: true, description: 'Content to add to the file'},
    {id: 'timeStamp', as: 'boolean', description: 'If true, prepend a timestamp to the content'}
  ],
  impl: mcpTool(async (ctx, {}, {filePath,content,timeStamp}) => {
    try {
      const { readFileSync, writeFileSync } = await import('fs')
      const fullPath = pathJoin(jb.coreRegistry.repoRoot, filePath)
      let existingContent = ''
      try { existingContent = readFileSync(fullPath, 'utf8') } catch (error) {}
      const dateTime = new Date().toISOString()
      const contentToAdd = timeStamp ? '[' + dateTime + '] ' + content : content
      const newContent = existingContent + (existingContent ? '\n' : '') + contentToAdd
      writeFileSync(fullPath, newContent, 'utf8')
      return 'Content added successfully'
    } catch (error) {
      return `Error. ${error.message}`
    }
  })
})

Tool('saveToFile', {
  params: [
    {id: 'filePath', as: 'string', asIs: true, mandatory: true, description: 'Relative file path where timestamp will be added'},
    {id: 'repoRoot', as: 'string', asIs: true, mandatory: true, description: 'Absolute path to repository root'},
    {id: 'content', as: 'string', asIs: true, mandatory: true, description: 'Content to add to the file'},
  ],
  impl: async (ctx, {}, {repoRoot, filePath, content}) => {
    try {
      const { writeFileSync } = await import('fs')
      const { join } = await import('path')

      const fullPath = join(repoRoot, filePath)
      writeFileSync(fullPath, content, 'utf8')
      
      return {
        content: [{ type: 'text', text: JSON.stringify({ result: 'Content added successfully' }) }],
        isError: false
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
        isError: true
      }
    }
  }
})

Tool('listRepoFiles', {
  description: 'List all files in a repository with their sizes, excluding files matched by .gitignore patterns',
  params: [
    { id: 'includeHidden', as: 'boolean', defaultValue: true, description: 'Whether to include hidden files (starting with .)' }
  ],
  impl: async (ctx, {}, { includeHidden }) => {
    try {
      const repoRoot = jb.coreRegistry.repoRoot
      const { readdirSync, statSync, readFileSync } = await import('fs')
      const { join, relative, sep } = await import('path')
      
      // Read .gitignore patterns if file exists
      let gitignorePatterns = []
      try {
        const gitignoreContent = readFileSync(join(repoRoot, '.gitignore'), 'utf8')
        gitignorePatterns = gitignoreContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'))
      } catch (error) {
        // .gitignore doesn't exist, continue without patterns
      }
      
      // Add common patterns to always exclude
      gitignorePatterns.push('.git', 'node_modules')
      
      // Function to check if a path matches any gitignore pattern
      const isIgnored = (filePath) => {
        const relativePath = relative(repoRoot, filePath).replace(/\\/g, '/')
        const pathParts = relativePath.split('/')
        
        return gitignorePatterns.some(pattern => {
          // Handle directory patterns (ending with /)
          if (pattern.endsWith('/')) {
            const dirPattern = pattern.slice(0, -1)
            return pathParts.includes(dirPattern)
          }
          
          // Handle wildcard patterns
          if (pattern.includes('*')) {
            const regexPattern = pattern
              .replace(/\./g, '\\.')
              .replace(/\*/g, '.*')
            return new RegExp(`^${regexPattern}$`).test(relativePath) ||
                   pathParts.some(part => new RegExp(`^${regexPattern}$`).test(part))
          }
          
          // Handle exact matches
          return relativePath === pattern || 
                 relativePath.endsWith('/' + pattern) ||
                 pathParts.includes(pattern)
        })
      }
      
      // Recursive function to walk directory tree
      const walkDirectory = (dirPath) => {
        const files = []
        
        try {
          const entries = readdirSync(dirPath)
          
          for (const entry of entries) {
            const fullPath = join(dirPath, entry)
            
            // Skip hidden files unless includeHidden is true
            if (!includeHidden && entry.startsWith('.') && entry !== '.gitignore') {
              continue
            }
            
            // Skip if matches gitignore patterns
            if (isIgnored(fullPath)) {
              continue
            }
            
            try {
              const stats = statSync(fullPath)
              
              if (stats.isFile()) {
                const relativePath = relative(repoRoot, fullPath)
                files.push({
                  path: relativePath,
                  size: stats.size,
                  sizeFormatted: formatBytes(stats.size),
                  modified: stats.mtime.toISOString()
                })
              } else if (stats.isDirectory()) {
                // Recursively walk subdirectories
                files.push(...walkDirectory(fullPath))
              }
            } catch (statError) {
              // Skip files that can't be accessed
              continue
            }
          }
        } catch (readError) {
          // Skip directories that can't be read
        }
        
        return files
      }
      
      // Helper function to format bytes
      const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
      }
      
      const allFiles = walkDirectory(repoRoot)
      
      // Sort files by path
      allFiles.sort((a, b) => a.path.localeCompare(b.path))
      
      // Calculate total size
      const totalSize = allFiles.reduce((sum, file) => sum + file.size, 0)
      
      // Format output
      const fileList = allFiles.map(file => 
        `${file.path} (${file.sizeFormatted})`
      ).join('\n')
      
      const summary = `Total: ${allFiles.length} files, ${formatBytes(totalSize)}\n\nFiles:\n${fileList}`
      
      return {
        content: [{ type: 'text', text: summary }],
        isError: false
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error listing repository files: ${error.message}` }],
        isError: true
      }
    }
  }
})

const createDirectoryStructure = Component('createDirectoryStructure', {
  type: 'tool<mcp>',
  description: 'Create a directory structure with files based on JSON input. Directories are objects, files are strings with content.',
  params: [
    {id: 'dirPath', as: 'string', asIs: true, mandatory: true, description: 'Relative path within repo where to create the structure'},
    {id: 'structure', as: 'object', mandatory: true, description: 'JSON describing directory structure. Objects are directories, strings are file contents.'}
  ],
  impl: async (ctx, {}, {dirPath, structure}) => {
    const repoRoot = jb.coreRegistry.repoRoot
    try {
      const { mkdirSync, writeFileSync } = await import('fs')
      const { join } = await import('path')            
      const basePath = join(repoRoot, dirPath)

      let files = 0, dirs = 0
      const createStructure = (obj, currentPath) => {
        mkdirSync(currentPath, { recursive: true })        
        for (const [name, content] of Object.entries(obj)) {
          const itemPath = join(currentPath, name)
          if (typeof content === 'string') {
            writeFileSync(itemPath, content, 'utf8')
            files++
          } else if (typeof content === 'object' && content !== null) {
            dirs++
            createStructure(content, itemPath)
          } else {
            throw new Error(`Invalid item type for '${name}': expected string (file) or object (directory)`)
          }
        }
      }
      createStructure(structure, basePath)
            
      return {
        content: [{ 
          type: 'text', 
          text: JSON.stringify({ 
            result: 'Directory structure created successfully',
            created: { dirs, files, location: join(dirPath) }
          }) 
        }],
        isError: false
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
        isError: true
      }
    }
  }
})

Component('createResearchDir', {
  type: 'tool<mcp>',
  params: [
    {id: 'researchId', as: 'string', asIs: true, mandatory: true}
  ],
  impl: createDirectoryStructure('research/%$researchId%', asIs({theory: {}, examples: {}, tests: {}}))
})