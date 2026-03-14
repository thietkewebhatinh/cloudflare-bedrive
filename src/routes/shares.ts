// Share routes - create/manage share links
import { Hono } from 'hono'
import { getSupabaseUserClient, getSupabaseClient, generateShareToken } from '../lib/supabase'
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

const shares = new Hono<{ Bindings: Bindings; Variables: Variables }>()

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

// Create share link (requires auth)
shares.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const token = getToken(c)
  const { file_id, folder_id, password, expires_at, allow_download } = await c.req.json()
  
  if (!file_id && !folder_id) {
    return c.json({ error: 'file_id or folder_id required' }, 400)
  }
  
  const supabase = getSupabaseUserClient(c.env, token)
  const shareToken = generateShareToken()
  
  const { data, error } = await supabase
    .from('shares')
    .insert({
      file_id: file_id || null,
      folder_id: folder_id || null,
      user_id: userId,
      share_token: shareToken,
      password: password || null,
      expires_at: expires_at || null,
      allow_download: allow_download !== false,
    })
    .select()
    .single()
  
  if (error) return c.json({ error: error.message }, 400)
  
  const appUrl = c.env.APP_URL || 'https://drive.webdep24h.com'
  return c.json({
    share: data,
    share_url: `${appUrl}/s/${shareToken}`
  }, 201)
})

// Get my shares
shares.get('/my', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const token = getToken(c)
  const supabase = getSupabaseUserClient(c.env, token)
  
  const { data, error } = await supabase
    .from('shares')
    .select(`
      *,
      files(id, file_name, file_size, mime_type),
      folders(id, name)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ shares: data || [] })
})

// Delete share
shares.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const shareId = c.req.param('id')
  const token = getToken(c)
  const supabase = getSupabaseUserClient(c.env, token)
  
  const { error } = await supabase
    .from('shares')
    .delete()
    .eq('id', shareId)
    .eq('user_id', userId)
  
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ message: 'Share deleted' })
})

// Public: Access shared item by token (no auth needed)
shares.get('/public/:token', async (c) => {
  const shareToken = c.req.param('token')
  const password = c.req.query('password') || ''
  
  const supabase = getSupabaseClient(c.env)
  const { data: share, error } = await supabase
    .from('shares')
    .select(`
      *,
      files(id, file_name, file_size, mime_type, file_path),
      folders(id, name)
    `)
    .eq('share_token', shareToken)
    .single()
  
  if (error || !share) return c.json({ error: 'Share not found' }, 404)
  
  // Check expiry
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return c.json({ error: 'Share link has expired' }, 410)
  }
  
  // Check password
  if (share.password && share.password !== password) {
    return c.json({ error: 'Password required', requires_password: true }, 401)
  }
  
  // Increment view count
  await supabase
    .from('shares')
    .update({ view_count: (share.view_count || 0) + 1 })
    .eq('id', share.id)
  
  const cdnUrl = c.env.CDN_URL || ''
  
  return c.json({
    share: {
      id: share.id,
      allow_download: share.allow_download,
      file: share.files ? {
        ...share.files,
        url: `${cdnUrl}/${share.files.file_path}`,
      } : null,
      folder: share.folders || null,
    }
  })
})

// Get files shared with me
shares.get('/shared-with-me', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const token = getToken(c)
  const supabase = getSupabaseUserClient(c.env, token)
  
  const { data, error } = await supabase
    .from('shared_with_me')
    .select(`
      *,
      files(id, file_name, file_size, mime_type, file_path),
      folders(id, name),
      profiles!owner_id(name, email, avatar)
    `)
    .eq('shared_with_id', userId)
  
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ shared: data || [] })
})

export default shares
