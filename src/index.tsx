import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import authRoutes     from './routes/auth'
import filesRoutes    from './routes/files'
import foldersRoutes  from './routes/folders'
import sharesRoutes   from './routes/shares'
import adminRoutes    from './routes/admin'
import cdnRoutes      from './routes/cdn'
import settingsRoutes from './routes/settings'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_KEY: string
  R2: R2Bucket
  CDN_URL: string
  APP_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowHeaders: ['Content-Type','Authorization','Cookie','X-File-Path','X-File-Name','X-Folder-Id'],
  credentials: true,
}))

// API Routes
app.route('/api/auth',     authRoutes)
app.route('/api/files',    filesRoutes)
app.route('/api/folders',  foldersRoutes)
app.route('/api/shares',   sharesRoutes)
app.route('/api/admin',    adminRoutes)
app.route('/api/settings', settingsRoutes)
app.route('/r2',           cdnRoutes)

// Static assets
app.use('/static/*', serveStatic({ root: './public' }))

// ── Pages ──────────────────────────────────────────────────
app.get('/login',    (c) => c.html(loginPage()))
app.get('/register', (c) => c.html(registerPage()))
app.get('/s/:token', (c) => c.html(sharePage()))

// SPA – all other routes
app.get('/*', (c) => {
  const p = c.req.path
  if (p.startsWith('/api/') || p.startsWith('/r2/')) return c.notFound()
  return c.html(appPage())
})

// ══════════════════════════════════════════════
// LOGIN PAGE
// ══════════════════════════════════════════════
function loginPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in – BeDrive</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .bg-circuit{background-color:#f0f2f5;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%23f0f2f5'/%3E%3Cpath d='M20 20h80v80H20z' fill='none' stroke='%23dde1e7' stroke-width='0.6'/%3E%3Cpath d='M20 20L40 20 40 40 M80 20 L100 20 L100 40 M20 100 L40 100 L40 80 M100 80 L100 100 L80 100' fill='none' stroke='%23c5ccd6' stroke-width='0.9'/%3E%3Ccircle cx='40' cy='40' r='2.5' fill='%23c5ccd6'/%3E%3Ccircle cx='80' cy='40' r='2.5' fill='%23c5ccd6'/%3E%3Ccircle cx='40' cy='80' r='2.5' fill='%23c5ccd6'/%3E%3Ccircle cx='80' cy='80' r='2.5' fill='%23c5ccd6'/%3E%3Cline x1='40' y1='40' x2='80' y2='40' stroke='%23d1d8e0' stroke-width='0.6'/%3E%3Cline x1='40' y1='80' x2='80' y2='80' stroke='%23d1d8e0' stroke-width='0.6'/%3E%3Cline x1='40' y1='40' x2='40' y2='80' stroke='%23d1d8e0' stroke-width='0.6'/%3E%3Cline x1='80' y1='40' x2='80' y2='80' stroke='%23d1d8e0' stroke-width='0.6'/%3E%3C/svg%3E");}
</style>
</head>
<body class="bg-circuit min-h-screen flex flex-col">
<div class="flex-1 flex flex-col items-center justify-center px-4 py-12">

  <!-- Logo -->
  <a href="/" class="flex items-center gap-2 mb-8 no-underline">
    <svg class="w-9 h-9" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" stroke="#2563eb" stroke-width="2.5"/>
      <path d="M13 20a7 7 0 1014 0 7 7 0 00-14 0z" fill="none" stroke="#2563eb" stroke-width="2"/>
      <path d="M20 13v3M20 24v3M13 20h3M24 20h3" stroke="#2563eb" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span class="text-2xl font-bold text-gray-900 tracking-widest">BEDRIVE</span>
  </a>

  <!-- Card -->
  <div class="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
    <h2 class="text-2xl font-semibold text-gray-800 mb-6">Sign in to your account</h2>

    <div id="demo-notice" class="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl mb-5 text-sm hidden">
      <i class="fas fa-info-circle mr-1"></i> <strong>Demo mode active</strong> – click <em>Continue</em> with any credentials.
    </div>

    <div id="err" class="hidden bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-5 text-sm flex items-center gap-2">
      <i class="fas fa-exclamation-circle"></i><span id="err-msg"></span>
    </div>

    <form id="form" class="space-y-4" onsubmit="doLogin(event)">
      <div>
        <label class="block text-sm font-medium text-blue-600 mb-1">Email</label>
        <input id="email" type="email" autocomplete="email" placeholder="admin@admin.com"
          class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 text-sm">
      </div>
      <div>
        <div class="flex justify-between mb-1">
          <label class="text-sm font-medium text-gray-700">Password</label>
          <a href="#" class="text-sm text-blue-500 hover:text-blue-700">Forgot your password?</a>
        </div>
        <input id="password" type="password" autocomplete="current-password" placeholder="••••••"
          class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 text-sm">
      </div>
      <div class="flex items-center gap-2">
        <input id="remember" type="checkbox" checked class="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500">
        <label for="remember" class="text-sm text-gray-600">Stay signed in for a month</label>
      </div>
      <button type="submit" id="btn"
        class="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2">
        Continue
      </button>
    </form>
  </div>

  <p class="mt-6 text-sm text-gray-500">
    Don't have an account? <a href="/register" class="text-blue-600 hover:text-blue-700 font-medium">Sign up.</a>
  </p>
</div>
<footer class="text-center py-4 text-sm text-gray-400">© BeDrive</footer>

<script>
// Show demo notice if server is in demo mode
(async function checkDemo() {
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email:'_check_demo@x.co',password:'_probe'})
    });
    const d = await r.json();
    if (d.demo) {
      document.getElementById('demo-notice').classList.remove('hidden');
      document.getElementById('email').value = 'demo@bedrive.app';
      document.getElementById('password').value = 'demo1234';
    }
  } catch(e){}
})();

