// Folders routes - CRUD + breadcrumb
import { Hono } from 'hono'
import { getSupabaseUserClient, isDemoMode } from '../lib/supabase'
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

const folders = new Hono<{ Bindings: Bindings; Variables: Variables }>()
folders.use('*', authMiddleware)

function isDemo(c: any) { return c.get('isDemo') === true || isDemoMode(c.env) }

function getToken(c: any): string {
  const auth = c.req.header('Authorization')
  if (auth?.startsWith('Bearer ')) return auth.substring(7)
  const cookie = c.req.header('Cookie') || ''
  return cookie.split(';').reduce((a: any, v: string) => {
    const [k, val] = v.trim().split('=')
    if (k && val) a[k.trim()] = decodeURIComponent(val.trim())
    return a
  }, {})['sb_token'] || ''
}

// ── GET /api/folders — list folders ──────────────────────────
folders.get('/', async (c) => {
  const parent = c.req.query('parent') || null

  if (isDemo(c)) {
    return c.json({ folders: demoStore.getFolders(parent) })
  }

  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  let q = db.from('folders').select('*').eq('user_id', userId).eq('is_trashed', false)
  if (parent) q = q.eq('parent_id', parent)
  else        q = q.is('parent_id', null)
  const { data, error } = await q.order('name', { ascending: true })
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ folders: data || [] })
})

// ── GET /api/folders/breadcrumb/:id ──────────────────────────
folders.get('/breadcrumb/:id', async (c) => {
  const id = c.req.param('id')

  if (isDemo(c)) {
    const path: any[] = []
    let current = demoStore.getFolder(id)
    while (current) {
      path.unshift({ id: current.id, name: current.name })
      current = current.parent_id ? demoStore.getFolder(current.parent_id) : undefined
    }
    return c.json({ path })
  }

  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  const path: any[] = []
  let currentId: string | null = id

  while (currentId) {
    const { data } = await db.from('folders').select('id, name, parent_id').eq('id', currentId).eq('user_id', userId).single()
    if (!data) break
    path.unshift({ id: data.id, name: data.name })
    currentId = data.parent_id
  }

  return c.json({ path })
})

// ── POST /api/folders — create folder ─────────────────────────
folders.post('/', async (c) => {
  const { name, parent_id } = await c.req.json()
  if (!name) return c.json({ error: 'Folder name required' }, 400)

  if (isDemo(c)) {
    const NOW = new Date().toISOString()
    const folder = demoStore.addFolder({
      id: demoStore.nextFolderId(),
      user_id: DEMO_USER_ID,
      name, parent_id: parent_id || null,
      is_trashed: false, created_at: NOW, updated_at: NOW,
    })
    return c.json({ folder })
  }

  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('folders').insert({
    user_id: userId, name, parent_id: parent_id || null
  }).select().single()
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ folder: data })
})

// ── PATCH /api/folders/:id — rename ───────────────────────────
folders.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const { name } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)

  if (isDemo(c)) {
    const updated = demoStore.updateFolder(id, { name, updated_at: new Date().toISOString() })
    if (!updated) return c.json({ error: 'Not found' }, 404)
    return c.json({ folder: updated })
  }

  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  const { data, error } = await db.from('folders').update({ name }).eq('id', id).eq('user_id', userId).select().single()
  if (error) return c.json({ error: error.message }, 400)
  return c.json({ folder: data })
})

// ── DELETE /api/folders/:id — trash ───────────────────────────
folders.delete('/:id', async (c) => {
  const id = c.req.param('id')

  if (isDemo(c)) {
    demoStore.updateFolder(id, { is_trashed: true, updated_at: new Date().toISOString() })
    return c.json({ message: 'Folder moved to trash' })
  }

  const userId = c.get('userId')
  const token = getToken(c)
  const db = getSupabaseUserClient(c.env, token)
  await db.from('folders').update({ is_trashed: true }).eq('id', id).eq('user_id', userId)
  return c.json({ message: 'Folder moved to trash' })
})

export default folders
