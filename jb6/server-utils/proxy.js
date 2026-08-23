import http from 'http'
import https from 'https'
import { parse } from 'url'

export function expressRedirect(app) {
  app.get('/redirect', (req, res) => {
    const { to, status = 302 } = req.query
    if (!to) return res.status(400).send('No "to" query param specified')
    res.redirect(Number(status), to)
  })
}

export function expressProxy(app) {
app.post('/proxy', (req, res) => {
    try {
      console.log(req.body)
      const { originalBody, targetUrl, headers = {} } = req.body
      
      if (!targetUrl) throw new Error('No target URL specified')
      
      const parsedUrl = parse(targetUrl)
      const requester = parsedUrl.protocol === 'https:' ? https : http
      
      const options = {
        method: 'POST',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.path,
        headers: { ...headers, 'Accept-Encoding': 'identity' }
      }
      
      const proxyReq = requester.request(options, (proxyRes) => {
        res.statusCode = proxyRes.statusCode
        
        Object.entries(proxyRes.headers)
          .filter(([key]) => key.toLowerCase() !== 'content-encoding' && !key.toLowerCase().startsWith('access-control-'))
          .forEach(([key, value]) => res.setHeader(key, value))
        
        proxyRes.pipe(res)
      })
      
      proxyReq.on('error', (err) => endWithFailure(res, err))
      
      if (originalBody) proxyReq.write(originalBody)
      proxyReq.end()
      
    } catch (err) {
      return endWithFailure(res, err)
    }

    function endWithFailure(res, err) {
      console.error('Proxy error:', err.stack || err);
      res.headersSent ? res.end() : res.status(500).json({ error: err.stack || 'Proxy request failed' });
    }
  })
}