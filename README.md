# BeDrive - File Storage Service

A full-featured cloud file storage service built with **Hono + Cloudflare Pages + Supabase + R2**, inspired by [BeDrive](https://bedrive.vebto.com).

## 🌐 URLs
- **Production**: `https://bedrive.pages.dev` (after deployment)
- **Custom Domain**: `https://drive.webdep24h.com`
- **Sandbox Preview**: https://3000-ihlo95qhwy08uffmabsnc-cc2fbc16.sandbox.novita.ai

## ✅ Completed Features

### User Interface
- ✅ Login page (matching BeDrive design - circuit board background)
- ✅ Register page
- ✅ Main file explorer with **grid** and **list** view
- ✅ **Sidebar navigation**: All Files, Shared with me, Recent, Starred, Trash
- ✅ Admin sidebar: Analytics, Users, Logs
- ✅ Detail panel for selected files/folders
- ✅ Drag & drop file upload
- ✅ Search bar with debounce
- ✅ Breadcrumb navigation for folder hierarchy
- ✅ Storage usage indicator (progress bar)
- ✅ Toast notifications

### File Operations
- ✅ Upload files (with progress bar, multiple files)
- ✅ Download files
- ✅ Rename files & folders
- ✅ Star/unstar files
- ✅ Move to trash
- ✅ Restore from trash
- ✅ Permanently delete
- ✅ Empty trash
- ✅ File preview (images, video, audio)

### Folder Operations
- ✅ Create folders
- ✅ Navigate into folders (breadcrumb)
- ✅ Rename folders
- ✅ Move to trash

### File Sharing
- ✅ Generate share link with token
- ✅ Optional password protection
- ✅ Allow/disallow download
- ✅ Public share page at `/s/:token`
- ✅ File preview on share page (images, video, audio)

### Admin Dashboard
- ✅ Analytics (visitor reports, pageviews chart, devices chart)
- ✅ User management table
- ✅ Activity logs

### API Endpoints
```
POST   /api/auth/login
POST   /api/auth/register
GET    /api/auth/me
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/files?folder=&search=
GET    /api/files/:id
POST   /api/files/upload
PATCH  /api/files/:id
DELETE /api/files/:id
POST   /api/files/:id/restore
GET    /api/files/trash/list
GET    /api/files/starred/list
GET    /api/files/recent/list

GET    /api/folders?parent=
POST   /api/folders
PATCH  /api/folders/:id
DELETE /api/folders/:id
POST   /api/folders/:id/restore
GET    /api/folders/:id/contents

POST   /api/shares
GET    /api/shares/my
DELETE /api/shares/:id
GET    /api/shares/public/:token
GET    /api/shares/shared-with-me

GET    /api/admin/analytics
GET    /api/admin/users
PATCH  /api/admin/users/:id
DELETE /api/admin/users/:id
GET    /api/admin/logs
GET    /api/admin/storage

GET    /r2/*   (R2 CDN proxy)
```

## 🏗️ Architecture

```
User Browser
    │
    ▼
Cloudflare Pages (drive.webdep24h.com)
    │
    ├── Frontend SPA (HTML/Tailwind/Vanilla JS)
    │
    └── Hono Worker API
            │
            ├── Supabase (Auth + PostgreSQL Database)
            │       ├── profiles
            │       ├── files
            │       ├── folders
            │       ├── shares
            │       ├── shared_with_me
            │       ├── activity_logs
            │       └── page_views
            │
            └── Cloudflare R2 (File Storage)
                    └── bedrive-storage bucket
```

## 🗄️ Database Schema

Run `migrations/0001_initial_schema.sql` in Supabase SQL Editor.

## 🚀 Setup Instructions

### 1. Supabase Setup
1. Create project at [supabase.com](https://supabase.com)
2. Run `migrations/0001_initial_schema.sql` in SQL Editor
3. Copy Project URL, anon key, service role key

### 2. Cloudflare R2 Setup
1. Create R2 bucket named `bedrive-storage`
2. Create preview bucket `bedrive-storage-preview`

### 3. Deploy to Cloudflare Pages
```bash
npm run build
npx wrangler pages project create bedrive --production-branch main
npx wrangler pages deploy dist --project-name bedrive

# Set secrets
npx wrangler pages secret put SUPABASE_URL --project-name bedrive
npx wrangler pages secret put SUPABASE_ANON_KEY --project-name bedrive
npx wrangler pages secret put SUPABASE_SERVICE_KEY --project-name bedrive
npx wrangler pages secret put CDN_URL --project-name bedrive
npx wrangler pages secret put APP_URL --project-name bedrive
```

### 4. Custom Domain
In Cloudflare Pages dashboard → Custom domains:
- Add `drive.webdep24h.com`
- Set CNAME: `drive.webdep24h.com` → `bedrive.pages.dev`

### 5. Create Admin User
After registering your first user, update their role in Supabase:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers (Edge) |
| Framework | Hono v4 |
| Frontend | Vanilla JS + Tailwind CSS CDN |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Cloudflare R2 |
| Charts | Chart.js |
| Icons | Font Awesome 6 |

## 💰 Cost (Free Tier)
| Service | Free Limit |
|---------|-----------|
| Cloudflare Pages | Unlimited |
| Cloudflare Workers | 100k req/day |
| Cloudflare R2 | 10GB storage |
| Supabase | 500MB database, 1GB storage |

## 🔐 Security
- JWT authentication via Supabase
- Row Level Security (RLS) on all tables
- Admin-only routes protected by role check
- File quota per user (5GB default)
- File type validation (max 100MB per file)

## Deployment Status
- **Platform**: Cloudflare Pages
- **Status**: ✅ Built / ⏳ Awaiting Cloudflare API Key
- **Last Updated**: 2026-03-14
