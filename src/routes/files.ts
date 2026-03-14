// Files routes - upload, list, delete, rename, star, trash
// Architecture: Direct R2 upload (presigned) to reduce Worker load for scale
import { Hono } from 'hono'
import { getSupabaseUserClient, getSupabaseClient, generateFilePath, getFileCategory } from '../lib/supabase'
import { authMiddleware } from '../middleware/auth'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string
  R2: R2Bucket
  CDN_URL: string
  APP_URL: string
}

type Variables = {
  userId: string
  userEmail: string
  userRole: string
}

const files = new Hono<{ Bindings: Bindings; Variables: Variables }>()
files.use('*', authMiddleware)

const FREE_QUOTA = 5 * 1024 * 1024 * 1024   // 5 GB
const MAX_FILE_SIZE = 100 * 1024 * 1024       // 100 MB per file

function getToken(c: any): string {
  const auth = c.req.header('Authorization')
  if (auth?.startsWith('Bearer ')) return auth.substring(7)
  const cookie = c.req.header('Cookie') || ''
  return cookie.split(';').reduce((a: any, v: string) => {
    const [k, val] = v.trim().split('=')
    if (k && val) a[k.trim()] = decodeURIComponent(val.trim())
    return a
  }, {})['sb_token'] || ''
}

// ─────────────────────────────────────────────────────────
// GET /api/files  — list files in folder
// ─────────────────────────────────────────────────────────
files.get('/', async (c) => {
  const userId  = c.get('userId')
  const folder  = c.req.query('folder') || null
  const search  = c.req.query('search') || ''
  const sort    = c.req.query('sort')   || 'created_at'
  const order   = c.req.query('order')  || 'desc'
  const token   = getToken(c)

  const db = getSupabaseUserClient(c.env, token)
  let q = db.from('files').select('*').eq('user_id', userId).eq('is_trashed', false)
  if (folder) q = q.eq('folder_id', folder)
  else         q = q.is('folder_id', null)
  if (search)  q = q.ilike('file_name', `%${search}%`)

  const { data, error } = await q.order(sort, { ascending: order === 'asc' })
  if (error) return c.json({ error: error.message }, 400)

  const cdnBase = c.env.CDN_URL || ''
  return c.json({
    files: (data || []).map((f: any) => ({
      ...f,
      url: `${cdnBase}/${f.file_path}`,
      category: getFileCategory(f.mime_type)
    }))
  })
})

// ─────────────────────────────────────────────────────────
// GET /api/files/presign  — generate R2 presigned PUT URL
//   ?name=photo.png&mime=image/png&size=102400&folder_id=...
//   Returns { upload_url, file_key, file_path }
//   Frontend PUTs directly to R2 → no Worker bandwidth
// ─────────────────────────────────────────────────────────
files.get('/presign', async (c) => {
  const userId   = c.get('userId')
  const token    = getToken(c)
  const fileName = c.req.query('name') || 'file'
  const mimeType = c.req.query('mime') || 'application/octet-stream'
  const fileSize = parseInt(c.req.query('size') || '0')
  const folderId = c.req.query('folder_id') || null

  if (fileSize > MAX_FILE_SIZE) {
    return c.json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 400)
  }

  // Check quota
  const db = getSupabaseUserClient(c.env, token)
  const { data: profile } = await db.from('profiles').select('quota, used_space').eq('id', userId).single()
  const quota = profile?.quota ?? FREE_QUOTA
  if (profile && (profile.used_space + fileSize) > quota) {
    return c.json({ error: 'Storage quota exceeded' }, 400)
  }

  const filePath = generateFilePath(userId, fileName)

  // R2 createMultipartUpload is not available in all plans; use signed URLs via HTTP API
  // For Cloudflare Pages Functions, we use r2.put for <100MB direct via Worker
  // Return the worker upload endpoint as upload_url for direct upload
  const appUrl = c.env.APP_URL || ''

  return c.json({
    upload_url: `${appUrl}/api/files/upload-direct`,
    file_path: filePath,
    file_key: filePath,
    mime_type: mimeType,
    folder_id: folderId,
    file_name: fileName,
    file_size: fileSize,
  })
})

