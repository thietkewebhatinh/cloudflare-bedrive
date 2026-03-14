// Files routes - upload, list, delete, rename, star, trash
import { Hono } from 'hono'
import { getSupabaseUserClient, getSupabaseClient, generateFilePath, getFileCategory } from '../lib/supabase'
import { authMiddleware } from '../middleware/auth'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string
  R2: R2Bucket
  CDN_URL: string
}

type Variables = {
  userId: string
  userEmail: string
  userRole: string
}

const files = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Apply auth middleware
files.use('*', authMiddleware)

// Get token helper
function getToken(c: any): string {
  const auth = c.req.header('Authorization')
  if (auth && auth.startsWith('Bearer ')) return auth.substring(7)
  const cookie = c.req.header('Cookie') || ''
  const cookies = cookie.split(';').reduce((a: any, v: string) => {
    const [k, val] = v.trim().split('=')
    if (k && val) a[k.trim()] = decodeURIComponent(val.trim())
    return a
  }, {})
  return cookies['sb_token'] || ''
}

// List files in folder
files.get('/', async (c) => {
  const userId = c.get('userId')
  const folderId = c.req.query('folder') || null
  const search = c.req.query('search') || ''
  const sort = c.req.query('sort') || 'created_at'
  const order = c.req.query('order') || 'desc'
  const token = getToken(c)
  
  const supabase = getSupabaseUserClient(c.env, token)
  
  let query = supabase
    .from('files')
    .select('*')
    .eq('user_id', userId)
    .eq('is_trashed', false)
  
  if (folderId) {
    query = query.eq('folder_id', folderId)
  } else {
    query = query.is('folder_id', null)
  }
  
  if (search) {
    query = query.ilike('file_name', `%${search}%`)
  }
  
  const { data, error } = await query.order(sort, { ascending: order === 'asc' })
  
  if (error) return c.json({ error: error.message }, 400)
  
  const filesWithUrl = (data || []).map((f: any) => ({
    ...f,
    url: `${c.env.CDN_URL || ''}/${f.file_path}`,
    category: getFileCategory(f.mime_type)
  }))
  
  return c.json({ files: filesWithUrl })
})

// Get single file
files.get('/:id', async (c) => {
  const userId = c.get('userId')
  const fileId = c.req.param('id')
  const token = getToken(c)
  const supabase = getSupabaseUserClient(c.env, token)
  
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .eq('user_id', userId)
    .single()
  
  if (error || !data) return c.json({ error: 'File not found' }, 404)
  
  return c.json({
    file: {
      ...data,
      url: `${c.env.CDN_URL || ''}/${data.file_path}`,
      category: getFileCategory(data.mime_type)
    }
  })
})

// Upload file
files.post('/upload', async (c) => {
  const userId = c.get('userId')
  const token = getToken(c)
  
  const formData = await c.req.formData()
  const file = formData.get('file') as File
  const folderId = formData.get('folder_id') as string | null
  
  if (!file) return c.json({ error: 'No file provided' }, 400)
  
  // Validate file size (max 100MB per file)
  if (file.size > 100 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 100MB)' }, 400)
  }
  
  // Check user quota
  const supabase = getSupabaseUserClient(c.env, token)
  const { data: profile } = await supabase
    .from('profiles')
    .select('quota, used_space')
    .eq('id', userId)
    .single()
  
  if (profile && (profile.used_space + file.size) > profile.quota) {
    return c.json({ error: 'Storage quota exceeded' }, 400)
  }
  
  // Generate file path
  const filePath = generateFilePath(userId, file.name)
  
  // Upload to R2
  const arrayBuffer = await file.arrayBuffer()
  await c.env.R2.put(filePath, arrayBuffer, {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
    }
  })
  
  // Save metadata to Supabase
  const { data: fileData, error } = await supabase
    .from('files')
    .insert({
      user_id: userId,
      folder_id: folderId || null,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      storage: 'r2',
    })
    .select()
    .single()
  
  if (error) {
    // Cleanup R2 if DB failed
    await c.env.R2.delete(filePath)
    return c.json({ error: error.message }, 500)
  }
  
  // Log activity
  await supabase.from('activity_logs').insert({
    user_id: userId,
    action: 'upload',
    file_id: fileData.id,
    metadata: { file_name: file.name, file_size: file.size },
    ip: c.req.header('CF-Connecting-IP') || '',
  })
  
  return c.json({
    file: {
      ...fileData,
      url: `${c.env.CDN_URL || ''}/${filePath}`,
      category: getFileCategory(file.type)
    }
  }, 201)
})

