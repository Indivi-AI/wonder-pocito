let storageClient

export async function storage(ctx, opts = {}) {
  if ((globalThis.process?.env?.STORAGE_PROVIDER || (globalThis.process?.env?.MINIO_ENDPOINT && 'minio')) === 'minio')
    return storageClient ||= (await import('./s3-storage.js')).s3Storage()
  return (await import('./auth.js')).auth.gcpStorage(ctx, opts)
}