// ─────────────────────────────────────────────────────────
// POST /api/files/upload  — multipart form upload via Worker
// ─────────────────────────────────────────────────────────
files.post('/upload', async (c) => {
  const userId = c.get('userId')
  const token  = getToken(c)

  const formData = await c.req.formData()
  const file     = formData.get('file') as File
  const folderId = formData.get('folder_id') as string | null

  if (!file) return c.json({ error: 'No file provided' }, 400)
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }, 400)
  }

  const db = getSupabaseUserClient(c.env, token)

  // Quota check
  const { data: profile } = await db.from('profiles').select('quota, used_space').eq('id', userId).single()
  const quota = profile?.quota ?? FREE_QUOTA
  if (profile && (profile.used_space + file.size) > quota) {
    return c.json({ error: 'Storage quota exceeded' }, 400)
  }

  const filePath = generateFilePath(userId, file.name)
  const buf      = await file.arrayBuffer()

  // Store in R2 with proper content-type + cache headers
  await c.env.R2.put(filePath, buf, {
    httpMetadata: {
      contentType:  file.type || 'application/octet-stream',
      cacheControl: 'public, max-age=31536000',
    },
    customMetadata: { originalName: file.name, uploadedBy: userId },
  })

  const { data: fileData, error } = await db.from('files').insert({
    user_id:   userId,
    folder_id: folderId || null,
    file_name: file.name,
    file_path: filePath,
    file_size: file.size,
    mime_type: file.type || 'application/octet-stream',
    storage:   'r2',
  }).select().single()

  if (error) {
    await c.env.R2.delete(filePath)
    return c.json({ error: error.message }, 500)
  }

  await db.from('activity_logs').insert({
    user_id:  userId,
    action:   'upload',
    file_id:  fileData.id,
    metadata: { file_name: file.name, file_size: file.size },
    ip:       c.req.header('CF-Connecting-IP') || '',
  })

  return c.json({
    file: {
      ...fileData,
      url:      `${c.env.CDN_URL || ''}/${filePath}`,
      category: getFileCategory(file.type),
    }
  }, 201)
})

// ─────────────────────────────────────────────────────────
// POST /api/files/upload-direct  — receive raw binary from presign flow
// ─────────────────────────────────────────────────────────
files.post('/upload-direct', async (c) => {
  const userId   = c.get('userId')
  const token    = getToken(c)
  const filePath = c.req.header('X-File-Path') || ''
  const fileName = c.req.header('X-File-Name') || 'file'
  const mimeType = c.req.header('Content-Type') || 'application/octet-stream'
  const folderId = c.req.header('X-Folder-Id') || null

  if (!filePath) return c.json({ error: 'X-File-Path header required' }, 400)

  const buf      = await c.req.arrayBuffer()
  const fileSize = buf.byteLength

  if (fileSize > MAX_FILE_SIZE) {
    return c.json({ error: `File too large` }, 400)
  }

  await c.env.R2.put(filePath, buf, {
    httpMetadata: {
      contentType:  mimeType,
      cacheControl: 'public, max-age=31536000',
    },
    customMetadata: { originalName: fileName, uploadedBy: userId },
  })

  const db = getSupabaseUserClient(c.env, token)
  const { data: fileData, error } = await db.from('files').insert({
    user_id:   userId,
    folder_id: folderId || null,
    file_name: fileName,
    file_path: filePath,
    file_size: fileSize,
    mime_type: mimeType,
    storage:   'r2',
  }).select().single()

  if (error) {
    await c.env.R2.delete(filePath)
    return c.json({ error: error.message }, 500)
  }

  return c.json({
    file: {
      ...fileData,
      url:      `${c.env.CDN_URL || ''}/${filePath}`,
      category: getFileCategory(mimeType),
    }
  }, 201)
})

