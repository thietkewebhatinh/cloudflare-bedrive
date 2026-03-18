-- ============================================================
-- Migration 0002: signup control + notifications
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add status column to profiles (pending | active | rejected)
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- 2. app_settings table (key-value store for admin configuration)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings
INSERT INTO public.app_settings (key, value) VALUES
  ('signup_enabled',   'true'),
  ('approval_required','false')
ON CONFLICT (key) DO NOTHING;

-- 3. notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,          -- 'register' | 'upload' | 'login' | 'share' | 'delete'
  title       TEXT NOT NULL,
  message     TEXT NOT NULL DEFAULT '',
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name   TEXT,
  user_email  TEXT,
  metadata    JSONB DEFAULT '{}',
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_is_read    ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- 4. RLS for new tables
ALTER TABLE public.app_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;

-- app_settings: only service role (all REST calls with service key bypass RLS)
CREATE POLICY "Service role full access on app_settings"
  ON public.app_settings FOR ALL
  USING (true) WITH CHECK (true);

-- notifications: only admins can read/write (enforced at API layer via service key)
CREATE POLICY "Service role full access on notifications"
  ON public.notifications FOR ALL
  USING (true) WITH CHECK (true);
