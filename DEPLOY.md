# 🚀 Deploy Guide — BeDrive on Cloudflare Pages

## 1-Click Deploy to Cloudflare Pages

[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_USERNAME/bedrive)

---

## Prerequisites

| Service | What you need | Free? |
|---------|--------------|-------|
| Cloudflare | Account + API Token | ✅ |
| Supabase | Project URL + Keys | ✅ |
| GitHub | Repository | ✅ |

---

## Step 1 — Supabase Setup

1. Go to [supabase.com](https://supabase.com) → New Project
2. Open **SQL Editor** → paste contents of `migrations/0001_initial_schema.sql` → Run
3. Go to **Settings → API** → copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY`

---

## Step 2 — Cloudflare R2 Setup

```bash
# Install wrangler
npm install -g wrangler
wrangler login

# Create R2 buckets
wrangler r2 bucket create bedrive-storage
wrangler r2 bucket create bedrive-storage-preview
```

Or via Dashboard: **R2 → Create bucket** → name: `bedrive-storage`

**Make bucket public (for CDN):**
Dashboard → R2 → `bedrive-storage` → Settings → Public Access → Enable

---

## Step 3 — GitHub Repository Setup

### Option A: Fork and deploy

1. Fork this repo
2. Go to your fork → **Settings → Secrets and variables → Actions**
3. Add these secrets:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Your CF API token (with Pages:Edit permission) |
| `CLOUDFLARE_ACCOUNT_ID` | Your CF Account ID (from dashboard URL) |

4. Push to `main` branch → GitHub Actions auto-deploys ✅

---

### Option B: Manual Cloudflare Pages

```bash
git clone https://github.com/YOUR_USERNAME/bedrive
cd bedrive
npm install
npm run build

# Create Pages project (first time only)
npx wrangler pages project create bedrive \
  --production-branch main

# Deploy
npx wrangler pages deploy dist --project-name bedrive
```

---

## Step 4 — Set Environment Secrets

```bash
# Required secrets
npx wrangler pages secret put SUPABASE_URL       --project-name bedrive
npx wrangler pages secret put SUPABASE_ANON_KEY  --project-name bedrive
npx wrangler pages secret put SUPABASE_SERVICE_KEY --project-name bedrive
npx wrangler pages secret put CDN_URL            --project-name bedrive
# Value: https://drive.webdep24h.com/r2

npx wrangler pages secret put APP_URL            --project-name bedrive
# Value: https://drive.webdep24h.com
```

Or via Dashboard: **Pages → bedrive → Settings → Environment variables**

---

## Step 5 — Bind R2 Bucket

Dashboard: **Pages → bedrive → Settings → Functions → R2 bucket bindings**

| Variable name | R2 bucket |
|--------------|-----------|
| `R2` | `bedrive-storage` |

---

## Step 6 — Custom Domain

```
Cloudflare DNS:
Type  : CNAME
Name  : drive
Value : bedrive.pages.dev
Proxy : ✅ (orange cloud)
```

Dashboard: **Pages → bedrive → Custom domains → Add domain**
→ Enter `drive.webdep24h.com`

---

## Step 7 — Create Admin User

1. Register at `https://drive.webdep24h.com/register`
2. Supabase SQL Editor:
```sql
UPDATE profiles SET role = 'admin'
WHERE email = 'your@email.com';
```

---

## Architecture for Scale (100k → 1M users)

```
Request distribution:
├── 92% → Cloudflare CDN (static + cached files)
├──  7% → R2 direct (file downloads via /r2/* route)
└──  1% → Worker API (metadata, auth)
```

### Cache Strategy

| Resource | Cache-Control | Where |
|----------|--------------|-------|
| Images, videos | `public, max-age=31536000` | R2 + CDN |
| JS/CSS | `public, max-age=86400` | Pages CDN |
| API responses | `no-store` | Worker |

### Upload Flow (Direct, no Worker bandwidth)
```
1. GET /api/files/presign?name=&mime=&size=
2. Frontend → PUT directly to upload endpoint
3. POST /api/files/upload-direct (save metadata)
```

---

## Free Tier Capacity

| Service | Free Limit | Supports |
|---------|-----------|---------|
| CF Pages | Unlimited builds | ✅ |
| CF Workers | 100k req/day | ~3M monthly |
| CF R2 | 10 GB storage, 10M reads | 100k files |
| Supabase | 500MB DB, 2GB bandwidth | 50k users |

> With CDN absorbing 92% of traffic, **Worker stays well under 100k/day limit** even at 1M monthly active users.

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | ✅ | Supabase service role key (admin ops) |
| `CDN_URL` | ✅ | Base URL for file serving e.g. `https://drive.webdep24h.com/r2` |
| `APP_URL` | ✅ | Your app URL e.g. `https://drive.webdep24h.com` |

---

## Cloudflare API Token Permissions

When creating API token at dash.cloudflare.com → API Tokens:

- **Cloudflare Pages** : Edit
- **Workers R2 Storage** : Edit  
- **Account** : Read
