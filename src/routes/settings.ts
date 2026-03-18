// Settings & full admin user management routes
import { Hono } from 'hono'
import { getSupabaseServiceClient, getSupabaseClient, getSupabaseUserClient, isDemoMode } from '../lib/supabase'
import { authMiddleware, adminMiddleware, DEMO_USER_ID, DEMO_TOKEN } from '../middleware/auth'
import { MOCK_USERS } from '../lib/mockData'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string
  R2: R2Bucket
  CDN_URL: string
  APP_URL: string
}
type Variables = { userId: string; userEmail: string; userRole: string; isDemo: boolean }

const settings = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// All settings routes require authentication
settings.use('*', authMiddleware)

// Only admin routes for user management and config
// /me/* routes skip the admin check
settings.use('/users*',         adminMiddleware)
settings.use('/config',         adminMiddleware)
settings.use('/storage-stats',  adminMiddleware)

function isDemo(c: any) { return c.get('isDemo') === true || isDemoMode(c.env) }
function getToken(c: any): string {
  const auth = c.req.header('Authorization')
  if (auth?.startsWith('Bearer ')) return auth.substring(7)
  return ''
}

// ──────────────────────────────────────────────────────────────
// GET /api/settings/config — get app config (connection + app)
// ──────────────────────────────────────────────────────────────
settings.get('/config', async (c) => {
  return c.json({
    supabase_url: isDemo(c) ? 'https://your-project.supabase.co' : (c.env.SUPABASE_URL || ''),
    cdn_url: c.env.CDN_URL || '',
    app_url: c.env.APP_URL || '',
    app_name: 'BeDrive',
    app_version: '1.0.0',
    free_quota_gb: 5,
    max_file_size_mb: 100,
    allowed_types: ['image/*', 'video/*', 'audio/*', 'application/pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', 'text/plain'],
    r2_bucket: 'bedrive-storage',
    demo_mode: isDemo(c),
  })
})

// ──────────────────────────────────────────────────────────────
// GET /api/settings/users — list all users (paginated)
// ──────────────────────────────────────────────────────────────
settings.get('/users', async (c) => {
  const page   = parseInt(c.req.query('page')   || '1')
  const limit  = parseInt(c.req.query('limit')  || '20')
  const search = c.req.query('search') || ''
  const role   = c.req.query('role') || ''

  if (isDemo(c)) {
    let users = [...MOCK_USERS]
    if (search) users = users.filter(u => u.email.includes(search) || u.name.includes(search))
    if (role)   users = users.filter(u => u.role === role)
    return c.json({ users, total: users.length, page, limit })
  }

  try {
    const svc = getSupabaseServiceClient(c.env)
    let q = svc.from('profiles').select('*', { count: 'exact' })
    if (search) q = q.or(`email.ilike.%${search}%,name.ilike.%${search}%`)
    if (role)   q = q.eq('role', role)
    const { data, error, count } = await q
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ users: data || [], total: count || 0, page, limit })
  } catch (e) {
    return c.json({ error: 'Service unavailable' }, 503)
  }
})

// ──────────────────────────────────────────────────────────────
// GET /api/settings/users/:id — get single user
// ──────────────────────────────────────────────────────────────
settings.get('/users/:id', async (c) => {
  const id = c.req.param('id')
  if (isDemo(c)) {
    const u = MOCK_USERS.find(u => u.id === id)
    return u ? c.json({ user: u }) : c.json({ error: 'Not found' }, 404)
  }
  try {
    const svc = getSupabaseServiceClient(c.env)
    const { data, error } = await svc.from('profiles').select('*').eq('id', id).single()
    if (error || !data) return c.json({ error: 'User not found' }, 404)
    return c.json({ user: data })
  } catch (e) {
    return c.json({ error: 'Service unavailable' }, 503)
  }
})

// ──────────────────────────────────────────────────────────────
// POST /api/settings/users — create new user
// ──────────────────────────────────────────────────────────────
settings.post('/users', async (c) => {
  const { email, password, name, role, quota } = await c.req.json()
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

  if (isDemo(c)) {
    return c.json({
      user: {
        id: 'demo-new-' + Date.now(), email, name: name || email.split('@')[0],
        role: role || 'user', quota: quota || 5368709120, used_space: 0,
        created_at: new Date().toISOString(),
      },
      message: 'User created (demo)'
    })
  }

  try {
    const svc = getSupabaseServiceClient(c.env)
    // Create auth user
    const { data: authUser, error: authErr } = await svc.auth.admin.createUser({
      email, password,
      email_confirm: true,
      user_metadata: { name: name || email.split('@')[0] }
    })
    if (authErr) return c.json({ error: authErr.message }, 400)

    // Update profile
    const updates: any = {}
    if (name)  updates.name  = name
    if (role)  updates.role  = role
    if (quota) updates.quota = quota
    if (Object.keys(updates).length > 0) {
      await svc.from('profiles').update(updates).eq('id', authUser.user.id)
    }

    const { data: profile } = await svc.from('profiles').select('*').eq('id', authUser.user.id).single()
    return c.json({ user: profile, message: 'User created successfully' })
  } catch (e: any) {
    return c.json({ error: e.message || 'Failed to create user' }, 500)
  }
})

