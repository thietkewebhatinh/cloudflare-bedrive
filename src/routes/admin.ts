// Admin routes - analytics, user management
import { Hono } from 'hono'
import { getSupabaseServiceClient, isDemoMode } from '../lib/supabase'
import { authMiddleware, adminMiddleware } from '../middleware/auth'
import { MOCK_USERS, MOCK_LOGS, demoStore } from '../lib/mockData'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string
  R2: R2Bucket
}
type Variables = { userId: string; userEmail: string; userRole: string; isDemo: boolean }

const admin = new Hono<{ Bindings: Bindings; Variables: Variables }>()
admin.use('*', authMiddleware)
admin.use('*', adminMiddleware)

function isDemo(c: any) { return c.get('isDemo') === true || isDemoMode(c.env) }

// ── GET /api/admin/analytics ─────────────────────────────────
admin.get('/analytics', async (c) => {
  if (isDemo(c)) {
    return c.json(demoStore.getAnalytics())
  }

  try {
    const svc = getSupabaseServiceClient(c.env)
    const from = c.req.query('from') || new Date(Date.now() - 7 * 86400000).toISOString()
    const to = c.req.query('to') || new Date().toISOString()

    const [filesRes, foldersRes, usersRes, spaceRes, pageViewsRes] = await Promise.all([
      svc.from('files').select('id', { count: 'exact' }).gte('created_at', from).lte('created_at', to),
      svc.from('folders').select('id', { count: 'exact' }).gte('created_at', from).lte('created_at', to),
      svc.from('profiles').select('id', { count: 'exact' }).gte('created_at', from).lte('created_at', to),
      svc.from('files').select('file_size').gte('created_at', from).lte('created_at', to),
      svc.from('page_views').select('*').gte('created_at', from).lte('created_at', to).order('created_at'),
    ])

    const totalSpace = (spaceRes.data || []).reduce((acc: number, f: any) => acc + (f.file_size || 0), 0)
    const pageViewsByDay: Record<string, number> = {}
    const deviceStats: Record<string, number> = { mobile: 0, tablet: 0, desktop: 0 }

    ;(pageViewsRes.data || []).forEach((pv: any) => {
      const day = pv.created_at?.split('T')[0] || ''
      pageViewsByDay[day] = (pageViewsByDay[day] || 0) + 1
      if (pv.device) deviceStats[pv.device] = (deviceStats[pv.device] || 0) + 1
    })

    return c.json({
      summary: {
        new_files: filesRes.count || 0,
        new_folders: foldersRes.count || 0,
        new_users: usersRes.count || 0,
        total_space_used: totalSpace,
      },
      page_views: Object.entries(pageViewsByDay).map(([date, count]) => ({ date, count })),
      total_views: pageViewsRes.data?.length || 0,
      devices: deviceStats,
    })
  } catch (e) {
    return c.json({ error: 'Service unavailable' }, 503)
  }
})

// ── GET /api/admin/users ──────────────────────────────────────
admin.get('/users', async (c) => {
  if (isDemo(c)) {
    return c.json({ users: MOCK_USERS, total: MOCK_USERS.length, page: 1, limit: 20 })
  }

  try {
    const svc = getSupabaseServiceClient(c.env)
    const page = parseInt(c.req.query('page') || '1')
    const limit = parseInt(c.req.query('limit') || '20')
    const search = c.req.query('search') || ''

    let query = svc.from('profiles').select('*', { count: 'exact' })
    if (search) query = query.ilike('email', `%${search}%`)
    const { data, error, count } = await query.order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ users: data || [], total: count || 0, page, limit })
  } catch (e) {
    return c.json({ error: 'Service unavailable' }, 503)
  }
})

// ── PATCH /api/admin/users/:id ────────────────────────────────
admin.patch('/users/:id', async (c) => {
  if (isDemo(c)) return c.json({ message: 'User updated (demo)' })
  const userId = c.req.param('id')
  const updates = await c.req.json()
  try {
    const svc = getSupabaseServiceClient(c.env)
    const { data, error } = await svc.from('profiles').update(updates).eq('id', userId).select().single()
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ user: data })
  } catch (e) {
    return c.json({ error: 'Service unavailable' }, 503)
  }
})

// ── DELETE /api/admin/users/:id ───────────────────────────────
admin.delete('/users/:id', async (c) => {
  if (isDemo(c)) return c.json({ message: 'User deleted (demo)' })
  const userId = c.req.param('id')
  try {
    const svc = getSupabaseServiceClient(c.env)
    const { error } = await svc.auth.admin.deleteUser(userId)
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ message: 'User deleted' })
  } catch (e) {
    return c.json({ error: 'Service unavailable' }, 503)
  }
})

// ── GET /api/admin/logs ───────────────────────────────────────
admin.get('/logs', async (c) => {
  if (isDemo(c)) {
    return c.json({ logs: MOCK_LOGS })
  }

  try {
    const svc = getSupabaseServiceClient(c.env)
    const limit = parseInt(c.req.query('limit') || '50')
    const { data, error } = await svc
      .from('activity_logs')
      .select('*, profiles(name, email)')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return c.json({ error: error.message }, 400)
    return c.json({ logs: data || [] })
  } catch (e) {
    return c.json({ error: 'Service unavailable' }, 503)
  }
})

// ── GET /api/admin/storage ────────────────────────────────────
admin.get('/storage', async (c) => {
  if (isDemo(c)) {
    return c.json({
      top_users: MOCK_USERS,
      total_used: MOCK_USERS.reduce((s, u) => s + (u.used_space || 0), 0),
      total_quota: MOCK_USERS.reduce((s, u) => s + (u.quota || 0), 0),
    })
  }

  try {
    const svc = getSupabaseServiceClient(c.env)
    const { data: stats } = await svc.from('profiles').select('id, name, email, used_space, quota').order('used_space', { ascending: false }).limit(10)
    const { data: totalData } = await svc.from('profiles').select('used_space, quota')
    const totalUsed = (totalData || []).reduce((acc: number, u: any) => acc + (u.used_space || 0), 0)
    const totalQuota = (totalData || []).reduce((acc: number, u: any) => acc + (u.quota || 0), 0)
    return c.json({ top_users: stats || [], total_used: totalUsed, total_quota: totalQuota })
  } catch (e) {
    return c.json({ error: 'Service unavailable' }, 503)
  }
})

export default admin