// Rename file
files.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const fileId = c.req.param('id')
  const token = getToken(c)
  const { file_name, is_starred } = await c.req.json()
  
  const supabase = getSupabaseUserClient(c.env, token)
  const updates: any = { updated_at: new Date().toISOString() }
  if (file_name !== undefined) updates.file_name = file_name
  if (is_starred !== undefined) updates.is_starred = is_starred
  
  const { data, error } = await supabase
    .from('files')
    .update(updates)
    .eq('id', fileId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ file: data })
})

// Move to trash
files.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const fileId = c.req.param('id')
  const permanent = c.req.query('permanent') === 'true'
  const token = getToken(c)
  
  const supabase = getSupabaseUserClient(c.env, token)
  
  if (permanent) {
    // Get file path first
    const { data: fileData } = await supabase
      .from('files')
      .select('file_path')
      .eq('id', fileId)
      .eq('user_id', userId)
      .single()
    
    if (fileData) {
      // Delete from R2
      await c.env.R2.delete(fileData.file_path)
    }
    
    const { error } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId)
      .eq('user_id', userId)
    
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ message: 'File permanently deleted' })
  } else {
    const { error } = await supabase
      .from('files')
      .update({ is_trashed: true, trashed_at: new Date().toISOString() })
      .eq('id', fileId)
      .eq('user_id', userId)
    
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ message: 'File moved to trash' })
  }
})

// Restore from trash
files.post('/:id/restore', async (c) => {
  const userId = c.get('userId')
  const fileId = c.req.param('id')
  const token = getToken(c)
  
  const supabase = getSupabaseUserClient(c.env, token)
  const { error } = await supabase
    .from('files')
    .update({ is_trashed: false, trashed_at: null })
    .eq('id', fileId)
    .eq('user_id', userId)
  
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ message: 'File restored' })
})

// Get trashed files
files.get('/trash/list', async (c) => {
  const userId = c.get('userId')
  const token = getToken(c)
  const supabase = getSupabaseUserClient(c.env, token)
  
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('user_id', userId)
    .eq('is_trashed', true)
    .order('trashed_at', { ascending: false })
  
  if (error) return c.json({ error: error.message }, 400)
  
  return c.json({
    files: (data || []).map((f: any) => ({
      ...f,
      url: `${c.env.CDN_URL || ''}/${f.file_path}`,
      category: getFileCategory(f.mime_type)
    }))
  })
})

// Get starred files
files.get('/starred/list', async (c) => {
  const userId = c.get('userId')
  const token = getToken(c)
  const supabase = getSupabaseUserClient(c.env, token)
  
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('user_id', userId)
    .eq('is_starred', true)
    .eq('is_trashed', false)
    .order('updated_at', { ascending: false })
  
  if (error) return c.json({ error: error.message }, 400)
  
  return c.json({
    files: (data || []).map((f: any) => ({
      ...f,
      url: `${c.env.CDN_URL || ''}/${f.file_path}`,
      category: getFileCategory(f.mime_type)
    }))
  })
})

// Get recent files
files.get('/recent/list', async (c) => {
  const userId = c.get('userId')
  const token = getToken(c)
  const supabase = getSupabaseUserClient(c.env, token)
  
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('user_id', userId)
    .eq('is_trashed', false)
    .order('updated_at', { ascending: false })
    .limit(20)
  
  if (error) return c.json({ error: error.message }, 400)
  
  return c.json({
    files: (data || []).map((f: any) => ({
      ...f,
      url: `${c.env.CDN_URL || ''}/${f.file_path}`,
      category: getFileCategory(f.mime_type)
    }))
  })
})

export default files
