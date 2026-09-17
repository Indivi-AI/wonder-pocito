import { serverUtils } from '@jb6/server-utils'
Object.assign(serverUtils, {runInWorker})

export async function runInWorker(opts) { // { entryPoints, compName, args }
  const isNode = typeof process!=='undefined' && process.versions?.node
  if (isNode) return runInSeparateProcess(opts)
  else return runInWebWorker(opts)
}

// builds the shared worker script (no trailing semicolons)
function generateWorkerCode(entryPoints, compName, args) {
  return `(async()=>{
    try {
      const { calcPath, jb } = await import('@jb6/core')
      ${entryPoints.map(ep => `await import('${ep}')`).join('\n      ')}
      // run the component
      const comp = calcPath(jb.ns, '${compName}')
      if (!comp) throw new Error('Component "${compName}" not found')
      const result = await comp.$run(${JSON.stringify(args)})
      // deliver result
      if (typeof postMessage==='function') postMessage({ result })
      else console.log(JSON.stringify(result))
    }
    catch(err){
      // deliver error
      if (typeof postMessage==='function') postMessage({ error: err.stack })
      else {
        console.error(err.stack||err.message)
        process.exit(1)
      }
    }
  })()`
}

// Node.js runner: spawns `node -e "<code>"`
export function runInSeparateProcess({ entryPoints, compName, args }) {
  const { spawn } = import('child_process')
  const code = generateWorkerCode(entryPoints, compName, args)
  return new Promise((resolve, reject)=>{
    let out = ''
    let err = ''
    const child = spawn('node', ['--input-type=module','-e',code], { stdio:['ignore','pipe','pipe'] }
    )
    child.stdout.on('data', c=> out += c)
    child.stderr.on('data', c=> err += c)
    child.on('close', code=>{
      if (code!==0) return reject(new Error(err.trim()||`exit ${code}`))
      try { resolve(JSON.parse(out)) }
      catch { reject(new Error('invalid JSON from worker')) }
    })
  })
}

// Browser runner: blobs the same code into a module‐type Web Worker
export function runInWebWorker({ entryPoints, compName, args }) {
  const code = generateWorkerCode(entryPoints, compName, args)
  const blob = new Blob([code], { type:'application/javascript' })
  const worker = new Worker(URL.createObjectURL(blob), { type:'module' })
  return new Promise((resolve, reject)=>{
    worker.onmessage = e=>{
      const { result, error } = e.data
      if (error) reject(new Error(error))
      else resolve(result)
      worker.terminate()
    }
    worker.postMessage({})
  })
}