// Notifications route - uses activity_logs table with type prefix
import { Hono } from 'hono'
import { getSupabaseServiceClient, isDemoMode } from '../lib/supabase'
import { authMiddleware, adminMiddleware, DEMO_USER_ID } from '../middleware/auth'

type Bindings = {
  SUPABASE_URL: string; SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_KEY: string
  R2: R2Bucket; CDN_URL: string; APP_URL: string
}
type Variables = { userId: string; userEmail: string; userRole: string; isDemo: boolean }

const notifRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>()
notifRouter.use('*', authMiddleware)
notifRouter.use('*', adminMiddleware)

function isDemo(c: any) { return c.get('isDemo') === true || isDemoMode(c.env) }

// Notification types stored in activity_logs.metadata as { notif: true, title, message, type }
// action field holds: 'notif_register' | 'notif_upload' | 'notif_login' | 'notif_share' | 'notif_delete'
// ip field holds: 'unread' | 'read'

// ── GET /api/notifications — list recent notifications (admin only)
notifRouter.get('/', async (c) => {
  const limit  = parseInt(c.req.query('limit')  || '30')
  const unread_only = c.req.query('unread') === 'true'

  if (isDemo(c)) {
    return c.json({ notifications: getDemoNotifications(), unread_count: 3 })
  }

  try {
    const svc = getSupabaseServiceClient(c.env)
    let q = svc
      .from('activity_logs')
      .select('id, action, metadata, ip, user_agent, created_at, user_id, profiles(name, email)')
      .like('action', 'notif_%')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unread_only) q = q.eq('ip', 'unread')

    const { data, error } = await q
    if (error) return c.json({ error: error.message }, 400)

    const notifications = (data || []).map((row: any) => ({
      id:         row.id,
      type:       row.action?.replace('notif_', '') || 'info',
      title:      row.metadata?.title  || row.action || 'Notification',
      message:    row.metadata?.message || '',
      user_name:  row.metadata?.user_name  || row.profiles?.name  || '—',
      user_email: row.metadata?.user_email || row.profiles?.email || '',
      user_id:    row.user_id,
      is_read:    row.ip === 'read',
      metadata:   row.metadata || {},
      created_at: row.created_at,
    }))

    const unread_count = notifications.filter((n: any) => !n.is_read).length
    return c.json({ notifications, unread_count })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ── PATCH /api/notifications/:id/read — mark single notification read
notifRouter.patch('/:id/read', async (c) => {
  const id = c.req.param('id')
  if (isDemo(c)) return c.json({ ok: true })
  try {
    const svc = getSupabaseServiceClient(c.env)
    await svc.from('activity_logs').update({ ip: 'read' }).eq('id', id)
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ── POST /api/notifications/read-all — mark all read
notifRouter.post('/read-all', async (c) => {
  if (isDemo(c)) return c.json({ ok: true })
  try {
    const svc = getSupabaseServiceClient(c.env)
    await svc.from('activity_logs').update({ ip: 'read' }).like('action', 'notif_%').eq('ip', 'unread')
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

function getDemoNotifications() {
  const now = new Date()
  return [
    { id: 'notif-1', type: 'register', title: 'New user registered', message: 'alice@example.com just signed up and is awaiting approval', user_name: 'Alice Johnson', user_email: 'alice@example.com', user_id: null, is_read: false, created_at: new Date(now.getTime() - 5 * 60000).toISOString() },
    { id: 'notif-2', type: 'upload', title: 'File uploaded', message: 'Bob Smith uploaded "report-2024.pdf" (2.4 MB)', user_name: 'Bob Smith', user_email: 'bob@example.com', user_id: null, is_read: false, created_at: new Date(now.getTime() - 25 * 60000).toISOString() },
    { id: 'notif-3', type: 'share', title: 'File shared', message: 'Demo Admin created a share link for "photo-landscape.jpg"', user_name: 'Demo Admin', user_email: 'demo@bedrive.app', user_id: DEMO_USER_ID, is_read: false, created_at: new Date(now.getTime() - 60 * 60000).toISOString() },
    { id: 'notif-4', type: 'login', title: 'Admin login', message: 'Demo Admin logged in from 127.0.0.1', user_name: 'Demo Admin', user_email: 'demo@bedrive.app', user_id: DEMO_USER_ID, is_read: true, created_at: new Date(now.getTime() - 2 * 3600000).toISOString() },
    { id: 'notif-5', type: 'delete', title: 'File deleted', message: 'Bob Smith moved "archive.zip" to trash', user_name: 'Bob Smith', user_email: 'bob@example.com', user_id: null, is_read: true, created_at: new Date(now.getTime() - 5 * 3600000).toISOString() },
  ]
}

// ── Helper: create a notification (called from other routes)
export async function createNotification(env: any, {
  type, title, message, userId, userName, userEmail, metadata = {}
}: {
  type: string; title: string; message: string
  userId?: string; userName?: string; userEmail?: string; metadata?: any
}) {
  try {
    const svc = getSupabaseServiceClient(env)
    await svc.from('activity_logs').insert({
      action:     'notif_' + type,
      user_id:    userId    || null,
      metadata:   { title, message, user_name: userName, user_email: userEmail, ...metadata },
      ip:         'unread',   // repurpose ip field as read status
      user_agent: 'system',
    })
  } catch (e) {
    // Non-fatal - notifications are best-effort
    console.error('Failed to create notification:', e)
  }
}

export default notifRouter
