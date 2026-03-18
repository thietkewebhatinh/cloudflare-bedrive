// Auth routes - login, register, logout, user profile
import { Hono } from 'hono'
import { getSupabaseClient, getSupabaseServiceClient, getSupabaseUserClient, isDemoMode } from '../lib/supabase'
import { DEMO_TOKEN, DEMO_USER_ID, DEMO_USER_EMAIL } from '../middleware/auth'
import { createNotification } from './notifications'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string
  R2: R2Bucket
  CDN_URL: string
  APP_URL: string
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

// ── App settings helpers (same pattern as settings.ts) ──────────
async function getAppSetting(env: any, key: string): Promise<string> {
  try {
    const svc = getSupabaseServiceClient(env)
    const { data } = await svc
      .from('activity_logs')
      .select('metadata')
      .eq('action', 'system_config')
      .eq('ip', key)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    return data?.metadata?.value ?? (key === 'signup_enabled' ? 'true' : 'false')
  } catch {
    return key === 'signup_enabled' ? 'true' : 'false'
  }
}

// ── Login ────────────────────────────────────────────────────────
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

  // Demo mode
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
    if (error) return c.json({ error: error.message }, 401)

    // Check if user is pending approval
    const svc = getSupabaseServiceClient(c.env)
    const { data: profile } = await svc
      .from('profiles').select('role, name').eq('id', data.user.id).single()

    if (profile?.role === 'pending') {
      // Sign them out immediately
      await supabase.auth.signOut()
      return c.json({ error: 'Your account is awaiting admin approval. Please wait.' }, 403)
    }

    // Create login notification (non-blocking)
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '—'
    createNotification(c.env, {
      type: 'login', title: 'User logged in',
      message: `${profile?.name || email} logged in from ${ip}`,
      userId: data.user.id, userName: profile?.name, userEmail: email,
    })

    return c.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || profile?.name || data.user.email?.split('@')[0],
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

// ── Register ─────────────────────────────────────────────────────
auth.post('/register', async (c) => {
  const { email, password, name } = await c.req.json()
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

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
    // Check if signup is enabled
    const signupEnabled = await getAppSetting(c.env, 'signup_enabled')
    if (signupEnabled === 'false') {
      return c.json({ error: 'Registration is currently disabled. Please contact the administrator.' }, 403)
    }

    // Check if approval is required
    const approvalRequired = await getAppSetting(c.env, 'approval_required')
    const needsApproval = approvalRequired === 'true'

    const supabase = getSupabaseClient(c.env)
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name: name || email.split('@')[0] } }
    })
    if (error) return c.json({ error: error.message }, 400)

    const userId   = data.user?.id
    const userName = name || email.split('@')[0]

    if (needsApproval && userId) {
      // Set role to 'pending' immediately
      const svc = getSupabaseServiceClient(c.env)
      await svc.from('profiles')
        .update({ role: 'pending', name: userName })
        .eq('id', userId)

      // Sign out to prevent immediate login
      await supabase.auth.signOut()

      // Create admin notification
      await createNotification(c.env, {
        type: 'register',
        title: 'New user registration — awaiting approval',
        message: `${userName} (${email}) registered and is awaiting admin approval`,
        userId, userName, userEmail: email,
      })

      return c.json({
        user: { id: userId, email, name: userName },
        needs_approval: true,
        message: 'Registration successful! Your account is awaiting admin approval before you can log in.',
      })
    }

    // No approval needed - create notification anyway
    if (userId) {
      createNotification(c.env, {
        type: 'register', title: 'New user registered',
        message: `${userName} (${email}) created an account`,
        userId, userName, userEmail: email,
      })
    }

    return c.json({
      user: { id: userId, email, name: userName },
      message: 'Registration successful'
    })
  } catch (e) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }
})

// ── Get current user ─────────────────────────────────────────────
auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401)
  const token = authHeader.substring(7)

  if (token === DEMO_TOKEN || isDemoMode(c.env)) return c.json({ user: demoUser() })

  try {
    const supabase = getSupabaseClient(c.env)
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return c.json({ error: 'Invalid token' }, 401)

    const svc = getSupabaseServiceClient(c.env)
    const { data: profile } = await svc.from('profiles').select('*').eq('id', user.id).single()

    // Block pending users from accessing the app
    if (profile?.role === 'pending') {
      return c.json({ error: 'Account pending approval', pending: true }, 403)
    }

    return c.json({ user: profile || { id: user.id, email: user.email, role: 'user' } })
  } catch (e) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }
})

// ── Refresh token ─────────────────────────────────────────────────
auth.post('/refresh', async (c) => {
  const { refresh_token } = await c.req.json()
  if (!refresh_token) return c.json({ error: 'No refresh token' }, 400)
  if (isDemoMode(c.env) || refresh_token === 'demo-refresh-token') {
    return c.json({ session: { access_token: DEMO_TOKEN, refresh_token: 'demo-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 2592000 } })
  }
  try {
    const supabase = getSupabaseClient(c.env)
    const { data, error } = await supabase.auth.refreshSession({ refresh_token })
    if (error) return c.json({ error: error.message }, 401)
    return c.json({ session: { access_token: data.session?.access_token, refresh_token: data.session?.refresh_token, expires_at: data.session?.expires_at } })
  } catch (e) {
    return c.json({ error: 'Auth service unavailable' }, 503)
  }
})

// ── Logout ────────────────────────────────────────────────────────
auth.post('/logout', async (c) => {
  return c.json({ message: 'Logged out successfully' })
})

// ── Check signup status (public) ─────────────────────────────────
auth.get('/signup-status', async (c) => {
  if (isDemoMode(c.env)) return c.json({ signup_enabled: true, approval_required: false, demo: true })
  try {
    const signupEnabled    = await getAppSetting(c.env, 'signup_enabled')
    const approvalRequired = await getAppSetting(c.env, 'approval_required')
    return c.json({
      signup_enabled:    signupEnabled !== 'false',
      approval_required: approvalRequired === 'true',
    })
  } catch {
    return c.json({ signup_enabled: true, approval_required: false })
  }
})

export default auth
