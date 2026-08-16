export const colsCacheVersion = '1.5.4-cc1-34de2f0d'
const storageUrl = (globalThis.WONDER_STORAGE_URL || globalThis.process?.env?.WONDER_STORAGE_URL
  || 'https://storage.googleapis.com').replace(/\/$/, '')
const base = `${storageUrl}/wonder-code-packages/lib/cols-cache`
export const colsCacheRuntime = {
  client: `${base}/duckdb-wasm-${colsCacheVersion}.js`,
  e2eWorker: `${base}/e2e-worker-${colsCacheVersion}.js`,
  js: `${base}/duckdb-eh-${colsCacheVersion}.js`,
  wasm: `${base}/duckdb-eh-${colsCacheVersion}.wasm`
}
