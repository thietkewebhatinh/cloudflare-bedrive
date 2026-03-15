// Auth routes - login, register, logout, user profile
import { Hono } from 'hono'
import { getSupabaseClient, isDemoMode } from '../lib/supabase'
import { DEMO_TOKEN, DEMO_USER_ID, DEMO_USER_EMAIL } from '../middleware/auth'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string
  R2: R2Bucket
  CDN_URL: string
}

const auth = new Hono<{ Bindings: Bindings }>()

// Demo user object
function demoUser() {
  return {
    id: DEMO_USER_ID,
    email: DEMO_USER_EMAIL,
    name: 'Demo Admin',
    role: 'admin',
    avatar: null,
    quota: 5 * 1024 * 1024 * 1024,
    used_space: 42 * 1024 * 1024,
    created_at: '2024-01-01T00:00:00Z',
  }
}

// Login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()

  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }

  // Demo mode: accept any credentials or specific demo credentials
  if (isDemoMode(c.env)) {
    return c.json({
      user: demoUser(),
      session: {
        access_token: DEMO_TOKEN,
        refresh_token: 'demo-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 2592000,
      },
      demo: true,
    })
  }

  try {
    const supabase = getSupabaseClient(c.env)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      return c.json({ error: error.message }, 401)
    }

    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || data.user.email?.split('@')[0],
      },
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_at: data.session?.expires_at,
      }
    })
  } catch (e) {
    return c.json({ error: 'Auth service unavailable. Use demo mode.' }, 503)
  }
})

// Register
auth.post('/register', async (c) => {
  const { email, password, name } = await c.req.json()

  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }

  // Demo mode
  if (isDemoMode(c.env)) {
    return c.json({
      user: { id: DEMO_USER_ID, email, name: name || email.split('@')[0] },
      session: {
        access_token: DEMO_TOKEN,
        refresh_token: 'demo-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 2592000,
      },
      message: 'Demo account ready! Signed in automatically.',
      demo: true,
    })
  }

  try {
    const supabase = getSupabaseClient(c.env)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name || email.split('@')[0] } }
    })

    if (error) {
      return c.json({ error: error.message }, 400)
    }

    return c.json({
      user: {
        id: data.user?.id,
        email: data.user?.email,
        name: name || email.split('@')[0],
      },
      message: 'Registration successful'
    })
  } catch (e) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }
})

// Get current user
auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.substring(7)

  // Demo mode
  if (token === DEMO_TOKEN || isDemoMode(c.env)) {
    return c.json({ user: demoUser() })
  }

  try {
    const supabase = getSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return c.json({ error: 'Invalid token' }, 401)
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    return c.json({ user: profile || { id: user.id, email: user.email } })
  } catch (e) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }
})

// Refresh token
auth.post('/refresh', async (c) => {
  const { refresh_token } = await c.req.json()
  if (!refresh_token) return c.json({ error: 'No refresh token' }, 400)

  if (isDemoMode(c.env) || refresh_token === 'demo-refresh-token') {
    return c.json({
      session: {
        access_token: DEMO_TOKEN,
        refresh_token: 'demo-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 2592000,
      }
    })
  }

  try {
    const supabase = getSupabaseClient(c.env)
    const { data, error } = await supabase.auth.refreshSession({ refresh_token })
    if (error) return c.json({ error: error.message }, 401)
    return c.json({
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_at: data.session?.expires_at,
      }
    })
  } catch (e) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }
})

// Logout
auth.post('/logout', async (c) => {
  return c.json({ message: 'Logged out successfully' })
})

export default auth
