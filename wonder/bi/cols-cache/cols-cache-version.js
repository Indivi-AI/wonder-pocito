export const colsCacheVersion = '1.5.4-cc1-34de2f0d'
const base = 'https://storage.googleapis.com/wonder-code-packages/lib/cols-cache'
export const colsCacheRuntime = {
  client: `${base}/duckdb-wasm-${colsCacheVersion}.js`,
  e2eWorker: `${base}/e2e-worker-${colsCacheVersion}.js`,
  js: `${base}/duckdb-eh-${colsCacheVersion}.js`,
  wasm: `${base}/duckdb-eh-${colsCacheVersion}.wasm`
}