async function doLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('btn');
  const err = document.getElementById('err');
  err.classList.add('hidden');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
  btn.disabled = true;
  try {
    const r = await fetch('/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email: document.getElementById('email').value, password: document.getElementById('password').value })
    });
    const d = await r.json();
    if (!r.ok) { throw new Error(d.error || 'Login failed'); }
    const token = d.session.access_token;
    localStorage.setItem('sb_token', token);
    localStorage.setItem('sb_refresh', d.session.refresh_token || '');
    const maxAge = document.getElementById('remember').checked ? 2592000 : 86400;
    document.cookie = 'sb_token=' + token + '; path=/; max-age=' + maxAge;
    if (d.demo) {
      btn.innerHTML = '<i class="fas fa-check"></i> Demo mode – redirecting...';
    }
    window.location.href = '/';
  } catch(ex) {
    document.getElementById('err-msg').textContent = ex.message;
    err.classList.remove('hidden');
    btn.innerHTML = 'Continue';
    btn.disabled = false;
  }
}
</script>
</body>
</html>`
}

// ══════════════════════════════════════════════
// REGISTER PAGE
// ══════════════════════════════════════════════
function registerPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Sign up – BeDrive</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;} .bg-circuit{background-color:#f0f2f5;}</style>
</head>
<body class="bg-circuit min-h-screen flex flex-col">
<div class="flex-1 flex flex-col items-center justify-center px-4 py-12">
  <a href="/" class="flex items-center gap-2 mb-8">
    <svg class="w-9 h-9" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" stroke="#2563eb" stroke-width="2.5"/><path d="M13 20a7 7 0 1014 0 7 7 0 00-14 0z" fill="none" stroke="#2563eb" stroke-width="2"/><path d="M20 13v3M20 24v3M13 20h3M24 20h3" stroke="#2563eb" stroke-width="1.5" stroke-linecap="round"/></svg>
    <span class="text-2xl font-bold text-gray-900 tracking-widest">BEDRIVE</span>
  </a>
  <div class="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
    <h2 class="text-2xl font-semibold text-gray-800 mb-6">Create your account</h2>
    <div id="err" class="hidden bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm"></div>
    <div id="ok" class="hidden bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-4 text-sm"></div>
    <form class="space-y-4" onsubmit="doRegister(event)">
      <div><label class="block text-sm font-medium text-blue-600 mb-1">Full Name</label>
        <input id="name" type="text" placeholder="John Doe" required class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"></div>
      <div><label class="block text-sm font-medium text-blue-600 mb-1">Email</label>
        <input id="email" type="email" placeholder="you@example.com" required class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"></div>
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
        <input id="password" type="password" placeholder="Min 6 characters" minlength="6" required class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"></div>
      <button type="submit" id="btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-full transition-colors">Create Account</button>
    </form>
  </div>
  <p class="mt-6 text-sm text-gray-500">Already have an account? <a href="/login" class="text-blue-600 font-medium">Sign in.</a></p>
</div>
<footer class="text-center py-4 text-sm text-gray-400">© BeDrive</footer>
<script>
async function doRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('btn');
  document.getElementById('err').classList.add('hidden');
  document.getElementById('ok').classList.add('hidden');
  btn.textContent = 'Creating...'; btn.disabled = true;
  try {
    const r = await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:document.getElementById('name').value,email:document.getElementById('email').value,password:document.getElementById('password').value})});
    const d = await r.json();
    if (!r.ok) throw new Error(d.error||'Registration failed');
    if (d.session && d.session.access_token) {
      // Demo mode or instant sign-in
      localStorage.setItem('sb_token', d.session.access_token);
      localStorage.setItem('sb_refresh', d.session.refresh_token || '');
      document.cookie = 'sb_token=' + d.session.access_token + '; path=/; max-age=2592000';
      document.getElementById('ok').textContent = d.message || 'Account created! Redirecting...';
      document.getElementById('ok').classList.remove('hidden');
      setTimeout(()=>window.location.href='/', 1500);
    } else {
      document.getElementById('ok').textContent = d.message || 'Account created! Check your email to verify, then sign in.';
      document.getElementById('ok').classList.remove('hidden');
      setTimeout(()=>window.location.href='/login', 3000);
    }
  } catch(ex) {
    document.getElementById('err').textContent = ex.message;
    document.getElementById('err').classList.remove('hidden');
    btn.textContent = 'Create Account'; btn.disabled = false;
  }
}
</script>
</body></html>`
}

