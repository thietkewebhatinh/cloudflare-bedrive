// Auth middleware - verifies JWT from Supabase
import { createMiddleware } from 'hono/factory'
import { getSupabaseClient } from '../lib/supabase'

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
  }
}

export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const cookieHeader = c.req.header('Cookie')
  
  let token: string | null = null
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7)
  } else if (cookieHeader) {
    // Parse cookie
    const cookies = cookieHeader.split(';').reduce((acc: Record<string, string>, cookie: string) => {
      const [key, val] = cookie.trim().split('=')
      if (key && val) acc[key.trim()] = decodeURIComponent(val.trim())
      return acc
    }, {})
    token = cookies['sb_token'] || null
  }
  
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  
  const supabase = getSupabaseClient(c.env)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) {
    return c.json({ error: 'Invalid token' }, 401)
  }
  
  c.set('userId', user.id)
  c.set('userEmail', user.email || '')
  
  // Get user role from profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  
  c.set('userRole', profile?.role || 'user')
  
  await next()
})

export const adminMiddleware = createMiddleware<Env>(async (c, next) => {
  const role = c.get('userRole')
  if (role !== 'admin') {
    return c.json({ error: 'Forbidden - Admin only' }, 403)
  }
  await next()
})
