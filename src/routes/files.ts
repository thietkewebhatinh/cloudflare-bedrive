// Files routes - upload, list, delete, rename, star, trash
import { Hono } from 'hono'
import { getSupabaseUserClient, generateFilePath, getFileCategory, isDemoMode } from '../lib/supabase'
import { authMiddleware, DEMO_USER_ID } from '../middleware/auth'
import { demoStore } from '../lib/mockData'

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
  isDemo: boolean
}

const files = new Hono<{ Bindings: Bindings; Variables: Variables }>()
files.use('*', authMiddleware)

const FREE_QUOTA = 5 * 1024 * 1024 * 1024
const MAX_FILE_SIZE = 100 * 1024 * 1024

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

function isDemo(c: any): boolean {
  return c.get('isDemo') === true || isDemoMode(c.env)
}

// ── GET /api/files  — list files in folder ───────────────────
files.get('/', async (c) => {
  const folder = c.req.query('folder') || null
  const search = c.req.query('search') || ''

  if (isDemo(c)) {
    return c.json({
      files: demoStore.getFiles(folder, false, false, search).map(f => ({
        ...f, category: getFileCategory(f.mime_type)
      }))
    })
  }

  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  let q = db.from('files').select('*').eq('user_id', userId).eq('is_trashed', false)
  if (folder) q = q.eq('folder_id', folder)
  else        q = q.is('folder_id', null)
  if (search) q = q.ilike('file_name', `%${search}%`)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) return c.json({ error: error.message }, 400)
  const cdnBase = c.env.CDN_URL || ''
  return c.json({
    files: (data || []).map((f: any) => ({
      ...f, url: `${cdnBase}/${f.file_path}`, category: getFileCategory(f.mime_type)
    }))
  })
})

// ── GET /api/files/recent/list ────────────────────────────────
files.get('/recent/list', async (c) => {
  if (isDemo(c)) {
    return c.json({ files: demoStore.getRecentFiles().map(f => ({ ...f, category: getFileCategory(f.mime_type) })) })
  }
  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('files').select('*').eq('user_id', userId).eq('is_trashed', false)
    .order('updated_at', { ascending: false }).limit(50)
  if (error) return c.json({ error: error.message }, 400)
  const cdnBase = c.env.CDN_URL || ''
  return c.json({ files: (data || []).map((f: any) => ({ ...f, url: `${cdnBase}/${f.file_path}`, category: getFileCategory(f.mime_type) })) })
})

// ── GET /api/files/starred/list ───────────────────────────────
files.get('/starred/list', async (c) => {
  if (isDemo(c)) {
    return c.json({ files: demoStore.getFiles(null, false, true).map(f => ({ ...f, category: getFileCategory(f.mime_type) })) })
  }
  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('files').select('*').eq('user_id', userId).eq('is_starred', true).eq('is_trashed', false)
  if (error) return c.json({ error: error.message }, 400)
  const cdnBase = c.env.CDN_URL || ''
  return c.json({ files: (data || []).map((f: any) => ({ ...f, url: `${cdnBase}/${f.file_path}`, category: getFileCategory(f.mime_type) })) })
})

// ── GET /api/files/trash/list ─────────────────────────────────
files.get('/trash/list', async (c) => {
  if (isDemo(c)) {
    return c.json({ files: demoStore.getTrashedFiles().map(f => ({ ...f, category: getFileCategory(f.mime_type) })) })
  }
  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('files').select('*').eq('user_id', userId).eq('is_trashed', true)
  if (error) return c.json({ error: error.message }, 400)
  const cdnBase = c.env.CDN_URL || ''
  return c.json({ files: (data || []).map((f: any) => ({ ...f, url: `${cdnBase}/${f.file_path}`, category: getFileCategory(f.mime_type) })) })
})

