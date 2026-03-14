// CDN proxy route - serves R2 files
import { Hono } from 'hono'

type Bindings = {
  R2: R2Bucket
  CDN_URL: string
}

const cdn = new Hono<{ Bindings: Bindings }>()

// Proxy R2 files
cdn.get('/*', async (c) => {
  const path = c.req.param('*') || c.req.path.replace('/cdn/', '').replace('/r2/', '')
  
  if (!path) return c.text('Not found', 404)
  
  const object = await c.env.R2.get(path)
  
  if (!object) {
    return c.text('File not found', 404)
  }
  
  const headers = new Headers()
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
  headers.set('Content-Length', object.size.toString())
  headers.set('ETag', object.httpEtag)
  headers.set('Cache-Control', 'public, max-age=31536000')
  
  // Handle range requests for video/audio
  const rangeHeader = c.req.header('Range')
  if (rangeHeader) {
    const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (matches) {
      const start = parseInt(matches[1])
      const end = matches[2] ? parseInt(matches[2]) : object.size - 1
      
      headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`)
      headers.set('Content-Length', (end - start + 1).toString())
      headers.set('Accept-Ranges', 'bytes')
      
      // R2 doesn't support range directly in get, return full file with 206
      return new Response(object.body, {
        status: 206,
        headers
      })
    }
  }
  
  headers.set('Accept-Ranges', 'bytes')
  
  return new Response(object.body, { headers })
})

export default cdn
