if (process.env.STORAGE_PROVIDER === 'minio') await import('./mcp-on-prem.js')
else {
  await import('./init-dev.js')
  await import('@jb6/mcp')
  await import('@wonder/studio/mcp-tools/wonder-mcp-tools.js')
}