// ──────────────────────────────────────────────────────────────
// PATCH /api/settings/users/:id — update user (name, role, quota, avatar)
// ──────────────────────────────────────────────────────────────
settings.patch('/users/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  if (isDemo(c)) {
    return c.json({ user: { ...MOCK_USERS[0], ...body, id }, message: 'User updated (demo)' })
  }

  try {
    const svc = getSupabaseServiceClient(c.env)
    const profileUpdates: any = {}
    if (body.name   !== undefined) profileUpdates.name   = body.name
    if (body.role   !== undefined) profileUpdates.role   = body.role
    if (body.quota  !== undefined) profileUpdates.quota  = body.quota
    if (body.avatar !== undefined) profileUpdates.avatar = body.avatar

    if (Object.keys(profileUpdates).length > 0) {
      profileUpdates.updated_at = new Date().toISOString()
      const { error } = await svc.from('profiles').update(profileUpdates).eq('id', id)
      if (error) return c.json({ error: error.message }, 400)
    }

    // Update email via auth admin API
    if (body.email) {
      const { error } = await svc.auth.admin.updateUserById(id, { email: body.email, email_confirm: true })
      if (error) return c.json({ error: error.message }, 400)
      await svc.from('profiles').update({ email: body.email }).eq('id', id)
    }

    const { data } = await svc.from('profiles').select('*').eq('id', id).single()
    return c.json({ user: data, message: 'User updated successfully' })
  } catch (e: any) {
    return c.json({ error: e.message || 'Failed to update user' }, 500)
  }
})

// ──────────────────────────────────────────────────────────────
// POST /api/settings/users/:id/password — change user password
// ──────────────────────────────────────────────────────────────
settings.post('/users/:id/password', async (c) => {
  const id = c.req.param('id')
  const { password } = await c.req.json()
  if (!password || password.length < 6) return c.json({ error: 'Password must be at least 6 characters' }, 400)

  if (isDemo(c)) {
    return c.json({ message: 'Password updated (demo)' })
  }

  try {
    const svc = getSupabaseServiceClient(c.env)
    const { error } = await svc.auth.admin.updateUserById(id, { password })
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ message: 'Password updated successfully' })
  } catch (e: any) {
    return c.json({ error: e.message || 'Failed to update password' }, 500)
  }
})

// ──────────────────────────────────────────────────────────────
// DELETE /api/settings/users/:id — delete user + all their data
// ──────────────────────────────────────────────────────────────
settings.delete('/users/:id', async (c) => {
  const id = c.req.param('id')
  const adminId = c.get('userId')
  if (id === adminId) return c.json({ error: 'Cannot delete your own account' }, 400)

  if (isDemo(c)) return c.json({ message: 'User deleted (demo)' })

  try {
    const svc = getSupabaseServiceClient(c.env)
    // Delete auth user (cascade deletes profile + data via FK)
    const { error } = await svc.auth.admin.deleteUser(id)
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ message: 'User and all their data deleted' })
  } catch (e: any) {
    return c.json({ error: e.message || 'Failed to delete user' }, 500)
  }
})

// ──────────────────────────────────────────────────────────────
// POST /api/settings/users/:id/reset-storage — reset used_space
// ──────────────────────────────────────────────────────────────
settings.post('/users/:id/reset-storage', async (c) => {
  const id = c.req.param('id')
  if (isDemo(c)) return c.json({ message: 'Storage reset (demo)' })
  try {
    const svc = getSupabaseServiceClient(c.env)
    const { data: files } = await svc.from('files').select('file_size').eq('user_id', id)
    const actual = (files || []).reduce((s: number, f: any) => s + (f.file_size || 0), 0)
    await svc.from('profiles').update({ used_space: actual }).eq('id', id)
    return c.json({ message: 'Storage recalculated', used_space: actual })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ──────────────────────────────────────────────────────────────
// PATCH /api/settings/me/password — change own password
// ──────────────────────────────────────────────────────────────
settings.patch('/me/password', async (c) => {
  const { current_password, new_password } = await c.req.json()
  if (!new_password || new_password.length < 6) return c.json({ error: 'New password must be at least 6 characters' }, 400)
  if (isDemo(c)) return c.json({ message: 'Password updated (demo)' })
  try {
    const token = getToken(c)
    const supabase = getSupabaseUserClient(c.env, token)
    const { error } = await supabase.auth.updateUser({ password: new_password })
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ message: 'Password updated successfully' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ──────────────────────────────────────────────────────────────
// PATCH /api/settings/me/email — change own email
// ──────────────────────────────────────────────────────────────
settings.patch('/me/email', async (c) => {
  const { email } = await c.req.json()
  if (!email) return c.json({ error: 'Email required' }, 400)
  if (isDemo(c)) return c.json({ message: 'Email updated (demo)' })
  try {
    const token = getToken(c)
    const supabase = getSupabaseUserClient(c.env, token)
    const { error } = await supabase.auth.updateUser({ email })
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ message: 'Verification email sent. Check your inbox.' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ──────────────────────────────────────────────────────────────
// GET /api/settings/storage-stats
// ──────────────────────────────────────────────────────────────
settings.get('/storage-stats', async (c) => {
  if (isDemo(c)) {
    return c.json({
      total_files: 7, total_size: 24481792,
      total_users: 3, total_quota: 3 * 5368709120,
      top_users: MOCK_USERS.slice(0, 5),
    })
  }
  try {
    const svc = getSupabaseServiceClient(c.env)
    const [filesR, usersR] = await Promise.all([
      svc.from('files').select('file_size').eq('is_trashed', false),
      svc.from('profiles').select('id, name, email, used_space, quota').order('used_space', { ascending: false }).limit(10),
    ])
    const totalSize = (filesR.data || []).reduce((s: number, f: any) => s + (f.file_size || 0), 0)
    return c.json({
      total_files: (filesR.data || []).length,
      total_size: totalSize,
      total_users: (usersR.data || []).length,
      top_users: usersR.data || [],
    })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default settings
