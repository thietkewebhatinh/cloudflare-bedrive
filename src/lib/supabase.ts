// Supabase client helper
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Check if Supabase is not configured (placeholder values)
export function isDemoMode(env: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string }): boolean {
  const url = env.SUPABASE_URL || ''
  return !url || url.includes('your-project') || url === 'https://your-project.supabase.co' || !url.includes('supabase.co')
}

export function getSupabaseClient(env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string }): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  })
}

export function getSupabaseServiceClient(env: { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string }): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  })
}

export function getSupabaseUserClient(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  accessToken: string
): SupabaseClient {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      }
    }
  })
  return client
}

// Generate unique R2 file path
export function generateFilePath(userId: string, fileName: string): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 10)
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop()!.toLowerCase() : ''
  return `uploads/${userId}/${year}/${month}/${random}${ext}`
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Get file type category
export function getFileCategory(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.includes('word') || mimeType.includes('document')) return 'word'
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'excel'
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'powerpoint'
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'archive'
  if (mimeType === 'text/plain') return 'text'
  return 'file'
}

// Generate share token
export function generateShareToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}
