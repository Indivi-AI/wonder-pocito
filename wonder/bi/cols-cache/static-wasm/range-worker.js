const singleRange = ({ key, url, off, len, shared, queryId, operationId }) => {
  const state = new Int32Array(shared, 0, 2), at = performance.now()
  postMessage({ network: 'begin', queryId, operationId, kind: 'range', bytes: len })
  try {
    const x = new XMLHttpRequest()
    x.open('GET', url, false); x.setRequestHeader('Range', `bytes=${off}-${off + len - 1}`); x.responseType = 'arraybuffer'; x.send()
    new Uint8Array(shared, 8).set(new Uint8Array(x.response))
    Atomics.store(state, 1, Math.round((performance.now() - at) * 1000)); Atomics.store(state, 0, 1)
  } catch { Atomics.store(state, 0, -1) }
  Atomics.notify(state, 0)
  postMessage({ network: 'end', queryId, operationId, kind: 'range', bytes: len })
  postMessage({ key })
}

const parallelRanges = async ({ url, wUrl, ranges, progressChannel, packetSize = 65536, queryId, operationId }) => {
  const endpoint = new URL(url)
  const direct = !endpoint.pathname.startsWith('/gcs-proxy/')
  endpoint.pathname = endpoint.pathname.replace('/gcs-proxy/', '/gcs-proxy/range-stream-parallel/')
  endpoint.searchParams.set('packetSize', packetSize)
  const channel = new BroadcastChannel(progressChannel)
  const progressByColumn = Object.fromEntries(Object.entries(Object.groupBy(ranges, x => x.col || 'planned ranges')).map(([column, items]) =>
    [column, { column, ranges: items.length, fetchedBytes: 0, totalBytes: items.reduce((n, x) => n + x.len, 0), startedAt: performance.now() }]))
  Object.values(progressByColumn).forEach(x => channel.postMessage({ t: 'rangeDownload', status: 'running', wUrl, ...x, pct: 0 }))
  const bytes = ranges.reduce((n, x) => n + x.len, 0)
  postMessage({ network: 'begin', queryId, operationId, kind: 'parallelRanges', wUrl, bytes, ranges: ranges.length, packetSize })
  const started = performance.now(), deliver = (range, data, at = 0) => {
    new Uint8Array(range.shared, 8 + at).set(data)
    range.received = (range.received || 0) + data.length
    const columnProgress = progressByColumn[range.col || 'planned ranges']
    columnProgress.fetchedBytes += data.length
    channel.postMessage({ t: 'rangeDownload', status: columnProgress.fetchedBytes === columnProgress.totalBytes ? 'done' : 'running',
      wUrl, ...columnProgress, pct: 100 * columnProgress.fetchedBytes / columnProgress.totalBytes,
      ms: performance.now() - columnProgress.startedAt })
    postMessage({ key: range.key, bytes: data.length })
    if (range.received === range.len) {
      const state = new Int32Array(range.shared, 0, 2)
      Atomics.store(state, 1, Math.round((performance.now() - started) * 1000)); Atomics.store(state, 0, 1)
      Atomics.notify(state, 0); postMessage({ key: range.key, done: true })
    }
  }, finish = () => {
    channel.close()
    postMessage({ network: 'end', queryId, operationId, kind: 'parallelRanges', wUrl, bytes, ranges: ranges.length,
      ms: performance.now() - started })
  }
  if (direct) {
    await Promise.all(ranges.map(async range => {
      const response = await fetch(url, { headers: { Range: `bytes=${range.off}-${range.off + range.len - 1}` } })
      if (response.status !== 206) throw new Error(`Range request returned ${response.status}`)
      const data = new Uint8Array(await response.arrayBuffer())
      if (data.length !== range.len) throw new Error(`Range request returned ${data.length}/${range.len} bytes`)
      deliver(range, data)
    }))
    return finish()
  }
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ranges.map(({ off, len }) => [off, len]))
  })
  if (!response.ok) throw new Error(`Parallel range request returned ${response.status}`)
  let pending = new Uint8Array()
  for await (const chunk of response.body) {
    const joined = new Uint8Array(pending.length + chunk.length)
    joined.set(pending); joined.set(chunk, pending.length); pending = joined
    while (pending.length >= 12) {
      const view = new DataView(pending.buffer, pending.byteOffset), off = Number(view.getBigUint64(0)), len = view.getUint32(8)
      if (pending.length < 12 + len) break
      const range = ranges.find(x => off >= x.off && off + len <= x.off + x.len)
      if (!range) throw new Error(`Unexpected range packet ${off}:${len}`)
      deliver(range, pending.subarray(12, 12 + len), off - range.off)
      pending = pending.subarray(12 + len)
    }
  }
  finish()
}

onmessage = ({ data }) => data.ranges ? parallelRanges(data).catch(error => {
  data.ranges.forEach(({ key, shared }) => {
    const state = new Int32Array(shared, 0, 2)
    Atomics.store(state, 0, -1); Atomics.notify(state, 0); postMessage({ key, error: String(error) })
  })
}) : singleRange(data)
