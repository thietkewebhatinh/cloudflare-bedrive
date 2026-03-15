// Share routes - create/manage share links
import { Hono } from 'hono'
import { getSupabaseUserClient, getSupabaseClient, generateShareToken, isDemoMode } from '../lib/supabase'
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
type Variables = { userId: string; userEmail: string; userRole: string; isDemo: boolean }

const shares = new Hono<{ Bindings: Bindings; Variables: Variables }>()

function isDemo(c: any) { return c.get('isDemo') === true || isDemoMode(c.env) }

function getToken(c: any): string {
  const auth = c.req.header('Authorization')
  if (auth && auth.startsWith('Bearer ')) return auth.substring(7)
  const cookie = c.req.header('Cookie') || ''
  return cookie.split(';').reduce((a: any, v: string) => {
    const [k, val] = v.trim().split('=')
    if (k && val) a[k.trim()] = decodeURIComponent(val.trim())
    return a
  }, {})['sb_token'] || ''
}

// ── POST /api/shares — create share link ─────────────────────
shares.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const { file_id, folder_id, password, expires_at, allow_download } = await c.req.json()

  if (!file_id && !folder_id) {
    return c.json({ error: 'file_id or folder_id required' }, 400)
  }

  const appUrl = c.env.APP_URL || ''

  if (isDemo(c)) {
    const existing = file_id ? demoStore.getShareByFileId(file_id) : null
    if (existing) {
      return c.json({
        share: existing,
        share_url: `${appUrl}/s/${existing.share_token}`,
        share_token: existing.share_token,
      })
    }
    const token = generateShareToken()
    const NOW = new Date().toISOString()
    const file = file_id ? demoStore.getFile(file_id) : null
    const share = demoStore.addShare({
      id: demoStore.nextShareId(),
      file_id: file_id || null, folder_id: folder_id || null,
      user_id: DEMO_USER_ID, share_token: token,
      password: password || null, expires_at: expires_at || null,
      allow_download: allow_download !== false,
      created_at: NOW,
      files: file,
    })
    return c.json({
      share,
      share_url: `${appUrl}/s/${token}`,
      share_token: token,
    })
  }

  const token = getToken(c)
  const shareToken = generateShareToken()
  const db = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('shares').insert({
    file_id: file_id || null, folder_id: folder_id || null,
    user_id: userId, share_token: shareToken,
    password: password || null, expires_at: expires_at || null,
    allow_download: allow_download !== false,
  }).select().single()

  if (error) return c.json({ error: error.message }, 400)
  return c.json({
    share: data,
    share_url: `${appUrl}/s/${shareToken}`,
    share_token: shareToken,
  })
})

// ── GET /api/shares/public/:token — public share access ───────
shares.get('/public/:token', async (c) => {
  const token = c.req.param('token')
  const password = c.req.query('password') || null

  if (isDemoMode(c.env)) {
    const share = demoStore.getShare(token)
    if (!share) return c.json({ error: 'Share not found or expired' }, 404)
    if (share.password && share.password !== password) {
      return c.json({ error: 'Password required', requires_password: true }, 401)
    }
    const file = share.file_id ? demoStore.getFile(share.file_id) : null
    return c.json({
      share: {
        ...share,
        file: file ? { ...file, url: file.url || `/r2/${file.file_path}` } : null,
      }
    })
  }

  try {
    const db = getSupabaseClient(c.env)
    const { data: shareData } = await db.from('shares').select('*, files(*)').eq('share_token', token).single()
    if (!shareData) return c.json({ error: 'Share not found' }, 404)
    if (shareData.expires_at && new Date(shareData.expires_at) < new Date()) {
      return c.json({ error: 'Share link expired' }, 410)
    }
    if (shareData.password && shareData.password !== password) {
      return c.json({ error: 'Password required', requires_password: true }, 401)
    }
    const cdnBase = c.env.CDN_URL || ''
    const file = shareData.files as any
    return c.json({
      share: {
        ...shareData,
        file: file ? { ...file, url: `${cdnBase}/${file.file_path}` } : null,
      }
    })
  } catch (e) {
    return c.json({ error: 'Service unavailable' }, 503)
  }
})

// ── GET /api/shares — list user's shares ─────────────────────
shares.get('/', authMiddleware, async (c) => {
  if (isDemo(c)) {
    return c.json({ shares: [] })
  }
  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('shares').select('*, files(file_name, file_size, mime_type)').eq('user_id', userId).order('created_at', { ascending: false })
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ shares: data || [] })
})

// ── GET /api/shares/shared-with-me ───────────────────────────
shares.get('/shared-with-me', authMiddleware, async (c) => {
  if (isDemo(c)) {
    return c.json({ shared: [] })
  }
  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('shared_with_me')
    .select('*, files(file_name, file_size, mime_type), profiles(name)')
    .eq('shared_to_user_id', userId)
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ shared: data || [] })
})

// ── DELETE /api/shares/:id ────────────────────────────────────
shares.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id')
  if (isDemo(c)) return c.json({ message: 'Share deleted' })
  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  await db.from('shares').delete().eq('id', id).eq('user_id', userId)
  return c.json({ message: 'Share deleted' })
})

export default shares
