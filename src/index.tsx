import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import authRoutes from './routes/auth'
import filesRoutes from './routes/files'
import foldersRoutes from './routes/folders'
import sharesRoutes from './routes/shares'
import adminRoutes from './routes/admin'
import cdnRoutes from './routes/cdn'

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
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  credentials: true,
}))

// API Routes
app.route('/api/auth', authRoutes)
app.route('/api/files', filesRoutes)
app.route('/api/folders', foldersRoutes)
app.route('/api/shares', sharesRoutes)
app.route('/api/admin', adminRoutes)
app.route('/r2', cdnRoutes)

// Serve static assets
app.use('/static/*', serveStatic({ root: './public' }))
app.use('/assets/*', serveStatic({ root: './public' }))

// SPA fallback - serve index.html for all non-API routes
app.get('/login', (c) => c.html(getHtml('login')))
app.get('/register', (c) => c.html(getHtml('register')))
app.get('/s/:token', (c) => c.html(getHtml('share')))

// All other routes → main SPA
app.get('/*', (c) => {
  const path = c.req.path
  if (path.startsWith('/api/') || path.startsWith('/r2/')) {
    return c.notFound()
  }
  return c.html(getHtml('app'))
})

function getHtml(page: string): string {
  if (page === 'login') return loginHtml
  if (page === 'register') return registerHtml
  if (page === 'share') return shareHtml
  return appHtml
}

// =================== HTML TEMPLATES ===================

const loginHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in - BeDrive</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .bg-circuit {
    background-color: #f0f2f5;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23f0f2f5'/%3E%3Cpath d='M10 10h80v80H10z' fill='none' stroke='%23dde1e7' stroke-width='0.5'/%3E%3Cpath d='M10 10 L30 10 L30 30 M70 10 L90 10 L90 30 M10 90 L30 90 L30 70 M90 70 L90 90 L70 90' fill='none' stroke='%23c5ccd6' stroke-width='0.8'/%3E%3Ccircle cx='30' cy='30' r='2' fill='%23c5ccd6'/%3E%3Ccircle cx='70' cy='30' r='2' fill='%23c5ccd6'/%3E%3Ccircle cx='30' cy='70' r='2' fill='%23c5ccd6'/%3E%3Ccircle cx='70' cy='70' r='2' fill='%23c5ccd6'/%3E%3C/svg%3E");
  }
</style>
</head>
<body class="bg-circuit min-h-screen flex flex-col">
  <div class="flex-1 flex flex-col items-center justify-center px-4">
    <!-- Logo -->
    <div class="flex items-center gap-2 mb-8">
      <svg class="w-9 h-9" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" stroke="#2563eb" stroke-width="3"/><path d="M14 20l4 4 8-8" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="20" r="5" fill="none" stroke="#2563eb" stroke-width="1.5"/></svg>
      <span class="text-2xl font-bold text-gray-800 tracking-wide">BEDRIVE</span>
    </div>
    
    <!-- Login Card -->
    <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-8">
      <h2 class="text-2xl font-semibold text-gray-800 mb-6">Sign in to your account</h2>
      
      <div id="error-msg" class="hidden bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm"></div>
      
      <form id="login-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-blue-600 mb-1">Email</label>
          <input type="email" id="email" value="admin@admin.com" required
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800">
        </div>
        
        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="text-sm font-medium text-gray-700">Password</label>
            <a href="#" class="text-sm text-blue-500 hover:text-blue-700">Forgot your password?</a>
          </div>
          <input type="password" id="password" value="admin" required
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800">
        </div>
        
        <div class="flex items-center gap-2">
          <input type="checkbox" id="remember" checked class="w-4 h-4 text-blue-600 rounded border-gray-300">
          <label for="remember" class="text-sm text-gray-600">Stay signed in for a month</label>
        </div>
        
        <button type="submit" id="login-btn"
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-full transition-colors duration-200 flex items-center justify-center gap-2">
          <span>Continue</span>
        </button>
      </form>
    </div>
    
    <p class="mt-6 text-gray-500 text-sm">
      Don't have an account? <a href="/register" class="text-blue-600 hover:text-blue-700">Sign up.</a>
    </p>
  </div>
  
  <footer class="text-center py-4 text-sm text-gray-400">© BeDrive</footer>

<script>
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errorMsg = document.getElementById('error-msg');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Signing in...';
  btn.disabled = true;
  errorMsg.classList.add('hidden');
  
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
      })
    });
    const data = await res.json();
    
    if (!res.ok) {
      errorMsg.textContent = data.error || 'Login failed';
      errorMsg.classList.remove('hidden');
      btn.innerHTML = '<span>Continue</span>';
      btn.disabled = false;
      return;
    }
    
    // Save session
    localStorage.setItem('sb_token', data.session.access_token);
    localStorage.setItem('sb_refresh', data.session.refresh_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    document.cookie = 'sb_token=' + data.session.access_token + '; path=/; max-age=2592000';
    
    window.location.href = '/';
  } catch (err) {
    errorMsg.textContent = 'Network error. Please try again.';
    errorMsg.classList.remove('hidden');
    btn.innerHTML = '<span>Continue</span>';
    btn.disabled = false;
  }
});
</script>
</body>
</html>`

const registerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign up - BeDrive</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .bg-circuit {
    background-color: #f0f2f5;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23f0f2f5'/%3E%3Cpath d='M10 10h80v80H10z' fill='none' stroke='%23dde1e7' stroke-width='0.5'/%3E%3Cpath d='M10 10 L30 10 L30 30 M70 10 L90 10 L90 30 M10 90 L30 90 L30 70 M90 70 L90 90 L70 90' fill='none' stroke='%23c5ccd6' stroke-width='0.8'/%3E%3Ccircle cx='30' cy='30' r='2' fill='%23c5ccd6'/%3E%3Ccircle cx='70' cy='30' r='2' fill='%23c5ccd6'/%3E%3Ccircle cx='30' cy='70' r='2' fill='%23c5ccd6'/%3E%3Ccircle cx='70' cy='70' r='2' fill='%23c5ccd6'/%3E%3C/svg%3E");
  }
</style>
</head>
<body class="bg-circuit min-h-screen flex flex-col">
  <div class="flex-1 flex flex-col items-center justify-center px-4">
    <div class="flex items-center gap-2 mb-8">
      <svg class="w-9 h-9" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" stroke="#2563eb" stroke-width="3"/><path d="M14 20l4 4 8-8" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="20" r="5" fill="none" stroke="#2563eb" stroke-width="1.5"/></svg>
      <span class="text-2xl font-bold text-gray-800 tracking-wide">BEDRIVE</span>
    </div>
    <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-8">
      <h2 class="text-2xl font-semibold text-gray-800 mb-6">Create your account</h2>
      <div id="error-msg" class="hidden bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm"></div>
      <div id="success-msg" class="hidden bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm"></div>
      <form id="register-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-blue-600 mb-1">Full Name</label>
          <input type="text" id="name" required placeholder="John Doe"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800">
        </div>
        <div>
          <label class="block text-sm font-medium text-blue-600 mb-1">Email</label>
          <input type="email" id="email" required placeholder="you@example.com"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input type="password" id="password" required minlength="6" placeholder="Min 6 characters"
            class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800">
        </div>
        <button type="submit" id="register-btn"
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-full transition-colors duration-200">
          Create Account
        </button>
      </form>
    </div>
    <p class="mt-6 text-gray-500 text-sm">
      Already have an account? <a href="/login" class="text-blue-600 hover:text-blue-700">Sign in.</a>
    </p>
  </div>
  <footer class="text-center py-4 text-sm text-gray-400">© BeDrive</footer>
<script>
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  const errorMsg = document.getElementById('error-msg');
  const successMsg = document.getElementById('success-msg');
  btn.textContent = 'Creating account...';
  btn.disabled = true;
  errorMsg.classList.add('hidden');
  successMsg.classList.add('hidden');
  
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
      })
    });
    const data = await res.json();
    if (!res.ok) {
      errorMsg.textContent = data.error || 'Registration failed';
      errorMsg.classList.remove('hidden');
      btn.textContent = 'Create Account';
      btn.disabled = false;
      return;
    }
    successMsg.textContent = 'Account created! Please check your email to verify, then sign in.';
    successMsg.classList.remove('hidden');
    setTimeout(() => window.location.href = '/login', 3000);
  } catch(err) {
    errorMsg.textContent = 'Network error';
    errorMsg.classList.remove('hidden');
    btn.textContent = 'Create Account';
    btn.disabled = false;
  }
});
</script>
</body>
</html>`

const shareHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Shared File - BeDrive</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<style>body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }</style>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center">
<div class="w-full max-w-lg mx-auto px-4">
  <div class="text-center mb-6">
    <div class="flex items-center justify-center gap-2">
      <svg class="w-8 h-8" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" stroke="#2563eb" stroke-width="3"/><circle cx="20" cy="20" r="5" fill="none" stroke="#2563eb" stroke-width="1.5"/></svg>
      <span class="text-xl font-bold text-gray-800">BEDRIVE</span>
    </div>
  </div>
  
  <div id="password-form" class="hidden bg-white rounded-xl shadow-lg p-8">
    <div class="text-center mb-6">
      <i class="fas fa-lock text-4xl text-blue-500 mb-3"></i>
      <h2 class="text-xl font-semibold text-gray-800">Password Protected</h2>
      <p class="text-gray-500 mt-2">Enter password to access this file</p>
    </div>
    <input type="password" id="share-password" placeholder="Enter password"
      class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4">
    <button onclick="loadShare()" class="w-full bg-blue-600 text-white py-3 rounded-full font-medium hover:bg-blue-700">
      Access File
    </button>
  </div>

  <div id="file-card" class="hidden bg-white rounded-xl shadow-lg p-8">
    <div class="text-center mb-6">
      <div id="file-icon" class="text-6xl mb-4">📄</div>
      <h2 id="file-name" class="text-xl font-semibold text-gray-800 break-all"></h2>
      <p id="file-size" class="text-gray-500 mt-1 text-sm"></p>
    </div>
    <div id="preview-area" class="mb-6 rounded-lg overflow-hidden bg-gray-50"></div>
    <div class="flex gap-3">
      <a id="download-btn" href="#" download class="flex-1 bg-blue-600 text-white py-3 rounded-full font-medium hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors">
        <i class="fas fa-download"></i> Download
      </a>
    </div>
  </div>

  <div id="error-card" class="hidden bg-white rounded-xl shadow-lg p-8 text-center">
    <i class="fas fa-exclamation-circle text-5xl text-red-400 mb-4"></i>
    <h2 id="error-title" class="text-xl font-semibold text-gray-800">File Not Found</h2>
    <p id="error-desc" class="text-gray-500 mt-2">This share link is invalid or expired.</p>
    <a href="/" class="mt-6 inline-block bg-blue-600 text-white px-6 py-2.5 rounded-full hover:bg-blue-700">Go Home</a>
  </div>
  
  <div id="loading" class="text-center py-12">
    <i class="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
  </div>
