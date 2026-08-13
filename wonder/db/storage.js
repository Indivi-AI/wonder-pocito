let storageClient

export async function storage(ctx, opts = {}) {
  if (globalThis.process?.env?.STORAGE_PROVIDER === 'minio') return storageClient ||= (await import('./s3-storage.js')).s3Storage()
  return (await import('./auth.js')).auth.gcpStorage(ctx, opts)
}
