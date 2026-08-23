import { Readable } from 'node:stream'
import { once } from 'node:events'
import { fetch, Pool } from 'undici'

const storageOrigin = 'https://storage.googleapis.com'
const gcsPool = new Pool(storageOrigin, {
    connections: 20, allowH2: storageOrigin.startsWith('https:'), maxConcurrentStreams: 80, connect: { preferH2: true }
})

async function* packetize(body, size) {
    let pending = Buffer.alloc(0)
    for await (const chunk of body) {
        pending = pending.length ? Buffer.concat([pending, chunk]) : chunk
        while (pending.length >= size) {
            yield pending.subarray(0, size)
            pending = pending.subarray(size)
        }
    }
    if (pending.length) yield pending
}

export function setupGCSProxyRoute(app) {
    app.post('/gcs-proxy/range-stream-parallel/*', async (req, res) => {
        const packetSize = Number(req.query.packetSize || 65536), query = new URLSearchParams(req.query)
        query.delete('packetSize')
        const path = `/${req.params[0]}?${query}`, abort = new AbortController()
        let output = Promise.resolve()
        const write = (offset, data) => output = output.then(async () => {
            const header = Buffer.allocUnsafe(12)
            header.writeBigUInt64BE(BigInt(offset))
            header.writeUInt32BE(data.length, 8)
            if (!res.write(Buffer.concat([header, data]))) await once(res, 'drain')
        })
        res.on('close', () => !res.writableEnded && abort.abort())
        res.type('application/octet-stream')
        try {
            const started = performance.now(), bytes = req.body.reduce((sum, [, length]) => sum + length, 0)
            let active = 0, maxActive = 0
            await Promise.all(req.body.map(async ([offset, length]) => {
                active++; maxActive = Math.max(maxActive, active)
                try {
                    const { statusCode, body } = await gcsPool.request({
                        path, method: 'GET', signal: abort.signal, headers: { Range: `bytes=${offset}-${offset + length - 1}` }
                    })
                    if (statusCode !== 206) throw new Error(`Range request returned ${statusCode}`)
                    let at = offset
                    for await (const data of packetize(body, packetSize)) {
                        await write(at, data)
                        at += data.length
                    }
                } finally {
                    active--
                }
            }))
            await output
            res.end()
        } catch (err) { res.destroy(err) }
    })

    app.get('/gcs-proxy/*', async (req, res) => {
        try {
            const gcsUrl = `${storageOrigin}/${req.params[0]}?${new URLSearchParams(req.query)}`
            const response = await fetch(gcsUrl, { dispatcher: gcsPool, headers: req.headers.range ? { Range: req.headers.range } : {} })
            if (!response.ok && response.status !== 206) return res.status(response.status).end()
            for (const h of ['content-type', 'content-range', 'accept-ranges', 'content-length'])
                if (response.headers.get(h)) res.set(h, response.headers.get(h))
            res.set({ 'Cross-Origin-Resource-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' })
            Readable.fromWeb(response.body).pipe(res.status(response.status))
        } catch (err) { res.status(500).json({ error: String(err) }) }
    })

}