</div>
<script>
const token = location.pathname.split('/s/')[1];
function formatSize(bytes) {
  if (!bytes) return '';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k,i)).toFixed(2) + ' ' + sizes[i];
}
function getIcon(mime) {
  if (!mime) return '📄';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('zip') || mime.includes('rar')) return '📦';
  if (mime.includes('word')) return '📝';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '📊';
  return '📄';
}
async function loadShare(password = '') {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('password-form').classList.add('hidden');
  document.getElementById('file-card').classList.add('hidden');
  document.getElementById('error-card').classList.add('hidden');
  
  const pw = password || document.getElementById('share-password')?.value || '';
  const url = '/api/shares/public/' + token + (pw ? '?password=' + encodeURIComponent(pw) : '');
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    document.getElementById('loading').classList.add('hidden');
    
    if (res.status === 401 && data.requires_password) {
      document.getElementById('password-form').classList.remove('hidden');
      return;
    }
    if (!res.ok) {
      document.getElementById('error-title').textContent = data.error || 'Error';
      document.getElementById('error-card').classList.remove('hidden');
      return;
    }
    
    const file = data.share.file;
    if (file) {
      document.getElementById('file-icon').textContent = getIcon(file.mime_type);
      document.getElementById('file-name').textContent = file.file_name;
      document.getElementById('file-size').textContent = formatSize(file.file_size);
      
      // Preview
      const preview = document.getElementById('preview-area');
      if (file.mime_type?.startsWith('image/')) {
        preview.innerHTML = '<img src="' + file.url + '" class="w-full max-h-80 object-contain rounded">';
      } else if (file.mime_type?.startsWith('video/')) {
        preview.innerHTML = '<video src="' + file.url + '" controls class="w-full max-h-80 rounded"></video>';
      } else if (file.mime_type?.startsWith('audio/')) {
        preview.innerHTML = '<audio src="' + file.url + '" controls class="w-full"></audio>';
      }
      
      if (data.share.allow_download) {
        document.getElementById('download-btn').href = file.url;
        document.getElementById('download-btn').setAttribute('download', file.file_name);
      } else {
        document.getElementById('download-btn').remove();
      }
      document.getElementById('file-card').classList.remove('hidden');
    }
  } catch(e) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('error-card').classList.remove('hidden');
  }
}
loadShare();
</script>
</body>
</html>`

const appHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BeDrive - File Storage</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f9fafb; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #f1f5f9; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
  .sidebar { width: 220px; min-height: 100vh; background: #fff; border-right: 1px solid #e5e7eb; position: fixed; left: 0; top: 0; display: flex; flex-direction: column; z-index: 50; }
  .main-content { margin-left: 220px; min-height: 100vh; }
  .nav-item { display: flex; align-items: center; gap: 12px; padding: 9px 16px; border-radius: 8px; cursor: pointer; color: #4b5563; font-size: 14px; font-weight: 500; transition: all 0.15s; margin: 1px 8px; }
  .nav-item:hover { background: #f3f4f6; color: #111827; }
  .nav-item.active { background: #eff6ff; color: #2563eb; }
  .nav-item .icon { width: 18px; text-align: center; }
  .file-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer; transition: all 0.15s; overflow: hidden; }
  .file-card:hover { border-color: #3b82f6; box-shadow: 0 1px 8px rgba(59,130,246,0.12); }
  .file-card.selected { border-color: #3b82f6; background: #eff6ff; }
  .file-thumb { height: 120px; background: #f8fafc; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #e5e7eb; }
  .file-thumb img { max-width: 100%; max-height: 100%; object-fit: cover; width: 100%; height: 100%; }
  .upload-area { border: 2px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; transition: all 0.2s; }
  .upload-area.drag-over { border-color: #3b82f6; background: #eff6ff; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; }
  .modal { background: #fff; border-radius: 12px; padding: 24px; width: 90%; max-width: 520px; max-height: 90vh; overflow-y: auto; }
  .progress-bar { height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 100%; background: #3b82f6; border-radius: 2px; transition: width 0.3s; }
  .dropdown { position: relative; }
  .dropdown-menu { position: absolute; right: 0; top: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); padding: 4px; min-width: 160px; z-index: 200; }
  .dropdown-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 6px; cursor: pointer; color: #374151; font-size: 13px; transition: background 0.1s; }
  .dropdown-item:hover { background: #f3f4f6; }
  .dropdown-item.danger { color: #dc2626; }
  .detail-panel { width: 280px; background: #fff; border-left: 1px solid #e5e7eb; position: fixed; right: 0; top: 0; height: 100vh; overflow-y: auto; z-index: 40; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: #111827; color: white; padding: 12px 20px; border-radius: 8px; font-size: 14px; z-index: 1000; opacity: 0; transform: translateY(10px); transition: all 0.3s; }
  .toast.show { opacity: 1; transform: translateY(0); }
  .tag { background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 9999px; font-size: 11px; }
  #upload-progress-bar { width: 0%; transition: width 0.3s ease; }
</style>
</head>
<body>

<!-- Sidebar -->
<div class="sidebar" id="sidebar">
  <!-- Logo -->
  <div class="p-4 border-b border-gray-100">
    <div class="flex items-center gap-2">
      <svg class="w-8 h-8 flex-shrink-0" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" stroke="#2563eb" stroke-width="3"/><path d="M14 20l4 4 8-8" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="20" r="5" fill="none" stroke="#2563eb" stroke-width="1.5"/></svg>
      <span class="text-lg font-bold text-gray-900 tracking-wide">BEDRIVE</span>
    </div>
  </div>
  
  <!-- Upload Button -->
  <div class="px-4 py-4">
    <button onclick="App.showUploadModal()" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm">
      <i class="fas fa-arrow-up-from-bracket"></i> Upload
    </button>
  </div>
  
  <!-- Nav -->
  <nav class="flex-1 px-2 space-y-0.5">
    <div class="nav-item active" onclick="App.navigate('files')" id="nav-files">
      <i class="fas fa-cloud icon text-blue-500"></i> All Files
    </div>
    <div class="nav-item" onclick="App.navigate('shared')" id="nav-shared">
      <i class="fas fa-user-friends icon"></i> Shared with me
    </div>
    <div class="nav-item" onclick="App.navigate('recent')" id="nav-recent">
      <i class="fas fa-clock icon"></i> Recent
    </div>
    <div class="nav-item" onclick="App.navigate('starred')" id="nav-starred">
      <i class="fas fa-star icon"></i> Starred
    </div>
    <div class="nav-item" onclick="App.navigate('trash')" id="nav-trash">
      <i class="fas fa-trash-alt icon"></i> Trash
    </div>
    
    <div id="admin-menu" class="hidden">
      <div class="px-4 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Admin</div>
      <div class="nav-item" onclick="App.navigate('analytics')" id="nav-analytics">
        <i class="fas fa-chart-bar icon"></i> Analytics
      </div>
      <div class="nav-item" onclick="App.navigate('admin-users')" id="nav-admin-users">
        <i class="fas fa-users icon"></i> Users
      </div>
      <div class="nav-item" onclick="App.navigate('admin-logs')" id="nav-admin-logs">
        <i class="fas fa-list icon"></i> Logs
      </div>
    </div>
  </nav>
  
  <!-- Storage indicator -->
  <div class="p-4 border-t border-gray-100">
    <div class="flex justify-between text-xs text-gray-500 mb-1.5">
      <span id="storage-used">0 MB</span>
      <span id="storage-quota">5 GB</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" id="storage-bar" style="width:0%"></div>
    </div>
    <div class="mt-2 text-xs text-gray-400" id="storage-pct">0% used</div>
  </div>
  
  <!-- Workspace -->
  <div class="p-4 border-t border-gray-100">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold" id="user-avatar">D</div>
        <div>
          <div class="text-xs font-medium text-gray-800" id="user-name">Demo Admin</div>
          <div class="text-xs text-gray-400">Personal workspace</div>
        </div>
      </div>
      <button onclick="App.logout()" class="text-gray-400 hover:text-gray-700 text-sm" title="Logout">
        <i class="fas fa-sign-out-alt"></i>
      </button>
    </div>
  </div>
</div>

<!-- Main Content -->
<div class="main-content" id="main-content">
  <!-- Header -->
  <header class="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30">
    <div class="flex items-center gap-4 flex-1">
      <!-- Breadcrumb -->
      <div id="breadcrumb" class="flex items-center gap-1 text-sm text-gray-600">
        <span class="font-medium text-gray-800">All Files</span>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <!-- Search -->
      <div class="relative">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
        <input type="text" id="search-input" placeholder="Search files and folders" 
          class="pl-9 pr-4 py-2 bg-gray-100 border-none rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          oninput="App.debounceSearch(this.value)">
      </div>
      <!-- View toggle -->
      <div class="flex border border-gray-200 rounded-lg overflow-hidden">
        <button onclick="App.setView('grid')" id="btn-grid" class="px-3 py-1.5 text-sm text-blue-600 bg-blue-50 border-r border-gray-200" title="Grid view">
          <i class="fas fa-th-large"></i>
        </button>
        <button onclick="App.setView('list')" id="btn-list" class="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50" title="List view">
          <i class="fas fa-list"></i>
        </button>
      </div>
      <!-- Notification -->
      <button class="relative text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100">
        <i class="fas fa-bell"></i>
      </button>
      <!-- User avatar -->
      <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold cursor-pointer" id="header-avatar" onclick="App.showProfile()">D</div>
    </div>
  </header>

  <!-- Page Content -->
  <div id="page-content" class="p-6"></div>
</div>

<!-- Detail Panel -->
<div class="detail-panel hidden" id="detail-panel">
  <div class="p-4 border-b border-gray-100 flex items-center justify-between">
    <span class="font-semibold text-gray-800" id="detail-title">All files</span>
    <button onclick="App.closeDetail()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times"></i></button>
  </div>
  <div id="detail-content" class="p-4"></div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<!-- Upload Modal -->
<div class="modal-overlay hidden" id="upload-modal">
  <div class="modal">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-gray-800 text-lg">Upload Files</h3>
      <button onclick="App.closeUploadModal()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times"></i></button>
    </div>
    <div class="upload-area p-8 text-center cursor-pointer mb-4" id="drop-zone" onclick="document.getElementById('file-input').click()">
      <i class="fas fa-cloud-upload-alt text-4xl text-blue-400 mb-3"></i>
      <p class="text-gray-700 font-medium">Drag & drop files here</p>
      <p class="text-sm text-gray-400 mt-1">or click to browse • Max 100MB per file</p>
      <input type="file" id="file-input" class="hidden" multiple onchange="App.handleFileSelect(this.files)">
    </div>
    <div id="upload-queue" class="space-y-2 max-h-60 overflow-y-auto"></div>
    <div class="flex gap-3 mt-4">
      <button onclick="App.closeUploadModal()" class="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
      <button onclick="App.startUpload()" id="upload-btn" class="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium">
        <i class="fas fa-upload mr-2"></i>Upload
      </button>
    </div>
  </div>
</div>

<!-- Create Folder Modal -->
<div class="modal-overlay hidden" id="folder-modal">
  <div class="modal" style="max-width:400px">
    <h3 class="font-semibold text-gray-800 text-lg mb-4">New Folder</h3>
    <input type="text" id="folder-name-input" placeholder="Folder name" 
      class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
      onkeydown="if(event.key==='Enter') App.createFolder()">
    <div class="flex gap-3">
      <button onclick="document.getElementById('folder-modal').classList.add('hidden')" class="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50">Cancel</button>
      <button onclick="App.createFolder()" class="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700">Create</button>
    </div>
  </div>
</div>

<!-- Rename Modal -->
<div class="modal-overlay hidden" id="rename-modal">
  <div class="modal" style="max-width:400px">
    <h3 class="font-semibold text-gray-800 text-lg mb-4">Rename</h3>
    <input type="text" id="rename-input" placeholder="New name"
      class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
      onkeydown="if(event.key==='Enter') App.confirmRename()">
    <div class="flex gap-3">
      <button onclick="document.getElementById('rename-modal').classList.add('hidden')" class="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50">Cancel</button>
      <button onclick="App.confirmRename()" class="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700">Rename</button>
    </div>
  </div>
</div>

<!-- Share Modal -->
<div class="modal-overlay hidden" id="share-modal">
  <div class="modal" style="max-width:480px">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-semibold text-gray-800 text-lg">Share File</h3>
      <button onclick="document.getElementById('share-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times"></i></button>
    </div>
    <div id="share-link-area" class="hidden">
      <div class="bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-3 mb-4">
        <i class="fas fa-link text-blue-500"></i>
        <input type="text" id="share-link-input" readonly class="flex-1 bg-transparent border-none outline-none text-sm text-gray-700">
        <button onclick="App.copyShareLink()" class="text-blue-600 hover:text-blue-800 text-sm font-medium">Copy</button>
      </div>
    </div>
    <div class="space-y-3 mb-4">
      <div>
        <label class="block text-sm text-gray-600 mb-1">Password (optional)</label>
        <input type="password" id="share-password" placeholder="Leave empty for no password"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="flex items-center gap-2">
        <input type="checkbox" id="share-allow-download" checked class="rounded">
        <label for="share-allow-download" class="text-sm text-gray-600">Allow download</label>
      </div>
    </div>
    <button onclick="App.createShare()" class="w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 font-medium">
      <i class="fas fa-share-alt mr-2"></i>Generate Share Link
    </button>
  </div>
</div>

<script>
// ============================================================
// BeDrive Application - Main JS
// ============================================================
const App = (() => {
  let state = {
    user: null, token: null, view: 'grid',
    currentPage: 'files', currentFolder: null, folderPath: [],
    files: [], folders: [], selectedItem: null,
    searchTimeout: null, renameTarget: null, shareTarget: null,
    selectedFiles: new Set()
  };
  
  // Auth helpers
  function getToken() {
    return state.token || localStorage.getItem('sb_token') || '';
  }
  function getHeaders() {
    return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
  }
  function getHeadersFormData() {
    return { 'Authorization': 'Bearer ' + getToken() };
  }
  
  // Toast
  function showToast(msg, type='info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (type==='error'?'bg-red-600':type==='success'?'bg-green-600':'bg-gray-900') + ' text-white px-5 py-3 rounded-lg fixed bottom-6 right-6 z-50';
    setTimeout(() => t.classList.remove('show'), 3000);
  }
  
  // Format helpers
  function formatSize(b) {
    if (!b) return '0 B';
    const k=1024, s=['B','KB','MB','GB'];
    const i=Math.floor(Math.log(b)/Math.log(k));
    return (b/Math.pow(k,i)).toFixed(1)+' '+s[i];
  }
  function formatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }
  function getFileIcon(mime) {
    if (!mime) return {icon:'fa-file',color:'text-gray-400'};
    if (mime.startsWith('image/')) return {icon:'fa-image',color:'text-green-500'};
    if (mime.startsWith('video/')) return {icon:'fa-film',color:'text-purple-500'};
    if (mime.startsWith('audio/')) return {icon:'fa-music',color:'text-pink-500'};
    if (mime.includes('pdf')) return {icon:'fa-file-pdf',color:'text-red-500'};
    if (mime.includes('zip')||mime.includes('rar')) return {icon:'fa-file-archive',color:'text-yellow-500'};
    if (mime.includes('word')) return {icon:'fa-file-word',color:'text-blue-500'};
    if (mime.includes('excel')||mime.includes('spreadsheet')) return {icon:'fa-file-excel',color:'text-green-600'};
    if (mime.includes('powerpoint')||mime.includes('presentation')) return {icon:'fa-file-powerpoint',color:'text-orange-500'};
    if (mime==='text/plain') return {icon:'fa-file-alt',color:'text-gray-500'};
    return {icon:'fa-file',color:'text-gray-400'};
  }
  
  // Init
  async function init() {
    const token = localStorage.getItem('sb_token');
    if (!token) { window.location.href = '/login'; return; }
    state.token = token;
    
    try {
      const res = await fetch('/api/auth/me', { headers: getHeaders() });
      if (!res.ok) { window.location.href = '/login'; return; }
      const data = await res.json();
      state.user = data.user;
      updateUserUI();
      navigate('files');
    } catch(e) {
      window.location.href = '/login';
    }
  }
  
  function updateUserUI() {
    const u = state.user;
    if (!u) return;
    const initials = (u.name||u.email||'D')[0].toUpperCase();
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('header-avatar').textContent = initials;
    document.getElementById('user-name').textContent = u.name || u.email;
    
    if (u.role === 'admin') {
      document.getElementById('admin-menu').classList.remove('hidden');
    }
    
    // Storage
    if (u.quota && u.used_space !== undefined) {
      const pct = Math.round((u.used_space / u.quota) * 100);
      document.getElementById('storage-used').textContent = formatSize(u.used_space);
      document.getElementById('storage-quota').textContent = formatSize(u.quota);
      document.getElementById('storage-bar').style.width = pct + '%';
      document.getElementById('storage-pct').textContent = pct + '% used';
    }
  }
  
  function navigate(page, folderId=null) {
    state.currentPage = page;
    // Update nav active
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navEl = document.getElementById('nav-' + page) || document.getElementById('nav-' + page.replace('admin-',''));
    if (navEl) navEl.classList.add('active');
    
    if (page === 'files') {
      if (folderId !== undefined) state.currentFolder = folderId;
      loadFiles();
    } else if (page === 'shared') {
      loadShared();
    } else if (page === 'recent') {
      loadRecent();
    } else if (page === 'starred') {
      loadStarred();
    } else if (page === 'trash') {
      loadTrash();
    } else if (page === 'analytics') {
      loadAnalytics();
    } else if (page === 'admin-users') {
      loadAdminUsers();
    } else if (page === 'admin-logs') {
      loadAdminLogs();
    }
  }
  
  // ===== FILE OPERATIONS =====
  async function loadFiles(folderId) {
    if (folderId !== undefined) state.currentFolder = folderId;
    const search = document.getElementById('search-input')?.value || '';
    
    showLoading();
    try {
      const params = new URLSearchParams();
      if (state.currentFolder) params.append('folder', state.currentFolder);
      if (search) params.append('search', search);
      
      const [fRes, fldRes] = await Promise.all([
        fetch('/api/files?' + params, { headers: getHeaders() }),
        fetch('/api/folders?' + (state.currentFolder ? 'parent=' + state.currentFolder : ''), { headers: getHeaders() })
      ]);
      
      const [fData, fldData] = await Promise.all([fRes.json(), fldRes.json()]);
      state.files = fData.files || [];
      state.folders = fldData.folders || [];
      
      renderFilesPage();
    } catch(e) {
      showError('Failed to load files');
    }
  }
  
  function renderFilesPage() {
    const content = document.getElementById('page-content');
    const isGrid = state.view === 'grid';
    
    // Breadcrumb
    updateBreadcrumb();
    
    let html = \`
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <button class="flex items-center gap-1.5 text-gray-600 text-sm hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50" onclick="App.showFolderModal()">
            <i class="fas fa-folder-plus text-yellow-500"></i> New Folder
          </button>
          <button class="flex items-center gap-1.5 text-gray-600 text-sm hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50" onclick="App.showUploadModal()">
            <i class="fas fa-upload text-blue-500"></i> Upload
          </button>
        </div>
        <div class="text-sm text-gray-400 flex items-center gap-2">
          <i class="fas fa-sort-amount-down"></i> Last modified
        </div>
      </div>
    \`;
    
    if (state.folders.length === 0 && state.files.length === 0) {
      html += renderEmpty();
    } else {
      if (isGrid) {
        html += \`<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))">\`;
        state.folders.forEach(f => { html += renderFolderCard(f); });
        state.files.forEach(f => { html += renderFileCard(f); });
        html += '</div>';
      } else {
        html += renderListView();
      }
    }
    
    content.innerHTML = html;
    attachDragEvents();
  }
  
  function renderFolderCard(folder) {
    return \`
      <div class="file-card group" ondblclick="App.navigate('files', '\${folder.id}')" 
        onclick="App.selectItem('folder', '\${folder.id}', \${JSON.stringify(folder).replace(/"/g,'&quot;')})">
        <div class="file-thumb" style="background:#fffbeb">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            <path d="M8 16a4 4 0 014-4h10l4 5h18a4 4 0 014 4v19a4 4 0 01-4 4H12a4 4 0 01-4-4V16z" fill="#fbbf24"/>
            <path d="M8 21h40v19a4 4 0 01-4 4H12a4 4 0 01-4-4V21z" fill="#f59e0b"/>
          </svg>
        </div>
        <div class="p-2.5">
          <p class="text-xs font-medium text-gray-800 truncate">\${folder.name}</p>
          <p class="text-xs text-gray-400 mt-0.5">Folder</p>
        </div>
      </div>\`;
  }
  
  function renderFileCard(file) {
    const {icon, color} = getFileIcon(file.mime_type);
    const isImage = file.mime_type?.startsWith('image/');
    
    return \`
      <div class="file-card group relative" onclick="App.selectItem('file', '\${file.id}', \${JSON.stringify(file).replace(/"/g,'&quot;')})">
        <div class="file-thumb relative">
          \${isImage ? \`<img src="\${file.url}" alt="\${file.file_name}" onerror="this.parentNode.innerHTML='<i class=\\"fas \${icon} \${color} text-4xl\\"></i>'">\`
                     : \`<i class="fas \${icon} \${color} text-4xl"></i>\`}
          \${file.is_starred ? '<div class="absolute top-1.5 right-1.5"><i class="fas fa-star text-yellow-400 text-xs"></i></div>' : ''}
        </div>
        <div class="p-2.5">
          <p class="text-xs font-medium text-gray-800 truncate" title="\${file.file_name}">\${file.file_name}</p>
          <p class="text-xs text-gray-400 mt-0.5">\${formatSize(file.file_size)}</p>
        </div>
      </div>\`;
  }
  
  function renderListView() {
    let html = \`
      <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Size</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Modified</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">\`;
    
    state.folders.forEach(f => {
      html += \`<tr class="hover:bg-gray-50 cursor-pointer" ondblclick="App.navigate('files', '\${f.id}')">
        <td class="px-4 py-3 flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 56 56"><path d="M8 16a4 4 0 014-4h10l4 5h18a4 4 0 014 4v19a4 4 0 01-4 4H12a4 4 0 01-4-4V16z" fill="#fbbf24"/><path d="M8 21h40v19a4 4 0 01-4 4H12a4 4 0 01-4-4V21z" fill="#f59e0b"/></svg>
          <span class="font-medium text-gray-800">\${f.name}</span>
        </td>
        <td class="px-4 py-3 text-gray-400 hidden md:table-cell">—</td>
        <td class="px-4 py-3 text-gray-400 hidden md:table-cell">\${formatDate(f.created_at)}</td>
        <td class="px-4 py-3 text-right"></td>
      </tr>\`;
    });
    
    state.files.forEach(f => {
      const {icon, color} = getFileIcon(f.mime_type);
      html += \`<tr class="hover:bg-gray-50 cursor-pointer" onclick="App.selectItem('file', '\${f.id}', \${JSON.stringify(f).replace(/"/g,'&quot;')})">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <i class="fas \${icon} \${color} text-lg w-5 text-center"></i>
            <span class="font-medium text-gray-800 truncate max-w-xs">\${f.file_name}</span>
            \${f.is_starred ? '<i class="fas fa-star text-yellow-400 text-xs ml-1"></i>' : ''}
          </div>
        </td>
        <td class="px-4 py-3 text-gray-400 hidden md:table-cell">\${formatSize(f.file_size)}</td>
        <td class="px-4 py-3 text-gray-400 hidden md:table-cell">\${formatDate(f.updated_at)}</td>
        <td class="px-4 py-3 text-right">
          <button onclick="event.stopPropagation(); App.showFileMenu(event, '\${f.id}', \${JSON.stringify(f).replace(/"/g,'&quot;')})" 
            class="text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">
            <i class="fas fa-ellipsis-v"></i>
          </button>
        </td>
      </tr>\`;
    });
    
    html += '</tbody></table></div>';
    return html;
  }
  
  function renderEmpty() {
    return \`
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <div class="relative mb-6">
          <svg width="120" height="100" viewBox="0 0 120 100" fill="none">
            <ellipse cx="60" cy="85" rx="45" ry="8" fill="#f1f5f9"/>
            <rect x="20" y="30" width="80" height="60" rx="8" fill="#e2e8f0"/>
            <rect x="30" y="15" width="40" height="25" rx="4" fill="#cbd5e1"/>
            <circle cx="85" cy="20" r="18" fill="#dbeafe" stroke="#93c5fd" stroke-width="2"/>
            <path d="M85 13v14M79 19h12" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <h3 class="text-lg font-semibold text-gray-700 mb-2">No files here yet</h3>
        <p class="text-gray-400 text-sm mb-5">Upload files or create a new folder to get started</p>
        <div class="flex gap-3">
          <button onclick="App.showUploadModal()" class="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2">
            <i class="fas fa-upload"></i> Upload Files
          </button>
          <button onclick="App.showFolderModal()" class="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center gap-2">
            <i class="fas fa-folder-plus"></i> New Folder
          </button>
        </div>
      </div>\`;
  }
  
  function updateBreadcrumb() {
    const bc = document.getElementById('breadcrumb');
    let html = '<span class="font-medium text-gray-800 cursor-pointer hover:text-blue-600" onclick="App.navigate(\'files\', null)">All Files</span>';
    
    const pathNames = state.folderPath || [];
    pathNames.forEach((item, i) => {
      html += '<span class="mx-1 text-gray-400">/</span>';
      if (i === pathNames.length - 1) {
        html += '<span class="font-medium text-gray-800">' + item.name + '</span>';
      } else {
        html += '<span class="text-gray-500 cursor-pointer hover:text-blue-600" onclick="App.navigateToPathIndex(' + i + ')">' + item.name + '</span>';
      }
    });
    bc.innerHTML = html;
  }
  
  // Select item - show detail panel
  function selectItem(type, id, item) {
    state.selectedItem = item;
    const panel = document.getElementById('detail-panel');
    panel.classList.remove('hidden');
    document.getElementById('main-content').style.marginRight = '280px';
    
    if (type === 'file') {
      showFileDetail(item);
    } else {
      showFolderDetail(item);
    }
  }
  
  function showFileDetail(file) {
    const {icon, color} = getFileIcon(file.mime_type);
    const isImage = file.mime_type?.startsWith('image/');
    
    document.getElementById('detail-title').textContent = file.file_name;
    document.getElementById('detail-content').innerHTML = \`
      <div class="text-center mb-4">
        \${isImage 
          ? \`<img src="\${file.url}" alt="" class="w-full max-h-40 object-contain rounded-lg bg-gray-50 border">\`
          : \`<div class="w-20 h-20 mx-auto bg-gray-100 rounded-xl flex items-center justify-center"><i class="fas \${icon} \${color} text-3xl"></i></div>\`}
      </div>
      <div class="space-y-3 text-sm">
        <div>
          <p class="text-gray-400 text-xs mb-0.5">File name</p>
          <p class="font-medium text-gray-800 break-all">\${file.file_name}</p>
        </div>
        <div>
          <p class="text-gray-400 text-xs mb-0.5">Size</p>
          <p class="font-medium text-gray-800">\${formatSize(file.file_size)}</p>
        </div>
        <div>
          <p class="text-gray-400 text-xs mb-0.5">Type</p>
          <p class="font-medium text-gray-800">\${file.mime_type || 'Unknown'}</p>
        </div>
        <div>
          <p class="text-gray-400 text-xs mb-0.5">Created</p>
          <p class="font-medium text-gray-800">\${formatDate(file.created_at)}</p>
        </div>
        <div>
          <p class="text-gray-400 text-xs mb-0.5">Modified</p>
          <p class="font-medium text-gray-800">\${formatDate(file.updated_at)}</p>
        </div>
      </div>
      <div class="mt-5 space-y-2">
        <a href="\${file.url}" download="\${file.file_name}" 
          class="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium">
          <i class="fas fa-download"></i> Download
        </a>
        <button onclick="App.shareFile('\${file.id}')"
          class="flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium">
          <i class="fas fa-share-alt"></i> Share
        </button>
        <button onclick="App.renameFile('\${file.id}', '\${file.file_name.replace("'", "\\\\'")}')"
          class="flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium">
          <i class="fas fa-pencil-alt"></i> Rename
        </button>
        <button onclick="App.toggleStar('file', '\${file.id}', \${file.is_starred})"
          class="flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium">
          <i class="fas fa-star \${file.is_starred ? 'text-yellow-400' : ''}"></i> \${file.is_starred ? 'Unstar' : 'Star'}
        </button>
        <button onclick="App.trashFile('\${file.id}')"
          class="flex items-center justify-center gap-2 w-full border border-red-200 text-red-600 py-2.5 rounded-lg hover:bg-red-50 text-sm font-medium">
          <i class="fas fa-trash-alt"></i> Move to Trash
        </button>
      </div>
    \`;
  }
  
  function showFolderDetail(folder) {
    document.getElementById('detail-title').textContent = folder.name;
    document.getElementById('detail-content').innerHTML = \`
      <div class="text-center mb-4">
        <svg width="64" height="64" viewBox="0 0 56 56" class="mx-auto"><path d="M8 16a4 4 0 014-4h10l4 5h18a4 4 0 014 4v19a4 4 0 01-4 4H12a4 4 0 01-4-4V16z" fill="#fbbf24"/><path d="M8 21h40v19a4 4 0 01-4 4H12a4 4 0 01-4-4V21z" fill="#f59e0b"/></svg>
      </div>
      <div class="space-y-3 text-sm">
        <div><p class="text-gray-400 text-xs mb-0.5">Name</p><p class="font-medium text-gray-800">\${folder.name}</p></div>
        <div><p class="text-gray-400 text-xs mb-0.5">Created</p><p class="font-medium text-gray-800">\${formatDate(folder.created_at)}</p></div>
      </div>
      <div class="mt-5 space-y-2">
        <button onclick="App.navigate('files', '\${folder.id}')" class="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium">
          <i class="fas fa-folder-open"></i> Open Folder
        </button>
        <button onclick="App.renameFolder('\${folder.id}', '\${folder.name}')" class="flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium">
          <i class="fas fa-pencil-alt"></i> Rename
        </button>
        <button onclick="App.trashFolder('\${folder.id}')" class="flex items-center justify-center gap-2 w-full border border-red-200 text-red-600 py-2.5 rounded-lg hover:bg-red-50 text-sm font-medium">
          <i class="fas fa-trash-alt"></i> Move to Trash
        </button>
      </div>
    \`;
  }
  
  function closeDetail() {
    document.getElementById('detail-panel').classList.add('hidden');
    document.getElementById('main-content').style.marginRight = '0';
    state.selectedItem = null;
  }
  
  // ===== LOAD PAGES =====
  async function loadShared() {
    showLoading('Shared with me');
    try {
      const res = await fetch('/api/shares/shared-with-me', { headers: getHeaders() });
      const data = await res.json();
      const items = data.shared || [];
      
      const content = document.getElementById('page-content');
      if (items.length === 0) {
        content.innerHTML = renderEmptyPage('fa-users', 'Nothing shared with you yet', 'Files shared with you by others will appear here');
        return;
      }
      let html = '<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(160px,1fr))">';
      items.forEach(s => {
        const f = s.files;
        if (!f) return;
        const {icon, color} = getFileIcon(f.mime_type);
        html += \`<div class="file-card">
          <div class="file-thumb"><i class="fas \${icon} \${color} text-4xl"></i></div>
          <div class="p-2.5">
            <p class="text-xs font-medium text-gray-800 truncate">\${f.file_name}</p>
            <p class="text-xs text-gray-400">By \${s.profiles?.name||'Unknown'}</p>
          </div>
        </div>\`;
      });
      html += '</div>';
      content.innerHTML = html;
    } catch(e) { showError('Failed to load shared files'); }
  }
  
  async function loadRecent() {
    showLoading('Recent');
    try {
      const res = await fetch('/api/files/recent/list', { headers: getHeaders() });
      const data = await res.json();
      renderSimpleFileList(data.files || [], 'Recent Files');
    } catch(e) { showError('Failed to load recent files'); }
  }
  
  async function loadStarred() {
    showLoading('Starred');
    try {
      const res = await fetch('/api/files/starred/list', { headers: getHeaders() });
      const data = await res.json();
      renderSimpleFileList(data.files || [], 'Starred Files', 'fa-star', 'No starred files', 'Star files to find them quickly here');
    } catch(e) { showError('Failed to load starred files'); }
  }
  
  async function loadTrash() {
    showLoading('Trash');
    try {
      const [filesRes, foldersRes] = await Promise.all([
        fetch('/api/files/trash/list', { headers: getHeaders() }),
        fetch('/api/folders', { headers: getHeaders() })
      ]);
      const filesData = await filesRes.json();
      const files = filesData.files || [];
      
      const content = document.getElementById('page-content');
      if (files.length === 0) {
        content.innerHTML = renderEmptyPage('fa-trash-alt', 'Trash is empty', 'Deleted files will appear here');
        return;
      }
      
      let html = \`
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">\${files.length} item(s) in trash</p>
          <button onclick="App.emptyTrash()" class="text-red-600 text-sm hover:text-red-800 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">
            <i class="fas fa-trash mr-1"></i> Empty Trash
          </button>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50"><tr>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500">Name</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Size</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Deleted</th>
              <th class="px-4 py-3"></th>
            </tr></thead>
            <tbody class="divide-y divide-gray-100">\`;
      
      files.forEach(f => {
        const {icon, color} = getFileIcon(f.mime_type);
        html += \`<tr class="hover:bg-gray-50">
          <td class="px-4 py-3 flex items-center gap-3">
            <i class="fas \${icon} \${color} text-lg w-5 text-center"></i>
            <span class="font-medium text-gray-800 truncate max-w-xs">\${f.file_name}</span>
          </td>
          <td class="px-4 py-3 text-gray-400 hidden md:table-cell">\${formatSize(f.file_size)}</td>
          <td class="px-4 py-3 text-gray-400 hidden md:table-cell">\${formatDate(f.trashed_at)}</td>
          <td class="px-4 py-3 text-right flex justify-end gap-2">
            <button onclick="App.restoreFile('\${f.id}')" class="text-blue-600 hover:text-blue-800 text-xs border border-blue-200 px-2 py-1 rounded hover:bg-blue-50">Restore</button>
            <button onclick="App.permanentDelete('\${f.id}')" class="text-red-600 hover:text-red-800 text-xs border border-red-200 px-2 py-1 rounded hover:bg-red-50">Delete</button>
          </td>
        </tr>\`;
      });
      
      html += '</tbody></table></div>';
      content.innerHTML = html;
    } catch(e) { showError('Failed to load trash'); }
  }
  
  function renderSimpleFileList(files, title, emptyIcon='fa-clock', emptyTitle='No files', emptyDesc='') {
    const content = document.getElementById('page-content');
    if (files.length === 0) {
      content.innerHTML = renderEmptyPage(emptyIcon || 'fa-file', emptyTitle, emptyDesc);
      return;
    }
    const isGrid = state.view === 'grid';
    if (isGrid) {
      let html = '<div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(160px,1fr))">';
      files.forEach(f => { html += renderFileCard(f); });
      html += '</div>';
      content.innerHTML = html;
    } else {
      state.files = files; state.folders = [];
      content.innerHTML = renderListView();
    }
  }
  
  function renderEmptyPage(icon, title, desc) {
    return \`<div class="flex flex-col items-center justify-center py-24 text-center">
      <div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5">
        <i class="fas \${icon} text-3xl text-gray-400"></i>
      </div>
      <h3 class="text-lg font-semibold text-gray-700 mb-2">\${title}</h3>
      <p class="text-gray-400 text-sm">\${desc}</p>
    </div>\`;
  }
  
  // ===== ANALYTICS =====
  async function loadAnalytics() {
    showLoading('Analytics');
    try {
      const from = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
      const to = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/admin/analytics?from=' + from + '&to=' + to, { headers: getHeaders() });
      if (!res.ok) { showError('Admin access required'); return; }
      const data = await res.json();
      renderAnalytics(data);
    } catch(e) { showError('Failed to load analytics'); }
  }
  
  function renderAnalytics(data) {
    const sum = data.summary || {};
    const dateRange = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' - ' + new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    
    document.getElementById('page-content').innerHTML = \`
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-semibold text-gray-800 flex items-center gap-2"><i class="far fa-chart-bar text-blue-500"></i> Visitors report</h2>
        <span class="text-sm text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">\${dateRange}</span>
      </div>
      
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        \${renderStatCard('New files', sum.new_files||0, '100%')}
        \${renderStatCard('New folders', sum.new_folders||0, '100%')}
        \${renderStatCard('New users', sum.new_users||0, '100%')}
        \${renderStatCard('Total Space Used', formatSize(sum.total_space_used||0), '100%')}
      </div>
      
      <div class="grid lg:grid-cols-2 gap-6 mb-6">
        <div class="bg-white border border-gray-200 rounded-lg p-5">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-semibold text-gray-700">Pageviews</h3>
            <span class="text-sm text-gray-400">\${(data.total_views||0).toLocaleString()} total views</span>
          </div>
          <canvas id="pageviews-chart" height="200"></canvas>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-5">
          <h3 class="font-semibold text-gray-700 mb-4">Top devices</h3>
          <canvas id="devices-chart" height="200"></canvas>
          <div class="flex justify-center gap-6 mt-3 text-xs text-gray-500">
            <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-blue-200 inline-block"></span> Mobile</span>
            <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-red-300 inline-block"></span> Tablet</span>
            <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-yellow-400 inline-block"></span> Desktop</span>
          </div>
        </div>
      </div>
      
      <div class="grid lg:grid-cols-2 gap-6">
        <div class="bg-white border border-gray-200 rounded-lg p-5">
          <h3 class="font-semibold text-gray-700 mb-3">Top Locations</h3>
          <div class="space-y-2" id="locations-list"></div>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-5">
          <h3 class="font-semibold text-gray-700 mb-3">Top browsers</h3>
          <div class="space-y-2" id="browsers-list"></div>
        </div>
      </div>
    \`;
    
    // Chart.js pageviews
    setTimeout(() => {
      const pvDates = (data.page_views||[]).map(pv => pv.date);
      const pvCounts = (data.page_views||[]).map(pv => pv.count);
      const mockPrev = pvCounts.map(v => Math.max(0, v - Math.floor(Math.random()*100)));
      
      new Chart(document.getElementById('pageviews-chart'), {
        type: 'line',
        data: {
          labels: pvDates.length > 0 ? pvDates : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
          datasets: [
            {label:'Current',data: pvCounts.length>0 ? pvCounts : [450,280,490,320,210,430,390],borderColor:'#93c5fd',backgroundColor:'rgba(147,197,253,0.15)',fill:true,tension:0.4},
            {label:'Previous',data: mockPrev.length>0 ? mockPrev : [350,130,180,260,150,370,410],borderColor:'#f87171',backgroundColor:'rgba(248,113,113,0.1)',fill:true,tension:0.4}
          ]
        },
        options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
      });
      
      // Devices radar
      const devs = data.devices || {mobile:45,tablet:30,desktop:25};
      new Chart(document.getElementById('devices-chart'), {
        type: 'polarArea',
        data: {
          labels: ['Mobile','Tablet','Desktop'],
          datasets: [{ data:[devs.mobile||30,devs.tablet||20,devs.desktop||10], backgroundColor:['rgba(147,197,253,0.6)','rgba(252,165,165,0.6)','rgba(251,191,36,0.6)'] }]
        },
        options: { responsive:true, plugins:{legend:{display:false}} }
      });
      
      // Locations
      const locs = data.locations || [];
      const locsList = document.getElementById('locations-list');
      if (locs.length === 0) {
        locsList.innerHTML = '<p class="text-gray-400 text-sm">No location data</p>';
      } else {
        const maxVal = Math.max(...locs.map(l => l.count));
        locsList.innerHTML = locs.slice(0,5).map(l => \`
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-700 w-24 truncate">\${l.country}</span>
            <div class="flex-1 bg-gray-100 rounded-full h-2"><div class="bg-blue-400 h-2 rounded-full" style="width:\${Math.round(l.count/maxVal*100)}%"></div></div>
            <span class="text-xs text-gray-500 w-8 text-right">\${l.count}</span>
          </div>\`).join('');
      }
      
      // Browsers
      const browsers = data.browsers || [];
      const bList = document.getElementById('browsers-list');
      if (browsers.length === 0) {
        bList.innerHTML = '<p class="text-gray-400 text-sm">No browser data</p>';
      } else {
        const maxB = Math.max(...browsers.map(b => b.count));
        bList.innerHTML = browsers.slice(0,5).map(b => \`
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-700 w-24 truncate">\${b.browser}</span>
            <div class="flex-1 bg-gray-100 rounded-full h-2"><div class="bg-green-400 h-2 rounded-full" style="width:\${Math.round(b.count/maxB*100)}%"></div></div>
            <span class="text-xs text-gray-500 w-8 text-right">\${b.count}</span>
          </div>\`).join('');
      }
    }, 100);
  }
  
  function renderStatCard(label, value, change) {
    return \`<div class="bg-white border border-gray-200 rounded-lg p-4">
      <p class="text-sm text-gray-500 mb-1">\${label}</p>
      <div class="flex items-baseline gap-2">
        <span class="text-2xl font-bold text-gray-800">\${value}</span>
        <span class="text-sm text-green-600 flex items-center gap-0.5"><i class="fas fa-arrow-up text-xs"></i>\${change}</span>
      </div>
    </div>\`;
  }
  
  // ===== ADMIN USERS =====
  async function loadAdminUsers() {
    showLoading('Users');
    try {
      const res = await fetch('/api/admin/users', { headers: getHeaders() });
      if (!res.ok) { showError('Admin access required'); return; }
      const data = await res.json();
      const users = data.users || [];
      
      let html = \`
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold text-gray-800">Users (\${data.total||0})</h2>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead class="bg-gray-50"><tr>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500">User</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Storage</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Role</th>
              <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">Joined</th>
            </tr></thead>
            <tbody class="divide-y divide-gray-100">\`;
      
      users.forEach(u => {
        const pct = u.quota ? Math.round((u.used_space||0)/u.quota*100) : 0;
        html += \`<tr class="hover:bg-gray-50">
          <td class="px-4 py-3">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">\${(u.name||u.email||'U')[0].toUpperCase()}</div>
              <div>
                <p class="font-medium text-gray-800">\${u.name||'—'}</p>
                <p class="text-xs text-gray-400">\${u.email}</p>
              </div>
            </div>
          </td>
          <td class="px-4 py-3 hidden md:table-cell">
            <div>
              <div class="flex justify-between text-xs text-gray-500 mb-1">\${formatSize(u.used_space||0)} / \${formatSize(u.quota||0)}</div>
              <div class="progress-bar"><div class="progress-fill" style="width:\${pct}%"></div></div>
            </div>
          </td>
          <td class="px-4 py-3 hidden md:table-cell">
            <span class="badge \${u.role==='admin'?'bg-purple-100 text-purple-700':'bg-blue-100 text-blue-700'}">\${u.role||'user'}</span>
          </td>
          <td class="px-4 py-3 text-gray-400 hidden md:table-cell">\${formatDate(u.created_at)}</td>
        </tr>\`;
      });
      
      html += '</tbody></table></div>';
      document.getElementById('page-content').innerHTML = html;
    } catch(e) { showError('Failed to load users'); }
  }
  
  async function loadAdminLogs() {
    showLoading('Logs');
    try {
      const res = await fetch('/api/admin/logs', { headers: getHeaders() });
      if (!res.ok) { showError('Admin access required'); return; }
      const data = await res.json();
      const logs = data.logs || [];
      
      const icons = { upload:'fa-upload text-green-500', download:'fa-download text-blue-500', delete:'fa-trash text-red-500', share:'fa-share text-purple-500', login:'fa-sign-in-alt text-yellow-500', create_folder:'fa-folder-plus text-yellow-400' };
      
      let html = \`<div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50"><tr>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500">Action</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500">User</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 hidden md:table-cell">IP</th>
            <th class="text-left px-4 py-3 text-xs font-semibold text-gray-500">Time</th>
          </tr></thead>
          <tbody class="divide-y divide-gray-100">\`;
      
      if (logs.length === 0) {
        html += '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">No activity logs yet</td></tr>';
      }
      
      logs.forEach(l => {
        const ic = icons[l.action] || 'fa-circle text-gray-400';
        html += \`<tr class="hover:bg-gray-50">
          <td class="px-4 py-3"><div class="flex items-center gap-2"><i class="fas \${ic} text-sm"></i><span class="capitalize">\${l.action}</span></div></td>
          <td class="px-4 py-3 text-gray-600">\${l.profiles?.name||l.profiles?.email||'—'}</td>
          <td class="px-4 py-3 text-gray-400 hidden md:table-cell">\${l.ip||'—'}</td>
          <td class="px-4 py-3 text-gray-400">\${formatDate(l.created_at)}</td>
        </tr>\`;
      });
      
      html += '</tbody></table></div>';
      document.getElementById('page-content').innerHTML = html;
    } catch(e) { showError('Failed to load logs'); }
  }
  
  // ===== UPLOAD =====
  let uploadFiles = [];
  
  function showUploadModal() {
    uploadFiles = [];
    document.getElementById('upload-queue').innerHTML = '';
    document.getElementById('upload-modal').classList.remove('hidden');
  }
  function closeUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
    uploadFiles = [];
    document.getElementById('upload-queue').innerHTML = '';
  }
  
  function handleFileSelect(files) {
    uploadFiles = Array.from(files);
    const queue = document.getElementById('upload-queue');
    queue.innerHTML = uploadFiles.map((f, i) => \`
      <div class="flex items-center gap-3 p-2 bg-gray-50 rounded-lg" id="upload-item-\${i}">
        <i class="fas fa-file text-gray-400 text-sm w-4"></i>
        <span class="flex-1 text-sm text-gray-700 truncate">\${f.name}</span>
        <span class="text-xs text-gray-400">\${formatSize(f.size)}</span>
        <div class="progress-bar w-20 hidden" id="progress-\${i}"><div class="progress-fill" id="progress-fill-\${i}" style="width:0%"></div></div>
      </div>
    \`).join('');
  }
  
  async function startUpload() {
    if (uploadFiles.length === 0) { showToast('No files selected', 'error'); return; }
    const btn = document.getElementById('upload-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Uploading...';
    btn.disabled = true;
    
    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      document.getElementById('progress-' + i)?.classList.remove('hidden');
      
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (state.currentFolder) formData.append('folder_id', state.currentFolder);
        
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round(e.loaded / e.total * 100);
            const bar = document.getElementById('progress-fill-' + i);
            if (bar) bar.style.width = pct + '%';
          }
        };
        
        await new Promise((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
            else reject(new Error('Upload failed: ' + xhr.statusText));
          };
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.open('POST', '/api/files/upload');
          xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());
          xhr.send(formData);
        });
        
        // Mark done
        const item = document.getElementById('upload-item-' + i);
        if (item) item.querySelector('i').className = 'fas fa-check text-green-500 text-sm w-4';
      } catch(err) {
        const item = document.getElementById('upload-item-' + i);
        if (item) item.querySelector('i').className = 'fas fa-times text-red-500 text-sm w-4';
      }
    }
    
    showToast(uploadFiles.length + ' file(s) uploaded successfully', 'success');
    closeUploadModal();
    loadFiles();
    
    btn.innerHTML = '<i class="fas fa-upload mr-2"></i>Upload';
    btn.disabled = false;
  }
  
  // Drag & drop
  function attachDragEvents() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      handleFileSelect(e.dataTransfer.files);
    });
    
    // Also handle drag on main area
    const mainContent = document.getElementById('page-content');
    mainContent?.addEventListener('dragover', e => {
      e.preventDefault();
      if (!document.getElementById('upload-modal').classList.contains('hidden')) return;
      showUploadModal();
    });
  }
  
  // ===== FOLDER OPERATIONS =====
  function showFolderModal() {
    document.getElementById('folder-name-input').value = '';
    document.getElementById('folder-modal').classList.remove('hidden');
    document.getElementById('folder-name-input').focus();
  }
  
  async function createFolder() {
    const name = document.getElementById('folder-name-input').value.trim();
    if (!name) return;
    
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name, parent_id: state.currentFolder || null })
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Failed to create folder', 'error'); return; }
      
      document.getElementById('folder-modal').classList.add('hidden');
      showToast('Folder "' + name + '" created', 'success');
      loadFiles();
    } catch(e) { showToast('Failed to create folder', 'error'); }
  }
  
  // ===== RENAME =====
  function renameFile(id, currentName) {
    state.renameTarget = { type: 'file', id };
    document.getElementById('rename-input').value = currentName;
    document.getElementById('rename-modal').classList.remove('hidden');
    document.getElementById('rename-input').focus();
    document.getElementById('rename-input').select();
  }
  
  function renameFolder(id, currentName) {
    state.renameTarget = { type: 'folder', id };
    document.getElementById('rename-input').value = currentName;
    document.getElementById('rename-modal').classList.remove('hidden');
    document.getElementById('rename-input').focus();
    document.getElementById('rename-input').select();
  }
  
  async function confirmRename() {
    const newName = document.getElementById('rename-input').value.trim();
    if (!newName || !state.renameTarget) return;
    
    const { type, id } = state.renameTarget;
    const url = '/api/' + (type === 'file' ? 'files' : 'folders') + '/' + id;
    const body = type === 'file' ? { file_name: newName } : { name: newName };
    
    try {
      const res = await fetch(url, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { showToast('Rename failed', 'error'); return; }
      document.getElementById('rename-modal').classList.add('hidden');
      showToast('Renamed successfully', 'success');
      closeDetail();
      loadFiles();
    } catch(e) { showToast('Rename failed', 'error'); }
  }
  
  // ===== STAR =====
  async function toggleStar(type, id, currentStar) {
    const url = '/api/' + (type === 'file' ? 'files' : 'folders') + '/' + id;
    const body = { is_starred: !currentStar };
    
    try {
      const res = await fetch(url, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(body) });
      if (!res.ok) return;
      showToast(!currentStar ? 'Added to starred' : 'Removed from starred', 'success');
      closeDetail();
      loadFiles();
    } catch(e) {}
  }
  
  // ===== TRASH =====
  async function trashFile(id) {
    if (!confirm('Move this file to trash?')) return;
    try {
      const res = await fetch('/api/files/' + id, { method: 'DELETE', headers: getHeaders() });
      if (!res.ok) { showToast('Failed to delete', 'error'); return; }
      showToast('File moved to trash', 'success');
      closeDetail();
      loadFiles();
    } catch(e) { showToast('Failed to delete', 'error'); }
  }
  
  async function trashFolder(id) {
    if (!confirm('Move this folder to trash?')) return;
    try {
      const res = await fetch('/api/folders/' + id, { method: 'DELETE', headers: getHeaders() });
      if (!res.ok) { showToast('Failed to delete', 'error'); return; }
      showToast('Folder moved to trash', 'success');
      closeDetail();
      loadFiles();
    } catch(e) { showToast('Failed to delete', 'error'); }
  }
  
  async function restoreFile(id) {
    try {
      await fetch('/api/files/' + id + '/restore', { method: 'POST', headers: getHeaders() });
      showToast('File restored', 'success');
      loadTrash();
    } catch(e) {}
  }
  
  async function permanentDelete(id) {
    if (!confirm('Permanently delete this file? This cannot be undone.')) return;
    try {
      await fetch('/api/files/' + id + '?permanent=true', { method: 'DELETE', headers: getHeaders() });
      showToast('File permanently deleted', 'success');
      loadTrash();
    } catch(e) {}
  }
  
  async function emptyTrash() {
    if (!confirm('Empty all trash? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/files/trash/list', { headers: getHeaders() });
      const data = await res.json();
      await Promise.all((data.files || []).map(f => 
        fetch('/api/files/' + f.id + '?permanent=true', { method: 'DELETE', headers: getHeaders() })
      ));
      showToast('Trash emptied', 'success');
      loadTrash();
    } catch(e) {}
  }
  
  // ===== SHARE =====
  function shareFile(id) {
    state.shareTarget = { file_id: id };
    document.getElementById('share-modal').classList.remove('hidden');
    document.getElementById('share-link-area').classList.add('hidden');
    document.getElementById('share-password').value = '';
  }
  
  async function createShare() {
    if (!state.shareTarget) return;
    const password = document.getElementById('share-password').value;
    const allowDownload = document.getElementById('share-allow-download').checked;
    
    try {
      const res = await fetch('/api/shares', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...state.shareTarget,
          password: password || null,
          allow_download: allowDownload
        })
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Failed to create share', 'error'); return; }
      
      document.getElementById('share-link-input').value = data.share_url;
      document.getElementById('share-link-area').classList.remove('hidden');
    } catch(e) { showToast('Failed to create share link', 'error'); }
  }
  
  async function copyShareLink() {
    const link = document.getElementById('share-link-input').value;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Share link copied to clipboard!', 'success');
    } catch(e) {
      document.getElementById('share-link-input').select();
      document.execCommand('copy');
      showToast('Share link copied!', 'success');
    }
  }
  
  // ===== SEARCH =====
  function debounceSearch(value) {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => {
      if (state.currentPage === 'files') loadFiles();
    }, 400);
  }
  
  // ===== VIEW =====
  function setView(v) {
    state.view = v;
    document.getElementById('btn-grid').className = v==='grid' ? 'px-3 py-1.5 text-sm text-blue-600 bg-blue-50 border-r border-gray-200' : 'px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 border-r border-gray-200';
    document.getElementById('btn-list').className = v==='list' ? 'px-3 py-1.5 text-sm text-blue-600 bg-blue-50' : 'px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50';
    
    if (state.currentPage === 'files') loadFiles();
    else if (state.currentPage === 'recent') loadRecent();
    else if (state.currentPage === 'starred') loadStarred();
  }
  
  // ===== PROFILE =====
  function showProfile() {
    const u = state.user;
    if (!u) return;
    alert('User: ' + (u.name||u.email) + '\\nEmail: ' + u.email + '\\nRole: ' + (u.role||'user'));
  }
  
  // ===== LOGOUT =====
  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: getHeaders() });
    } catch(e) {}
    localStorage.removeItem('sb_token');
    localStorage.removeItem('sb_refresh');
    localStorage.removeItem('user');
    document.cookie = 'sb_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.href = '/login';
  }
  
  // ===== UTILS =====
  function showLoading(title='') {
    document.getElementById('page-content').innerHTML = \`
      <div class="flex items-center justify-center py-20">
        <div class="text-center">
          <i class="fas fa-spinner fa-spin text-3xl text-blue-500 mb-3"></i>
          <p class="text-gray-400 text-sm">Loading\${title ? ' ' + title : ''}...</p>
        </div>
      </div>\`;
  }
  
  function showError(msg) {
    document.getElementById('page-content').innerHTML = \`
      <div class="flex items-center justify-center py-20">
        <div class="text-center">
          <i class="fas fa-exclamation-circle text-3xl text-red-400 mb-3"></i>
          <p class="text-gray-700 font-medium">\${msg}</p>
          <button onclick="App.navigate(App.currentPage||'files')" class="mt-4 text-blue-600 text-sm hover:text-blue-800">Try again</button>
        </div>
      </div>\`;
  }
  
  // File context menu
  function showFileMenu(event, fileId, file) {
    event.stopPropagation();
    // Remove existing menus
    document.querySelectorAll('.dropdown-menu').forEach(m => m.remove());
    
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    menu.style.position = 'fixed';
    menu.style.left = (event.clientX - 160) + 'px';
    menu.style.top = event.clientY + 'px';
    menu.innerHTML = \`
      <div class="dropdown-item" onclick="App.downloadFile('\${file.url}', '\${file.file_name}')"><i class="fas fa-download w-4"></i> Download</div>
      <div class="dropdown-item" onclick="App.shareFile('\${fileId}')"><i class="fas fa-share-alt w-4"></i> Share</div>
      <div class="dropdown-item" onclick="App.renameFile('\${fileId}', '\${file.file_name.replace("'","\\\\'")}')"><i class="fas fa-pencil-alt w-4"></i> Rename</div>
      <div class="dropdown-item" onclick="App.toggleStar('file', '\${fileId}', \${file.is_starred})"><i class="fas fa-star w-4"></i> \${file.is_starred ? 'Unstar' : 'Star'}</div>
      <hr class="my-1 border-gray-100">
      <div class="dropdown-item danger" onclick="App.trashFile('\${fileId}')"><i class="fas fa-trash-alt w-4"></i> Move to Trash</div>
    \`;
    
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 10);
  }
  
  function downloadFile(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  }
  
  // Public API
  return {
    init, navigate, setView, debounceSearch,
    showUploadModal, closeUploadModal, handleFileSelect, startUpload,
    showFolderModal, createFolder,
    selectItem, closeDetail,
    renameFile, renameFolder, confirmRename,
    trashFile, trashFolder, restoreFile, permanentDelete, emptyTrash,
    shareFile, createShare, copyShareLink,
    toggleStar,
    showProfile, logout,
    showFileMenu, downloadFile,
    currentPage: state.currentPage
  };
})();

// Initialize app
App.init();

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.dropdown-menu').forEach(m => m.remove());
    App.closeDetail();
  }
});
</script>
</body>
</html>`

export default app