// ══════════════════════════════════════════════
// SHARE PAGE
// ══════════════════════════════════════════════
function sharePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Shared File – BeDrive</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}</style>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center">
<div class="w-full max-w-lg mx-4">
  <div class="text-center mb-6">
    <a href="/" class="inline-flex items-center gap-2 no-underline">
      <svg class="w-8 h-8" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" stroke="#2563eb" stroke-width="2.5"/><path d="M13 20a7 7 0 1014 0 7 7 0 00-14 0z" fill="none" stroke="#2563eb" stroke-width="2"/></svg>
      <span class="text-xl font-bold text-gray-800 tracking-widest">BEDRIVE</span>
    </a>
  </div>

  <div id="loading" class="text-center py-16"><i class="fas fa-spinner fa-spin text-3xl text-blue-500"></i></div>

  <div id="pw-card" class="hidden bg-white rounded-2xl shadow-lg p-8 text-center">
    <div class="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-lock text-2xl text-blue-500"></i></div>
    <h2 class="text-xl font-semibold text-gray-800 mb-2">Password Protected</h2>
    <p class="text-gray-500 text-sm mb-5">Enter the password to access this file</p>
    <input id="pw-input" type="password" placeholder="Enter password"
      class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-sm"
      onkeydown="if(event.key==='Enter')loadShare(document.getElementById('pw-input').value)">
    <button onclick="loadShare(document.getElementById('pw-input').value)"
      class="w-full bg-blue-600 text-white py-3 rounded-full font-semibold hover:bg-blue-700 transition-colors">Unlock</button>
  </div>

  <div id="file-card" class="hidden bg-white rounded-2xl shadow-lg p-8">
    <div id="preview" class="mb-5 rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center min-h-16"></div>
    <h2 id="fname" class="text-lg font-semibold text-gray-800 break-all mb-1"></h2>
    <p id="fsize" class="text-sm text-gray-400 mb-5"></p>
    <a id="dl-btn" href="#" class="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-3 rounded-full font-semibold hover:bg-blue-700 transition-colors mb-2">
      <i class="fas fa-download"></i> Download
    </a>
  </div>

  <div id="err-card" class="hidden bg-white rounded-2xl shadow-lg p-8 text-center">
    <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4"><i class="fas fa-unlink text-2xl text-red-400"></i></div>
    <h2 id="err-title" class="text-xl font-semibold text-gray-800 mb-2">Link Not Found</h2>
    <p id="err-desc" class="text-gray-400 text-sm mb-5">This share link is invalid or expired.</p>
    <a href="/" class="inline-block bg-blue-600 text-white px-6 py-2.5 rounded-full hover:bg-blue-700 font-medium text-sm">Go Home</a>
  </div>