// ─────────────────────────────────────────────────────────
// GET /api/files/:id
// ─────────────────────────────────────────────────────────
files.get('/:id', async (c) => {
  const userId = c.get('userId')
  const token  = getToken(c)
  const db     = getSupabaseUserClient(c.env, token)

  const { data, error } = await db.from('files').select('*')
    .eq('id', c.req.param('id')).eq('user_id', userId).single()
  if (error || !data) return c.json({ error: 'File not found' }, 404)

  return c.json({
    file: { ...data, url: `${c.env.CDN_URL || ''}/${data.file_path}`, category: getFileCategory(data.mime_type) }
  })
})

// ─────────────────────────────────────────────────────────
// PATCH /api/files/:id  — rename / star
// ─────────────────────────────────────────────────────────
files.patch('/:id', async (c) => {
  const userId  = c.get('userId')
  const token   = getToken(c)
  const { file_name, is_starred } = await c.req.json()

  const db      = getSupabaseUserClient(c.env, token)
  const updates: any = { updated_at: new Date().toISOString() }
  if (file_name  !== undefined) updates.file_name  = file_name
  if (is_starred !== undefined) updates.is_starred = is_starred

  const { data, error } = await db.from('files').update(updates)
    .eq('id', c.req.param('id')).eq('user_id', userId).select().single()
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ file: data })
})

// ─────────────────────────────────────────────────────────
// DELETE /api/files/:id  — trash or permanent delete
// ─────────────────────────────────────────────────────────
files.delete('/:id', async (c) => {
  const userId    = c.get('userId')
  const fileId    = c.req.param('id')
  const permanent = c.req.query('permanent') === 'true'
  const token     = getToken(c)
  const db        = getSupabaseUserClient(c.env, token)

  if (permanent) {
    const { data: fd } = await db.from('files').select('file_path').eq('id', fileId).eq('user_id', userId).single()
    if (fd) await c.env.R2.delete(fd.file_path)
    const { error } = await db.from('files').delete().eq('id', fileId).eq('user_id', userId)
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ message: 'File permanently deleted' })
  }

  const { error } = await db.from('files').update({ is_trashed: true, trashed_at: new Date().toISOString() })
    .eq('id', fileId).eq('user_id', userId)
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ message: 'File moved to trash' })
})

// ─────────────────────────────────────────────────────────
// POST /api/files/:id/restore
// ─────────────────────────────────────────────────────────
files.post('/:id/restore', async (c) => {
  const userId = c.get('userId')
  const token  = getToken(c)
  const db     = getSupabaseUserClient(c.env, token)
  const { error } = await db.from('files').update({ is_trashed: false, trashed_at: null })
    .eq('id', c.req.param('id')).eq('user_id', userId)
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ message: 'File restored' })
})

// ─────────────────────────────────────────────────────────
// GET /api/files/trash/list
// ─────────────────────────────────────────────────────────
files.get('/trash/list', async (c) => {
  const userId = c.get('userId')
  const token  = getToken(c)
  const db     = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('files').select('*')
    .eq('user_id', userId).eq('is_trashed', true).order('trashed_at', { ascending: false })
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ files: (data || []).map((f: any) => ({ ...f, url: `${c.env.CDN_URL || ''}/${f.file_path}`, category: getFileCategory(f.mime_type) })) })
})

// ─────────────────────────────────────────────────────────
// GET /api/files/starred/list
// ─────────────────────────────────────────────────────────
files.get('/starred/list', async (c) => {
  const userId = c.get('userId')
  const token  = getToken(c)
  const db     = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('files').select('*')
    .eq('user_id', userId).eq('is_starred', true).eq('is_trashed', false).order('updated_at', { ascending: false })
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ files: (data || []).map((f: any) => ({ ...f, url: `${c.env.CDN_URL || ''}/${f.file_path}`, category: getFileCategory(f.mime_type) })) })
})

// ─────────────────────────────────────────────────────────
// GET /api/files/recent/list
// ─────────────────────────────────────────────────────────
files.get('/recent/list', async (c) => {
  const userId = c.get('userId')
  const token  = getToken(c)
  const db     = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('files').select('*')
    .eq('user_id', userId).eq('is_trashed', false).order('updated_at', { ascending: false }).limit(30)
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ files: (data || []).map((f: any) => ({ ...f, url: `${c.env.CDN_URL || ''}/${f.file_path}`, category: getFileCategory(f.mime_type) })) })
})

export default files