// ── POST /api/files/upload — direct upload via FormData ───────
files.post('/upload', async (c) => {
  const userId = c.get('userId')

  if (isDemo(c)) {
    // Simulate upload in demo mode
    const body = await c.req.parseBody()
    const fileObj = body['file'] as File | null
    const folderId = (body['folder_id'] as string) || null
    if (!fileObj) return c.json({ error: 'No file provided' }, 400)

    const NOW = new Date().toISOString()
    const newFile = {
      id: demoStore.nextFileId(),
      user_id: DEMO_USER_ID,
      folder_id: folderId,
      file_name: fileObj.name,
      file_path: `demo/${Date.now()}-${fileObj.name}`,
      file_size: fileObj.size,
      mime_type: fileObj.type || 'application/octet-stream',
      storage: 'demo',
      is_public: false, is_starred: false, is_trashed: false,
      created_at: NOW, updated_at: NOW, url: '',
    }
    demoStore.addFile(newFile)
    return c.json({ file: { ...newFile, category: getFileCategory(newFile.mime_type) }, message: 'File uploaded (demo)' })
  }

  // Real upload
  const token = getToken(c)
  const body = await c.req.parseBody()
  const fileObj = body['file'] as File | null
  const folderId = (body['folder_id'] as string) || null

  if (!fileObj) return c.json({ error: 'No file provided' }, 400)
  if (fileObj.size > MAX_FILE_SIZE) return c.json({ error: 'File too large (max 100MB)' }, 400)

  const filePath = generateFilePath(userId, fileObj.name)
  const arrayBuf = await fileObj.arrayBuffer()

  try {
    await c.env.R2.put(filePath, arrayBuf, {
      httpMetadata: { contentType: fileObj.type || 'application/octet-stream' }
    })
  } catch (e) {
    return c.json({ error: 'Storage upload failed' }, 500)
  }

  const db = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('files').insert({
    user_id: userId, folder_id: folderId || null,
    file_name: fileObj.name, file_path: filePath,
    file_size: fileObj.size, mime_type: fileObj.type || 'application/octet-stream',
    storage: 'r2', is_public: false,
  }).select().single()

  if (error) return c.json({ error: error.message }, 400)
  const cdnBase = c.env.CDN_URL || ''
  return c.json({
    file: { ...data, url: `${cdnBase}/${data.file_path}`, category: getFileCategory(data.mime_type) },
    message: 'Uploaded successfully'
  })
})

// ── GET /api/files/:id ────────────────────────────────────────
files.get('/:id', async (c) => {
  const id = c.req.param('id')
  if (isDemo(c)) {
    const f = demoStore.getFile(id)
    if (!f) return c.json({ error: 'Not found' }, 404)
    return c.json({ file: { ...f, category: getFileCategory(f.mime_type) } })
  }
  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('files').select('*').eq('id', id).eq('user_id', userId).single()
  if (error || !data) return c.json({ error: 'Not found' }, 404)
  const cdnBase = c.env.CDN_URL || ''
  return c.json({ file: { ...data, url: `${cdnBase}/${data.file_path}`, category: getFileCategory(data.mime_type) } })
})

// ── PATCH /api/files/:id ──────────────────────────────────────
files.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const patch = await c.req.json()

  if (isDemo(c)) {
    const updated = demoStore.updateFile(id, { ...patch, updated_at: new Date().toISOString() })
    if (!updated) return c.json({ error: 'Not found' }, 404)
    return c.json({ file: updated })
  }

  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  const allowed: any = {}
  if (patch.file_name !== undefined) allowed.file_name = patch.file_name
  if (patch.is_starred !== undefined) allowed.is_starred = patch.is_starred
  if (patch.folder_id  !== undefined) allowed.folder_id = patch.folder_id
  const { data, error } = await db.from('files').update(allowed).eq('id', id).eq('user_id', userId).select().single()
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ file: data })
})

// ── DELETE /api/files/:id ─────────────────────────────────────
files.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const permanent = c.req.query('permanent') === 'true'

  if (isDemo(c)) {
    if (permanent) {
      demoStore.deleteFile(id)
    } else {
      demoStore.updateFile(id, { is_trashed: true, trashed_at: new Date().toISOString() })
    }
    return c.json({ message: permanent ? 'Permanently deleted' : 'Moved to trash' })
  }

  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  if (permanent) {
    const { data: file } = await db.from('files').select('file_path').eq('id', id).eq('user_id', userId).single()
    if (file?.file_path) { try { await c.env.R2.delete(file.file_path) } catch (e) {} }
    await db.from('files').delete().eq('id', id).eq('user_id', userId)
  } else {
    await db.from('files').update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq('id', id).eq('user_id', userId)
  }
  return c.json({ message: permanent ? 'Permanently deleted' : 'Moved to trash' })
})

// ── POST /api/files/:id/restore ───────────────────────────────
files.post('/:id/restore', async (c) => {
  const id = c.req.param('id')
  if (isDemo(c)) {
    demoStore.updateFile(id, { is_trashed: false, trashed_at: null })
    return c.json({ message: 'File restored' })
  }
  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  await db.from('files').update({ is_trashed: false, trashed_at: null }).eq('id', id).eq('user_id', userId)
  return c.json({ message: 'File restored' })
})

export default files