</div>
<script>
const shareToken = location.pathname.split('/s/')[1] || '';
function fmt(b){if(!b)return'';const k=1024,s=['B','KB','MB','GB'];const i=Math.floor(Math.log(b)/Math.log(k));return(b/Math.pow(k,i)).toFixed(1)+' '+s[i];}
async function loadShare(pw) {
  ['loading','pw-card','file-card','err-card'].forEach(id=>document.getElementById(id).classList.add('hidden'));
  document.getElementById('loading').classList.remove('hidden');
  try {
    const url = '/api/shares/public/' + shareToken + (pw ? '?password=' + encodeURIComponent(pw) : '');
    const r = await fetch(url);
    const d = await r.json();
    document.getElementById('loading').classList.add('hidden');
    if (r.status === 401 && d.requires_password) { document.getElementById('pw-card').classList.remove('hidden'); return; }
    if (!r.ok) {
      document.getElementById('err-title').textContent = d.error || 'Error';
      document.getElementById('err-card').classList.remove('hidden'); return;
    }
    const f = d.share.file;
    if (f) {
      document.getElementById('fname').textContent = f.file_name;
      document.getElementById('fsize').textContent = fmt(f.file_size);
      const prev = document.getElementById('preview');
      if (f.mime_type && f.mime_type.startsWith('image/')) prev.innerHTML = '<img src="'+f.url+'" class="w-full max-h-64 object-contain rounded-xl">';
      else if (f.mime_type && f.mime_type.startsWith('video/')) prev.innerHTML = '<video src="'+f.url+'" controls class="w-full rounded-xl max-h-64"></video>';
      else if (f.mime_type && f.mime_type.startsWith('audio/')) prev.innerHTML = '<audio src="'+f.url+'" controls class="w-full mt-2"></audio>';
      else prev.innerHTML = '<i class="fas fa-file text-5xl text-gray-300 py-4"></i>';
      if (d.share.allow_download) { document.getElementById('dl-btn').href = f.url; document.getElementById('dl-btn').setAttribute('download', f.file_name); }
      else { document.getElementById('dl-btn').remove(); }
      document.getElementById('file-card').classList.remove('hidden');
    }
  } catch(e) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('err-card').classList.remove('hidden');
  }
}
loadShare();
</script>
</body></html>`
}

// ══════════════════════════════════════════════
// MAIN APP PAGE
// ══════════════════════════════════════════════
function appPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BeDrive – File Storage</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
*{box-sizing:border-box;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#f8fafc;}
::-webkit-scrollbar{width:5px;height:5px;}
::-webkit-scrollbar-track{background:#f1f5f9;}
::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:9px;}

.sidebar{width:220px;min-height:100vh;background:#fff;border-right:1px solid #e5e7eb;position:fixed;left:0;top:0;display:flex;flex-direction:column;z-index:50;}
.main-content{margin-left:220px;min-height:100vh;transition:margin-right .2s;}

.nav-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;cursor:pointer;color:#6b7280;font-size:13.5px;font-weight:500;transition:all .15s;margin:1px 8px;}
.nav-item:hover{background:#f3f4f6;color:#111827;}
.nav-item.active{background:#eff6ff;color:#2563eb;}
.nav-item .fa,.nav-item .fas,.nav-item .far{width:16px;text-align:center;font-size:14px;}

.file-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;cursor:pointer;transition:all .15s;overflow:hidden;user-select:none;}
.file-card:hover{border-color:#3b82f6;box-shadow:0 2px 10px rgba(59,130,246,.12);transform:translateY(-1px);}
.file-card.selected{border-color:#3b82f6;background:#eff6ff;}
.file-thumb{height:118px;background:#f8fafc;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #f1f5f9;overflow:hidden;}
.file-thumb img{width:100%;height:100%;object-fit:cover;}

.upload-area{border:2px dashed #d1d5db;border-radius:12px;background:#f9fafb;transition:all .2s;cursor:pointer;}
.upload-area.drag-over,.upload-area:hover{border-color:#3b82f6;background:#eff6ff;}

.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);}
.modal{background:#fff;border-radius:16px;padding:24px;width:92%;max-width:500px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);}

.detail-panel{width:280px;background:#fff;border-left:1px solid #e5e7eb;position:fixed;right:0;top:0;height:100vh;overflow-y:auto;z-index:40;box-shadow:-2px 0 12px rgba(0,0,0,.04);}

.toast{position:fixed;bottom:24px;right:24px;padding:12px 18px;border-radius:10px;font-size:13.5px;z-index:1000;opacity:0;transform:translateY(8px);transition:all .25s;pointer-events:none;}
.toast.show{opacity:1;transform:translateY(0);}

.progress-bar{height:3px;background:#e5e7eb;border-radius:9px;overflow:hidden;}
.progress-bar .fill{height:100%;background:#3b82f6;border-radius:9px;transition:width .3s;}
</style>
</head>
<body>

<!-- ═══ SIDEBAR ═══ -->
<div class="sidebar" id="sidebar">
  <!-- Logo -->
  <div class="px-5 py-4 border-b border-gray-100">
    <div class="flex items-center gap-2">
      <svg class="w-8 h-8 flex-shrink-0" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="18" stroke="#2563eb" stroke-width="2.5"/>
        <path d="M13 20a7 7 0 1014 0 7 7 0 00-14 0z" fill="none" stroke="#2563eb" stroke-width="2"/>
        <path d="M20 13v3M20 24v3M13 20h3M24 20h3" stroke="#2563eb" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span class="text-base font-bold text-gray-900 tracking-widest">BEDRIVE</span>
    </div>
  </div>

  <!-- Upload button -->
  <div class="px-4 pt-4 pb-2">
    <button onclick="BeDrive.showUploadModal()"
      class="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm shadow-sm">
      <i class="fas fa-arrow-up-from-bracket text-sm"></i> Upload
    </button>
  </div>

  <!-- Navigation -->
  <nav class="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
    <div class="nav-item active" id="nav-files" onclick="BeDrive.navigate('files')">
      <i class="fas fa-cloud text-blue-500"></i> All Files
    </div>
    <div class="nav-item" id="nav-shared" onclick="BeDrive.navigate('shared')">
      <i class="fas fa-user-friends"></i> Shared with me
    </div>
    <div class="nav-item" id="nav-recent" onclick="BeDrive.navigate('recent')">
      <i class="fas fa-clock"></i> Recent
    </div>
    <div class="nav-item" id="nav-starred" onclick="BeDrive.navigate('starred')">
      <i class="fas fa-star"></i> Starred
    </div>
    <div class="nav-item" id="nav-trash" onclick="BeDrive.navigate('trash')">
      <i class="fas fa-trash-alt"></i> Trash
    </div>

    <!-- Admin section -->
    <div id="admin-menu" class="hidden pt-2">
      <p class="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Admin</p>
      <div class="nav-item" id="nav-analytics" onclick="BeDrive.navigate('analytics')">
        <i class="fas fa-chart-bar"></i> Analytics
      </div>
      <div class="nav-item" id="nav-settings" onclick="BeDrive.navigate('settings')">
        <i class="fas fa-cog"></i> Settings
      </div>
      <div class="nav-item" id="nav-admin-users" onclick="BeDrive.navigate('admin-users')">
        <i class="fas fa-users"></i> Users
      </div>
      <div class="nav-item" id="nav-admin-logs" onclick="BeDrive.navigate('admin-logs')">
        <i class="fas fa-list-alt"></i> Logs
      </div>
    </div>
  </nav>

  <!-- Storage -->
  <div class="px-4 py-3 border-t border-gray-100">
    <div class="flex justify-between text-xs text-gray-500 mb-1">
      <span id="storage-used">0 MB</span>
      <span id="storage-quota">5 GB</span>
    </div>
    <div class="progress-bar"><div class="fill" id="storage-bar" style="width:0%"></div></div>
    <p class="text-xs text-gray-400 mt-1.5" id="storage-pct">0% used</p>
  </div>

  <!-- User profile -->
  <div class="px-4 py-3 border-t border-gray-100">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" id="user-avatar">D</div>
        <div class="min-w-0">
          <p class="text-xs font-semibold text-gray-800 truncate" id="user-name">Demo Admin</p>
          <p class="text-xs text-gray-400">Personal workspace</p>
        </div>
      </div>
      <button onclick="BeDrive.logout()" title="Sign out"
        class="flex-shrink-0 text-gray-400 hover:text-gray-700 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
        <i class="fas fa-sign-out-alt text-sm"></i>
      </button>
    </div>
  </div>
</div>

<!-- ═══ MAIN CONTENT ═══ -->
<div class="main-content" id="main-content">

  <!-- Header -->
  <header class="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30 h-14">
    <!-- Breadcrumb -->
    <div id="breadcrumb" class="flex items-center gap-1 text-sm min-w-0 flex-1 mr-4 truncate">
      <span class="font-semibold text-gray-800">All Files</span>
    </div>

    <!-- Right controls -->
    <div class="flex items-center gap-2 flex-shrink-0">
      <!-- Search -->
      <div class="relative hidden md:block">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
        <input id="search-input" type="text" placeholder="Search files and folders"
          class="pl-8 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56 transition-all"
          oninput="BeDrive.debounceSearch(this.value)">
      </div>

      <!-- View toggle -->
      <div class="flex border border-gray-200 rounded-xl overflow-hidden">
        <button id="btn-grid" onclick="BeDrive.setView('grid')" title="Grid view"
          class="px-3 py-1.5 text-sm text-blue-600 bg-blue-50 border-r border-gray-200 hover:bg-blue-100 transition-colors">
          <i class="fas fa-th-large"></i>
        </button>
        <button id="btn-list" onclick="BeDrive.setView('list')" title="List view"
          class="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors">
          <i class="fas fa-list"></i>
        </button>
      </div>

      <!-- Notifications -->
      <button class="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors relative">
        <i class="fas fa-bell text-sm"></i>
      </button>

      <!-- Avatar -->
      <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold cursor-pointer ring-2 ring-blue-100 hover:ring-blue-300 transition-all" id="header-avatar">D</div>
    </div>
  </header>

  <!-- Page content -->
  <div id="page-content" class="p-6"></div>
</div>

<!-- ═══ DETAIL PANEL ═══ -->
<div class="detail-panel hidden" id="detail-panel">
  <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
    <span class="font-semibold text-gray-800 text-sm">Details</span>
    <button onclick="BeDrive.closeDetail()" class="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
      <i class="fas fa-times text-sm"></i>
    </button>
  </div>
  <div id="detail-content" class="p-4"></div>
</div>

<!-- ═══ TOAST ═══ -->
<div id="toast" class="toast bg-gray-900 text-white"></div>

<!-- ═══ UPLOAD MODAL ═══ -->
<div class="modal-overlay hidden" id="upload-modal">
  <div class="modal">
    <div class="flex items-center justify-between mb-5">
      <h3 class="font-semibold text-gray-800 text-lg">Upload Files</h3>
      <button onclick="BeDrive.closeUploadModal()" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><i class="fas fa-times"></i></button>
    </div>
    <div class="upload-area p-8 text-center mb-4 rounded-xl" id="drop-zone" onclick="document.getElementById('file-input').click()">
      <div class="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
        <i class="fas fa-cloud-upload-alt text-2xl text-blue-500"></i>
      </div>
      <p class="text-gray-700 font-medium mb-1">Drag &amp; drop files here</p>
      <p class="text-sm text-gray-400">or click to browse &bull; Max 100MB per file</p>
      <input type="file" id="file-input" class="hidden" multiple onchange="BeDrive.handleFileSelect(this.files)">
    </div>
    <div id="upload-queue" class="space-y-2 max-h-48 overflow-y-auto mb-4"></div>
    <div class="flex gap-3">
      <button onclick="BeDrive.closeUploadModal()" class="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl hover:bg-gray-50 font-medium transition-colors text-sm">Cancel</button>
      <button id="upload-btn" onclick="BeDrive.startUpload()" class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl hover:bg-blue-700 font-medium transition-colors text-sm flex items-center justify-center gap-2">
        <i class="fas fa-upload"></i> Upload
      </button>
    </div>
  </div>
</div>

<!-- ═══ NEW FOLDER MODAL ═══ -->
<div class="modal-overlay hidden" id="folder-modal">
  <div class="modal" style="max-width:380px">
    <div class="flex items-center justify-between mb-5">
      <h3 class="font-semibold text-gray-800 text-lg">New Folder</h3>
      <button onclick="BeDrive.closeFolderModal()" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><i class="fas fa-times"></i></button>
    </div>
    <input id="folder-name-input" type="text" placeholder="Folder name"
      class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-5 text-sm"
      onkeydown="if(event.key==='Enter')BeDrive.createFolder()">
    <div class="flex gap-3">
      <button onclick="BeDrive.closeFolderModal()" class="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl hover:bg-gray-50 font-medium text-sm">Cancel</button>
      <button onclick="BeDrive.createFolder()" class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl hover:bg-blue-700 font-medium text-sm">Create</button>
    </div>
  </div>
</div>

<!-- ═══ RENAME MODAL ═══ -->
<div class="modal-overlay hidden" id="rename-modal">
  <div class="modal" style="max-width:380px">
    <div class="flex items-center justify-between mb-5">
      <h3 class="font-semibold text-gray-800 text-lg">Rename</h3>
      <button onclick="BeDrive.closeRenameModal()" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><i class="fas fa-times"></i></button>
    </div>
    <input id="rename-input" type="text" placeholder="New name"
      class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 mb-5 text-sm"
      onkeydown="if(event.key==='Enter')BeDrive.confirmRename()">
    <div class="flex gap-3">
      <button onclick="BeDrive.closeRenameModal()" class="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl hover:bg-gray-50 font-medium text-sm">Cancel</button>
      <button onclick="BeDrive.confirmRename()" class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl hover:bg-blue-700 font-medium text-sm">Rename</button>
    </div>
  </div>
</div>

<!-- ═══ SHARE MODAL ═══ -->
<div class="modal-overlay hidden" id="share-modal">
  <div class="modal" style="max-width:440px">
    <div class="flex items-center justify-between mb-5">
      <h3 class="font-semibold text-gray-800 text-lg">Share File</h3>
      <button onclick="BeDrive.closeShareModal()" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><i class="fas fa-times"></i></button>
    </div>

    <!-- Generated link -->
    <div id="share-link-area" class="hidden mb-4">
      <div class="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
        <i class="fas fa-link text-blue-500 flex-shrink-0"></i>
        <input id="share-link-input" type="text" readonly class="flex-1 bg-transparent border-none outline-none text-sm text-blue-700 truncate">
        <button onclick="BeDrive.copyShareLink()" class="text-blue-600 hover:text-blue-800 text-sm font-semibold flex-shrink-0">Copy</button>
      </div>
    </div>

    <div class="space-y-4 mb-5">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1.5">Password <span class="text-gray-400 font-normal">(optional)</span></label>
        <input id="share-password" type="password" placeholder="Leave empty for no password"
          class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <label class="flex items-center gap-3 cursor-pointer">
        <input id="share-allow-download" type="checkbox" checked class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500">
        <span class="text-sm text-gray-700">Allow file download</span>
      </label>
    </div>

    <button onclick="BeDrive.createShare()"
      class="w-full bg-blue-600 text-white py-2.5 rounded-xl hover:bg-blue-700 font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
      <i class="fas fa-share-alt"></i> Generate Share Link
    </button>
  </div>
</div>

<!-- ═══ LOAD APP JS ═══ -->
<script src="/static/app.js"></script>
</body>
</html>`
}

export default app
