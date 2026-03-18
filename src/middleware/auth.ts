// Auth middleware - verifies JWT from Supabase or demo mode
import { createMiddleware } from 'hono/factory'
import { getSupabaseClient, getSupabaseServiceClient, isDemoMode } from '../lib/supabase'

export const DEMO_TOKEN = 'demo-token-bedrive'
export const DEMO_USER_ID = 'demo-user-001'
export const DEMO_USER_EMAIL = 'demo@bedrive.app'

type Env = {
  Bindings: {
    SUPABASE_URL: string
    SUPABASE_ANON_KEY: string
    SUPABASE_SERVICE_KEY: string
  }
  Variables: {
    userId: string
    userEmail: string
    userRole: string
    isDemo: boolean
  }
}

function extractToken(c: any): string | null {
  const authHeader = c.req.header('Authorization')
  const cookieHeader = c.req.header('Cookie')
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.substring(7)
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc: Record<string, string>, cookie: string) => {
      const [key, val] = cookie.trim().split('=')
      if (key && val) acc[key.trim()] = decodeURIComponent(val.trim())
      return acc
    }, {})
    return cookies['sb_token'] || null
  }
  return null
}

export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const token = extractToken(c)

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Demo mode: bypass Supabase entirely
  if (token === DEMO_TOKEN || isDemoMode(c.env)) {
    c.set('userId', DEMO_USER_ID)
    c.set('userEmail', DEMO_USER_EMAIL)
    c.set('userRole', 'admin')
    c.set('isDemo', true)
    await next()
    return
  }

  try {
    const supabase = getSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return c.json({ error: 'Invalid token' }, 401)
    }

    c.set('userId', user.id)
    c.set('userEmail', user.email || '')
    c.set('isDemo', false)

    // Use service key to bypass RLS when reading profile
    const svc = getSupabaseServiceClient(c.env)
    const { data: profile } = await svc
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    c.set('userRole', profile?.role || 'user')
  } catch (e) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }

  await next()
})

export const adminMiddleware = createMiddleware<Env>(async (c, next) => {
  const role = c.get('userRole')
  if (role !== 'admin') {
    return c.json({ error: 'Forbidden - Admin only' }, 403)
  }
  await next()
})
