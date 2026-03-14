// Folders routes - CRUD for folders
import { Hono } from 'hono'
import { getSupabaseUserClient } from '../lib/supabase'
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

const folders = new Hono<{ Bindings: Bindings; Variables: Variables }>()
folders.use('*', authMiddleware)

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

// List folders
folders.get('/', async (c) => {
  const userId = c.get('userId')
  const parentId = c.req.query('parent') || null
  const token = getToken(c)
  const supabase = getSupabaseUserClient(c.env, token)
  
  let query = supabase
    .from('folders')
    .select('*')
    .eq('user_id', userId)
    .eq('is_trashed', false)
  
  if (parentId) {
    query = query.eq('parent_id', parentId)
  } else {
    query = query.is('parent_id', null)
  }
  
  const { data, error } = await query.order('name', { ascending: true })
  if (error) return c.json({ error: error.message }, 400)
  
  return c.json({ folders: data || [] })
})

// Create folder
folders.post('/', async (c) => {
  const userId = c.get('userId')
  const { name, parent_id } = await c.req.json()
  const token = getToken(c)
  
  if (!name) return c.json({ error: 'Folder name required' }, 400)
  
  const supabase = getSupabaseUserClient(c.env, token)
  const { data, error } = await supabase
    .from('folders')
    .insert({
      user_id: userId,
      name,
      parent_id: parent_id || null,
    })
    .select()
    .single()
  
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ folder: data }, 201)
})

// Update folder
folders.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const folderId = c.req.param('id')
  const token = getToken(c)
  const { name, is_starred } = await c.req.json()
  
  const supabase = getSupabaseUserClient(c.env, token)
  const updates: any = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name
  if (is_starred !== undefined) updates.is_starred = is_starred
  
  const { data, error } = await supabase
    .from('folders')
    .update(updates)
    .eq('id', folderId)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ folder: data })
})

// Delete folder (move to trash)
folders.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const folderId = c.req.param('id')
  const permanent = c.req.query('permanent') === 'true'
  const token = getToken(c)
  
  const supabase = getSupabaseUserClient(c.env, token)
  
  if (permanent) {
    const { error } = await supabase
      .from('folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', userId)
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ message: 'Folder permanently deleted' })
  } else {
    const { error } = await supabase
      .from('folders')
      .update({ is_trashed: true, trashed_at: new Date().toISOString() })
      .eq('id', folderId)
      .eq('user_id', userId)
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ message: 'Folder moved to trash' })
  }
})

// Restore folder
folders.post('/:id/restore', async (c) => {
  const userId = c.get('userId')
  const folderId = c.req.param('id')
  const token = getToken(c)
  
  const supabase = getSupabaseUserClient(c.env, token)
  const { error } = await supabase
    .from('folders')
    .update({ is_trashed: false, trashed_at: null })
    .eq('id', folderId)
    .eq('user_id', userId)
  
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ message: 'Folder restored' })
})

// Get folder contents (folders + files)
folders.get('/:id/contents', async (c) => {
  const userId = c.get('userId')
  const folderId = c.req.param('id')
  const token = getToken(c)
  const supabase = getSupabaseUserClient(c.env, token)
  
  const [foldersRes, filesRes, folderRes] = await Promise.all([
    supabase.from('folders').select('*').eq('user_id', userId).eq('parent_id', folderId).eq('is_trashed', false).order('name'),
    supabase.from('files').select('*').eq('user_id', userId).eq('folder_id', folderId).eq('is_trashed', false).order('created_at', { ascending: false }),
    supabase.from('folders').select('*').eq('id', folderId).single()
  ])
  
  return c.json({
    folder: folderRes.data,
    folders: foldersRes.data || [],
    files: (filesRes.data || []).map((f: any) => ({
      ...f,
      url: `${c.env.CDN_URL || ''}/${f.file_path}`
    }))
  })
})

export default folders
