// Auth routes - login, register, logout, user profile
import { Hono } from 'hono'
import { getSupabaseClient, getSupabaseServiceClient } from '../lib/supabase'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string
  R2: R2Bucket
  CDN_URL: string
}

const auth = new Hono<{ Bindings: Bindings }>()

// Login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }
  
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
})

// Register
auth.post('/register', async (c) => {
  const { email, password, name } = await c.req.json()
  
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }
  
  const supabase = getSupabaseClient(c.env)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: name || email.split('@')[0] }
    }
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
})

// Get current user
auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.substring(7)
  
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
})

// Refresh token
auth.post('/refresh', async (c) => {
  const { refresh_token } = await c.req.json()
  if (!refresh_token) return c.json({ error: 'No refresh token' }, 400)
  
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
})

// Logout
auth.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    const supabase = getSupabaseClient(c.env)
    await supabase.auth.signOut()
  }
  return c.json({ message: 'Logged out successfully' })
})

export default auth
