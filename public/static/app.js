// BeDrive - Main Application JS
(function() {
'use strict';

// ─── State ───────────────────────────────────────────────
const state = {
  user: null,
  token: null,
  view: 'grid',
  currentPage: 'files',
  currentFolder: null,
  folderPath: [],
  files: [],
  folders: [],
  selectedItem: null,
  searchTimeout: null,
  renameTarget: null,
  shareTarget: null,
  uploadFiles: [],
  // Notifications
  notifOpen: false,
  notifList: [],
  notifUnread: 0,
  notifInterval: null,
  // Settings
  settingsTab: 'users',
  settingsUsers: [],
  settingsPage: 1,
  settingsSearch: ''
};

// ─── Auth helpers ─────────────────────────────────────────
function getToken() {
  return state.token || localStorage.getItem('sb_token') || '';
}
function authHeaders() {
  return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
}

// ─── Toast ────────────────────────────────────────────────
function toast(msg, type) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  const base = 'fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg text-white text-sm font-medium shadow-lg transition-all duration-300 toast';
  const color = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-gray-900';
  t.className = base + ' ' + color + ' show';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = base + ' bg-gray-900'; }, 3000);
}

// ─── Format helpers ───────────────────────────────────────
function fmtSize(b) {
  if (!b || b === 0) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fileIcon(mime) {
  if (!mime) return { icon: 'fa-file', color: 'text-gray-400' };
  if (mime.startsWith('image/'))  return { icon: 'fa-image', color: 'text-green-500' };
  if (mime.startsWith('video/'))  return { icon: 'fa-film', color: 'text-purple-500' };
  if (mime.startsWith('audio/'))  return { icon: 'fa-music', color: 'text-pink-500' };
  if (mime.includes('pdf'))       return { icon: 'fa-file-pdf', color: 'text-red-500' };
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return { icon: 'fa-file-archive', color: 'text-yellow-500' };
  if (mime.includes('word') || mime.includes('document'))  return { icon: 'fa-file-word', color: 'text-blue-500' };
  if (mime.includes('excel') || mime.includes('spreadsheet')) return { icon: 'fa-file-excel', color: 'text-green-600' };
  if (mime.includes('powerpoint') || mime.includes('presentation')) return { icon: 'fa-file-powerpoint', color: 'text-orange-500' };
  if (mime === 'text/plain') return { icon: 'fa-file-alt', color: 'text-gray-500' };
  return { icon: 'fa-file', color: 'text-gray-400' };
}

// ─── Init ─────────────────────────────────────────────────
async function init() {
  const token = localStorage.getItem('sb_token');
  if (!token) { window.location.href = '/login'; return; }
  state.token = token;

  try {
    const res = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!res.ok) { window.location.href = '/login'; return; }
    const data = await res.json();
    state.user = data.user;
    updateUserUI();
    startNotifPolling();
    navigate('files');
  } catch(e) {
    window.location.href = '/login';
  }
}

function updateUserUI() {
  const u = state.user;
  if (!u) return;
  const initial = (u.name || u.email || 'D')[0].toUpperCase();
  setEl('user-avatar', initial);
  setEl('header-avatar', initial);
  setEl('user-name', u.name || u.email || 'User');
  if (u.role === 'admin') {
    const adminMenu = document.getElementById('admin-menu');
    if (adminMenu) adminMenu.classList.remove('hidden');
  }
  if (u.quota !== undefined && u.used_space !== undefined) {
    const pct = Math.min(100, Math.round((u.used_space / u.quota) * 100));
    setEl('storage-used', fmtSize(u.used_space));
    setEl('storage-quota', fmtSize(u.quota));
    const bar = document.getElementById('storage-bar');
    if (bar) bar.style.width = pct + '%';
    setEl('storage-pct', pct + '% used');
  }
}

function setEl(id, html) {
  const el = document.getElementById(id);
  if (el) el.textContent = html;
}

// ─── Navigation ───────────────────────────────────────────
function navigate(page, folderId) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById('nav-' + page);
  if (navEl) navEl.classList.add('active');
  closeDetail();

  if (page === 'files') {
    if (folderId !== undefined) {
      if (folderId === null) { state.currentFolder = null; state.folderPath = []; }
      else { state.currentFolder = folderId; }
    }
    loadFiles();
  } else if (page === 'shared')       loadShared();
  else if (page === 'recent')         loadRecent();
  else if (page === 'starred')        loadStarred();
  else if (page === 'trash')          loadTrash();
  else if (page === 'analytics')      loadAnalytics();
  else if (page === 'settings')       loadSettings();
  else if (page === 'admin-users')    loadAdminUsers();
  else if (page === 'admin-logs')     loadAdminLogs();
}

// ─── Load files ───────────────────────────────────────────
async function loadFiles() {
  const search = (document.getElementById('search-input') || {}).value || '';
  showLoading();
  updateBreadcrumb();

  try {
    const params = new URLSearchParams();
    if (state.currentFolder) params.set('folder', state.currentFolder);
    if (search) params.set('search', search);

    const [fRes, dRes] = await Promise.all([
      fetch('/api/files?' + params, { headers: authHeaders() }),
      fetch('/api/folders?' + (state.currentFolder ? 'parent=' + state.currentFolder : ''), { headers: authHeaders() })
    ]);

    const [fData, dData] = await Promise.all([fRes.json(), dRes.json()]);
    state.files   = fData.files   || [];
    state.folders = dData.folders || [];
    renderFiles();
  } catch(e) { showError('Failed to load files'); }
}

// ─── Render files ─────────────────────────────────────────
function renderFiles() {
  const pc = document.getElementById('page-content');
  if (!pc) return;

  let html = '<div class="flex items-center justify-between mb-5">';
  html += '<div class="flex items-center gap-2">';
  html += '<button onclick="BeDrive.showFolderModal()" class="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 hover:border-gray-300 transition-colors"><i class="fas fa-folder-plus text-yellow-500 mr-1"></i>New Folder</button>';
  html += '<button onclick="BeDrive.showUploadModal()" class="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 hover:border-gray-300 transition-colors"><i class="fas fa-upload text-blue-500 mr-1"></i>Upload</button>';
  html += '</div>';
  html += '<span class="text-xs text-gray-400 flex items-center gap-1"><i class="fas fa-sort-amount-down"></i> Last modified</span>';
  html += '</div>';

  if (state.folders.length === 0 && state.files.length === 0) {
    html += emptyState();
  } else if (state.view === 'grid') {
    html += '<div class="grid gap-3" style="grid-template-columns:repeat(auto-fill,minmax(155px,1fr))">';
    state.folders.forEach(f => { html += folderCard(f); });
    state.files.forEach(f => { html += fileCard(f); });
    html += '</div>';
  } else {
    html += listView(state.folders, state.files);
  }

  pc.innerHTML = html;
  initDragDrop();
}

function folderCard(f) {
  const name = escHtml(f.name);
  const id   = f.id;
  return '<div class="file-card group" ondblclick="BeDrive.openFolder(\'' + id + '\',\'' + name + '\')" onclick="BeDrive.selectFolder(\'' + id + '\')" oncontextmenu="BeDrive.ctxFolder(event,\'' + id + '\',\'' + name + '\');return false">'
    + '<div class="file-thumb" style="background:#fffbeb">'
    + '<svg width="52" height="52" viewBox="0 0 56 56" fill="none"><path d="M8 16a4 4 0 014-4h10l4 5h18a4 4 0 014 4v19a4 4 0 01-4 4H12a4 4 0 01-4-4V16z" fill="#fbbf24"/><path d="M8 21h40v19a4 4 0 01-4 4H12a4 4 0 01-4-4V21z" fill="#f59e0b"/></svg>'
    + '</div>'
    + '<div class="p-2.5"><p class="text-xs font-medium text-gray-800 truncate" title="' + name + '">' + name + '</p><p class="text-xs text-gray-400 mt-0.5">Folder</p></div>'
    + '</div>';
}

function fileCard(f) {
  const { icon, color } = fileIcon(f.mime_type);
  const isImg = f.mime_type && f.mime_type.startsWith('image/');
  const name  = escHtml(f.file_name);
  const id    = f.id;
  const url   = f.url || '';
  return '<div class="file-card group relative" onclick="BeDrive.selectFile(\'' + id + '\')" oncontextmenu="BeDrive.ctxFile(event,\'' + id + '\');return false">'
    + '<div class="file-thumb relative">'
    + (isImg
        ? '<img src="' + url + '" alt="' + name + '" loading="lazy" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">'
          + '<div style="display:none" class="w-full h-full flex items-center justify-center"><i class="fas ' + icon + ' ' + color + ' text-4xl"></i></div>'
        : '<i class="fas ' + icon + ' ' + color + ' text-4xl"></i>')
    + (f.is_starred ? '<div class="absolute top-1.5 right-1.5"><i class="fas fa-star text-yellow-400 text-xs drop-shadow"></i></div>' : '')
    + '</div>'
    + '<div class="p-2.5"><p class="text-xs font-medium text-gray-800 truncate" title="' + name + '">' + name + '</p>'
    + '<p class="text-xs text-gray-400 mt-0.5">' + fmtSize(f.file_size) + '</p></div>'
    + '</div>';
}

function listView(folders, files) {
  let html = '<div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">'
    + '<table class="w-full text-sm"><thead class="bg-gray-50 border-b border-gray-200">'
    + '<tr><th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>'
    + '<th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Size</th>'
    + '<th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Modified</th>'
    + '<th class="w-10"></th></tr></thead><tbody class="divide-y divide-gray-100">';

  folders.forEach(function(f) {
    const name = escHtml(f.name);
    html += '<tr class="hover:bg-gray-50 cursor-pointer" ondblclick="BeDrive.openFolder(\'' + f.id + '\',\'' + name + '\')" onclick="BeDrive.selectFolder(\'' + f.id + '\')">'
      + '<td class="px-4 py-3"><div class="flex items-center gap-3">'
      + '<svg width="18" height="18" viewBox="0 0 56 56"><path d="M8 16a4 4 0 014-4h10l4 5h18a4 4 0 014 4v19a4 4 0 01-4 4H12a4 4 0 01-4-4V16z" fill="#fbbf24"/><path d="M8 21h40v19a4 4 0 01-4 4H12a4 4 0 01-4-4V21z" fill="#f59e0b"/></svg>'
      + '<span class="font-medium text-gray-800">' + name + '</span></div></td>'
      + '<td class="px-4 py-3 text-gray-400 hidden md:table-cell">—</td>'
      + '<td class="px-4 py-3 text-gray-400 hidden md:table-cell">' + fmtDate(f.created_at) + '</td>'
      + '<td class="px-4 py-3"><button onclick="event.stopPropagation();BeDrive.ctxFolder(event,\'' + f.id + '\',\'' + name + '\')" class="p-1.5 rounded hover:bg-gray-100 text-gray-400"><i class="fas fa-ellipsis-v"></i></button></td>'
      + '</tr>';
  });

  files.forEach(function(f) {
    const { icon, color } = fileIcon(f.mime_type);
    const name = escHtml(f.file_name);
    html += '<tr class="hover:bg-gray-50 cursor-pointer" onclick="BeDrive.selectFile(\'' + f.id + '\')">'
      + '<td class="px-4 py-3"><div class="flex items-center gap-3">'
      + '<i class="fas ' + icon + ' ' + color + ' text-base w-5 text-center"></i>'
      + '<span class="font-medium text-gray-800 truncate max-w-xs">' + name + '</span>'
      + (f.is_starred ? '<i class="fas fa-star text-yellow-400 text-xs ml-1"></i>' : '')
      + '</div></td>'
      + '<td class="px-4 py-3 text-gray-400 hidden md:table-cell">' + fmtSize(f.file_size) + '</td>'
      + '<td class="px-4 py-3 text-gray-400 hidden md:table-cell">' + fmtDate(f.updated_at) + '</td>'
      + '<td class="px-4 py-3"><button onclick="event.stopPropagation();BeDrive.ctxFile(event,\'' + f.id + '\')" class="p-1.5 rounded hover:bg-gray-100 text-gray-400"><i class="fas fa-ellipsis-v"></i></button></td>'
      + '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

function emptyState() {
  return '<div class="flex flex-col items-center justify-center py-24 text-center">'
    + '<div class="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-5"><i class="fas fa-cloud-upload-alt text-4xl text-blue-400"></i></div>'
    + '<h3 class="text-lg font-semibold text-gray-700 mb-2">No files here yet</h3>'
    + '<p class="text-gray-400 text-sm mb-6">Upload files or create a new folder to get started</p>'
    + '<div class="flex gap-3">'
    + '<button onclick="BeDrive.showUploadModal()" class="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"><i class="fas fa-upload"></i> Upload Files</button>'
    + '<button onclick="BeDrive.showFolderModal()" class="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center gap-2"><i class="fas fa-folder-plus"></i> New Folder</button>'
    + '</div></div>';
}

// ─── Breadcrumb ───────────────────────────────────────────
function updateBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  if (!bc) return;
  let html = '<span class="font-semibold text-gray-800 cursor-pointer hover:text-blue-600 text-sm" onclick="BeDrive.goRoot()">All Files</span>';
  (state.folderPath || []).forEach(function(item, i) {
    html += '<i class="fas fa-chevron-right text-gray-400 text-xs mx-2"></i>';
    if (i === state.folderPath.length - 1) {
      html += '<span class="text-sm font-semibold text-gray-800">' + escHtml(item.name) + '</span>';
    } else {
      html += '<span class="text-sm text-gray-500 cursor-pointer hover:text-blue-600" onclick="BeDrive.goPathIndex(' + i + ')">' + escHtml(item.name) + '</span>';
    }
  });
  bc.innerHTML = html;
}

function goRoot() {
  state.currentFolder = null;
  state.folderPath = [];
  navigate('files');
}

function openFolder(id, name) {
  state.folderPath.push({ id, name });
  state.currentFolder = id;
  navigate('files', id);
}

function goPathIndex(i) {
  state.folderPath = state.folderPath.slice(0, i + 1);
  state.currentFolder = state.folderPath[i].id;
  navigate('files', state.currentFolder);
}

// ─── Select item → detail panel ──────────────────────────
function selectFile(id) {
  const f = state.files.find(function(x) { return x.id === id; });
  if (!f) return;
  state.selectedItem = f;
  showDetailPanel(fileDetailHTML(f));
}

function selectFolder(id) {
  const f = state.folders.find(function(x) { return x.id === id; });
  if (!f) return;
  state.selectedItem = f;
  showDetailPanel(folderDetailHTML(f));
}

function showDetailPanel(html) {
  const panel = document.getElementById('detail-panel');
  const main  = document.getElementById('main-content');
  if (!panel) return;
  document.getElementById('detail-content').innerHTML = html;
  panel.classList.remove('hidden');
  if (main) main.style.marginRight = '280px';
}

function closeDetail() {
  const panel = document.getElementById('detail-panel');
  const main  = document.getElementById('main-content');
  if (panel) panel.classList.add('hidden');
  if (main)  main.style.marginRight = '0';
  state.selectedItem = null;
}

function fileDetailHTML(f) {
  const { icon, color } = fileIcon(f.mime_type);
  const isImg = f.mime_type && f.mime_type.startsWith('image/');
  const name  = escHtml(f.file_name);
  let html = '<div class="text-center mb-5">';
  if (isImg) {
    html += '<img src="' + f.url + '" alt="' + name + '" class="w-full max-h-44 object-contain rounded-lg bg-gray-50 border border-gray-100">';
  } else {
    html += '<div class="w-20 h-20 mx-auto bg-gray-100 rounded-2xl flex items-center justify-center"><i class="fas ' + icon + ' ' + color + ' text-3xl"></i></div>';
  }
  html += '</div>';
  html += '<h3 class="font-semibold text-gray-800 text-sm mb-4 break-all">' + name + '</h3>';
  html += '<div class="space-y-3 text-xs mb-5">';
  html += detailRow('Size', fmtSize(f.file_size));
  html += detailRow('Type', f.mime_type || 'Unknown');
  html += detailRow('Created', fmtDate(f.created_at));
  html += detailRow('Modified', fmtDate(f.updated_at));
  html += '</div>';
  html += '<div class="space-y-2">';
  html += '<a href="' + f.url + '" download="' + name + '" class="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"><i class="fas fa-download"></i> Download</a>';
  html += '<button onclick="BeDrive.shareFile(\'' + f.id + '\')" class="flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"><i class="fas fa-share-alt text-blue-500"></i> Share</button>';
  html += '<button onclick="BeDrive.renameFile(\'' + f.id + '\',\'' + name.replace(/'/g,"\\'") + '\')" class="flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"><i class="fas fa-pencil-alt text-gray-500"></i> Rename</button>';
  html += '<button onclick="BeDrive.toggleStar(\'' + f.id + '\',' + f.is_starred + ')" class="flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"><i class="fas fa-star ' + (f.is_starred ? 'text-yellow-400' : 'text-gray-400') + '"></i> ' + (f.is_starred ? 'Unstar' : 'Star') + '</button>';
  html += '<button onclick="BeDrive.trashFile(\'' + f.id + '\')" class="flex items-center justify-center gap-2 w-full border border-red-200 text-red-600 py-2.5 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors"><i class="fas fa-trash-alt"></i> Move to Trash</button>';
  html += '</div>';
  return html;
}

function folderDetailHTML(f) {
  const name = escHtml(f.name);
  let html = '<div class="text-center mb-5"><svg width="64" height="64" viewBox="0 0 56 56" class="mx-auto"><path d="M8 16a4 4 0 014-4h10l4 5h18a4 4 0 014 4v19a4 4 0 01-4 4H12a4 4 0 01-4-4V16z" fill="#fbbf24"/><path d="M8 21h40v19a4 4 0 01-4 4H12a4 4 0 01-4-4V21z" fill="#f59e0b"/></svg></div>';
  html += '<h3 class="font-semibold text-gray-800 text-sm mb-4">' + name + '</h3>';
  html += '<div class="space-y-3 text-xs mb-5">' + detailRow('Created', fmtDate(f.created_at)) + '</div>';
  html += '<div class="space-y-2">';
  html += '<button onclick="BeDrive.openFolder(\'' + f.id + '\',\'' + name.replace(/'/g,"\\'") + '\')" class="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"><i class="fas fa-folder-open"></i> Open</button>';
  html += '<button onclick="BeDrive.renameFolder(\'' + f.id + '\',\'' + name.replace(/'/g,"\\'") + '\')" class="flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"><i class="fas fa-pencil-alt text-gray-500"></i> Rename</button>';
  html += '<button onclick="BeDrive.trashFolder(\'' + f.id + '\')" class="flex items-center justify-center gap-2 w-full border border-red-200 text-red-600 py-2.5 rounded-lg hover:bg-red-50 text-sm font-medium transition-colors"><i class="fas fa-trash-alt"></i> Move to Trash</button>';
  html += '</div>';
  return html;
}

function detailRow(label, value) {
  return '<div class="flex justify-between"><span class="text-gray-400">' + label + '</span><span class="text-gray-700 font-medium max-w-[160px] truncate text-right">' + value + '</span></div>';
}

// ─── Upload ───────────────────────────────────────────────
function showUploadModal() {
  state.uploadFiles = [];
  document.getElementById('upload-queue').innerHTML = '';
  document.getElementById('file-input').value = '';
  document.getElementById('upload-modal').classList.remove('hidden');
}

function closeUploadModal() {
  document.getElementById('upload-modal').classList.add('hidden');
  state.uploadFiles = [];
}

function handleFileSelect(fileList) {
  state.uploadFiles = Array.from(fileList);
  const queue = document.getElementById('upload-queue');
  queue.innerHTML = state.uploadFiles.map(function(f, i) {
    return '<div class="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg" id="uitem-' + i + '">'
      + '<i class="fas fa-file text-gray-400 text-sm w-4 flex-shrink-0" id="uicon-' + i + '"></i>'
      + '<span class="flex-1 text-sm text-gray-700 truncate">' + escHtml(f.name) + '</span>'
      + '<span class="text-xs text-gray-400 flex-shrink-0">' + fmtSize(f.size) + '</span>'
      + '<div class="w-16 h-1 bg-gray-200 rounded-full overflow-hidden hidden" id="upbar-' + i + '"><div class="h-full bg-blue-500 rounded-full transition-all" id="upfill-' + i + '" style="width:0%"></div></div>'
      + '</div>';
  }).join('');
}

async function startUpload() {
  if (!state.uploadFiles.length) { toast('No files selected', 'error'); return; }
  const btn = document.getElementById('upload-btn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Uploading...';
  btn.disabled = true;

  let ok = 0, fail = 0;
  for (let i = 0; i < state.uploadFiles.length; i++) {
    const file = state.uploadFiles[i];
    const bar  = document.getElementById('upbar-' + i);
    const fill = document.getElementById('upfill-' + i);
    const icon = document.getElementById('uicon-' + i);
    if (bar) bar.classList.remove('hidden');

    try {
      await new Promise(function(resolve, reject) {
        const fd = new FormData();
        fd.append('file', file);
        if (state.currentFolder) fd.append('folder_id', state.currentFolder);

        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = function(e) {
          if (e.lengthComputable && fill) fill.style.width = Math.round(e.loaded / e.total * 100) + '%';
        };
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(xhr.statusText));
        };
        xhr.onerror = function() { reject(new Error('Network error')); };
        xhr.open('POST', '/api/files/upload');
        xhr.setRequestHeader('Authorization', 'Bearer ' + getToken());
        xhr.send(fd);
      });
      if (icon) { icon.className = 'fas fa-check text-green-500 text-sm w-4 flex-shrink-0'; }
      if (fill) fill.style.width = '100%';
      ok++;
    } catch(e) {
      if (icon) { icon.className = 'fas fa-times text-red-500 text-sm w-4 flex-shrink-0'; }
      fail++;
    }
  }

  btn.innerHTML = '<i class="fas fa-upload mr-2"></i>Upload';
  btn.disabled = false;

  setTimeout(function() {
    closeUploadModal();
    toast(ok + ' file(s) uploaded' + (fail ? ', ' + fail + ' failed' : ''), fail ? 'error' : 'success');
    loadFiles();
  }, 600);
}

// ─── Drag & Drop on main area ─────────────────────────────
function initDragDrop() {
  const pc = document.getElementById('page-content');
  if (!pc) return;
  pc.ondragover = function(e) {
    e.preventDefault();
    if (document.getElementById('upload-modal').classList.contains('hidden')) showUploadModal();
  };

  const dz = document.getElementById('drop-zone');
  if (!dz) return;
  dz.ondragover  = function(e) { e.preventDefault(); dz.classList.add('drag-over'); };
  dz.ondragleave = function()  { dz.classList.remove('drag-over'); };
  dz.ondrop      = function(e) { e.preventDefault(); dz.classList.remove('drag-over'); handleFileSelect(e.dataTransfer.files); };
}

// ─── Folder modal ─────────────────────────────────────────
function showFolderModal() {
  document.getElementById('folder-name-input').value = '';
  document.getElementById('folder-modal').classList.remove('hidden');
  setTimeout(function() { document.getElementById('folder-name-input').focus(); }, 50);
}
function closeFolderModal() {
  document.getElementById('folder-modal').classList.add('hidden');
}
async function createFolder() {
  const name = document.getElementById('folder-name-input').value.trim();
  if (!name) return;
  try {
    const res = await fetch('/api/folders', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name, parent_id: state.currentFolder || null })
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Failed', 'error'); return; }
    closeFolderModal();
    toast('Folder "' + name + '" created', 'success');
    loadFiles();
  } catch(e) { toast('Network error', 'error'); }
}

// ─── Rename modal ─────────────────────────────────────────
function renameFile(id, currentName) {
  state.renameTarget = { type: 'file', id };
  document.getElementById('rename-input').value = currentName;
  document.getElementById('rename-modal').classList.remove('hidden');
  setTimeout(function() { const inp = document.getElementById('rename-input'); inp.focus(); inp.select(); }, 50);
}
function renameFolder(id, currentName) {
  state.renameTarget = { type: 'folder', id };
  document.getElementById('rename-input').value = currentName;
  document.getElementById('rename-modal').classList.remove('hidden');
  setTimeout(function() { const inp = document.getElementById('rename-input'); inp.focus(); inp.select(); }, 50);
}
function closeRenameModal() {
  document.getElementById('rename-modal').classList.add('hidden');
}
async function confirmRename() {
  const newName = document.getElementById('rename-input').value.trim();
  if (!newName || !state.renameTarget) return;
  const { type, id } = state.renameTarget;
  const url  = '/api/' + (type === 'file' ? 'files' : 'folders') + '/' + id;
  const body = type === 'file' ? { file_name: newName } : { name: newName };
  try {
    const res = await fetch(url, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) });
    if (!res.ok) { toast('Rename failed', 'error'); return; }
    closeRenameModal();
    closeDetail();
    toast('Renamed to "' + newName + '"', 'success');
    loadFiles();
  } catch(e) { toast('Network error', 'error'); }
}

// ─── Star ─────────────────────────────────────────────────
async function toggleStar(id, currentStar) {
  try {
    const res = await fetch('/api/files/' + id, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ is_starred: !currentStar }) });
    if (!res.ok) return;
    toast(!currentStar ? 'Added to Starred' : 'Removed from Starred', 'success');
    closeDetail();
    loadFiles();
  } catch(e) {}
}

// ─── Trash ────────────────────────────────────────────────
async function trashFile(id) {
  if (!confirm('Move this file to trash?')) return;
  try {
    const res = await fetch('/api/files/' + id, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) { toast('Failed to delete', 'error'); return; }
    toast('Moved to trash', 'success');
    closeDetail();
    loadFiles();
  } catch(e) { toast('Network error', 'error'); }
}
async function trashFolder(id) {
  if (!confirm('Move this folder to trash?')) return;
  try {
    const res = await fetch('/api/folders/' + id, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) { toast('Failed to delete', 'error'); return; }
    toast('Folder moved to trash', 'success');
    closeDetail();
    loadFiles();
  } catch(e) { toast('Network error', 'error'); }
}
async function restoreFile(id) {
  try {
    await fetch('/api/files/' + id + '/restore', { method: 'POST', headers: authHeaders() });
    toast('File restored', 'success');
    loadTrash();
  } catch(e) {}
}
async function permanentDelete(id) {
  if (!confirm('Permanently delete? This cannot be undone.')) return;
  try {
    await fetch('/api/files/' + id + '?permanent=true', { method: 'DELETE', headers: authHeaders() });
    toast('Permanently deleted', 'success');
    loadTrash();
  } catch(e) {}
}
async function emptyTrash() {
  if (!confirm('Empty all trash? This cannot be undone.')) return;
  try {
    const res = await fetch('/api/files/trash/list', { headers: authHeaders() });
    const data = await res.json();
    await Promise.all((data.files || []).map(function(f) {
      return fetch('/api/files/' + f.id + '?permanent=true', { method: 'DELETE', headers: authHeaders() });
    }));
    toast('Trash emptied', 'success');
    loadTrash();
  } catch(e) {}
}

// ─── Share modal ──────────────────────────────────────────
function shareFile(id) {
  state.shareTarget = { file_id: id };
  document.getElementById('share-link-area').classList.add('hidden');
  document.getElementById('share-password').value = '';
  document.getElementById('share-allow-download').checked = true;
  document.getElementById('share-modal').classList.remove('hidden');
}
function closeShareModal() {
  document.getElementById('share-modal').classList.add('hidden');
}
async function createShare() {
  if (!state.shareTarget) return;
  const password     = document.getElementById('share-password').value;
  const allowDl      = document.getElementById('share-allow-download').checked;
  try {
    const res = await fetch('/api/shares', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ ...state.shareTarget, password: password || null, allow_download: allowDl })
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Failed', 'error'); return; }
    document.getElementById('share-link-input').value = data.share_url;
    document.getElementById('share-link-area').classList.remove('hidden');
    toast('Share link created!', 'success');
  } catch(e) { toast('Network error', 'error'); }
}
async function copyShareLink() {
  const link = document.getElementById('share-link-input').value;
  try { await navigator.clipboard.writeText(link); }
  catch(e) { document.getElementById('share-link-input').select(); document.execCommand('copy'); }
  toast('Link copied!', 'success');
}

// ─── Context menu ─────────────────────────────────────────
function ctxFile(e, id) {
  e.preventDefault();
  const f = state.files.find(function(x) { return x.id === id; });
  if (!f) return;
  const items = [
    { icon: 'fa-download',   label: 'Download', action: 'window.open("' + f.url + '","_blank")' },
    { icon: 'fa-share-alt',  label: 'Share',    action: 'BeDrive.shareFile("' + id + '")' },
    { icon: 'fa-pencil-alt', label: 'Rename',   action: 'BeDrive.renameFile("' + id + '","' + f.file_name.replace(/"/g,'\\"') + '")' },
    { icon: 'fa-star',       label: f.is_starred ? 'Unstar' : 'Star', action: 'BeDrive.toggleStar("' + id + '",' + f.is_starred + ')' },
    { divider: true },
    { icon: 'fa-trash-alt',  label: 'Move to Trash', action: 'BeDrive.trashFile("' + id + '")', danger: true }
  ];
  showContextMenu(e, items);
}
function ctxFolder(e, id, name) {
  e.preventDefault();
  const items = [
    { icon: 'fa-folder-open', label: 'Open',   action: 'BeDrive.openFolder("' + id + '","' + name.replace(/"/g,'\\"') + '")' },
    { icon: 'fa-pencil-alt',  label: 'Rename', action: 'BeDrive.renameFolder("' + id + '","' + name.replace(/"/g,'\\"') + '")' },
    { divider: true },
    { icon: 'fa-trash-alt',   label: 'Move to Trash', action: 'BeDrive.trashFolder("' + id + '")', danger: true }
  ];
  showContextMenu(e, items);
}
function showContextMenu(e, items) {
  closeContextMenus();
  const menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'fixed bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 z-50 min-w-44';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
  menu.style.top  = Math.min(e.clientY, window.innerHeight - 200) + 'px';
  items.forEach(function(item) {
    if (item.divider) {
      menu.innerHTML += '<hr class="my-1 border-gray-100">';
    } else {
      menu.innerHTML += '<div class="flex items-center gap-2.5 px-4 py-2 text-sm cursor-pointer rounded-lg mx-1 ' + (item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100') + '" onclick="' + item.action + ';closeContextMenus()"><i class="fas ' + item.icon + ' w-4 text-center ' + (item.danger ? '' : 'text-gray-400') + '"></i>' + item.label + '</div>';
    }
  });
  document.body.appendChild(menu);
  setTimeout(function() { document.addEventListener('click', closeContextMenus, { once: true }); }, 10);
}
function closeContextMenus() {
  const m = document.getElementById('ctx-menu');
  if (m) m.remove();
}

// ─── Special pages ────────────────────────────────────────
async function loadShared() {
  showLoading();
  try {
    const res  = await fetch('/api/shares/shared-with-me', { headers: authHeaders() });
    const data = await res.json();
    const items = data.shared || [];
    const pc = document.getElementById('page-content');
    if (!items.length) { pc.innerHTML = emptyPage('fa-users', 'Nothing shared with you', 'Files shared by others will appear here'); return; }
    let html = '<div class="grid gap-3" style="grid-template-columns:repeat(auto-fill,minmax(155px,1fr))">';
    items.forEach(function(s) {
      const f = s.files; if (!f) return;
      const { icon, color } = fileIcon(f.mime_type);
      html += '<div class="file-card"><div class="file-thumb"><i class="fas ' + icon + ' ' + color + ' text-4xl"></i></div>'
        + '<div class="p-2.5"><p class="text-xs font-medium text-gray-800 truncate">' + escHtml(f.file_name) + '</p>'
        + '<p class="text-xs text-gray-400">By ' + escHtml((s.profiles && s.profiles.name) || 'Unknown') + '</p></div></div>';
    });
    html += '</div>';
    pc.innerHTML = html;
  } catch(e) { showError('Failed to load'); }
}

async function loadRecent() {
  showLoading();
  try {
    const res  = await fetch('/api/files/recent/list', { headers: authHeaders() });
    const data = await res.json();
    renderSimpleList(data.files || [], 'fa-clock', 'No recent files', 'Files you access will appear here');
  } catch(e) { showError('Failed to load'); }
}

async function loadStarred() {
  showLoading();
  try {
    const res  = await fetch('/api/files/starred/list', { headers: authHeaders() });
    const data = await res.json();
    renderSimpleList(data.files || [], 'fa-star', 'No starred files', 'Star files to find them quickly');
  } catch(e) { showError('Failed to load'); }
}

async function loadTrash() {
  showLoading();
  try {
    const res  = await fetch('/api/files/trash/list', { headers: authHeaders() });
    const data = await res.json();
    const trashed = data.files || [];
    const pc = document.getElementById('page-content');

    if (!trashed.length) { pc.innerHTML = emptyPage('fa-trash-alt', 'Trash is empty', 'Deleted files will appear here'); return; }

    let html = '<div class="flex items-center justify-between mb-4">'
      + '<p class="text-sm text-gray-500">' + trashed.length + ' item(s) in trash</p>'
      + '<button onclick="BeDrive.emptyTrash()" class="text-sm text-red-600 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 flex items-center gap-1.5"><i class="fas fa-trash"></i> Empty Trash</button>'
      + '</div>';
    html += '<div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"><table class="w-full text-sm">';
    html += '<thead class="bg-gray-50 border-b"><tr><th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th><th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Size</th><th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Deleted</th><th class="px-4 py-3"></th></tr></thead>';
    html += '<tbody class="divide-y divide-gray-100">';
    trashed.forEach(function(f) {
      const { icon, color } = fileIcon(f.mime_type);
      html += '<tr class="hover:bg-gray-50">'
        + '<td class="px-4 py-3"><div class="flex items-center gap-3"><i class="fas ' + icon + ' ' + color + ' text-base w-5 text-center"></i><span class="font-medium text-gray-800 truncate max-w-xs">' + escHtml(f.file_name) + '</span></div></td>'
        + '<td class="px-4 py-3 text-gray-400 hidden md:table-cell">' + fmtSize(f.file_size) + '</td>'
        + '<td class="px-4 py-3 text-gray-400 hidden md:table-cell">' + fmtDate(f.trashed_at) + '</td>'
        + '<td class="px-4 py-3"><div class="flex gap-2 justify-end">'
        + '<button onclick="BeDrive.restoreFile(\'' + f.id + '\')" class="text-xs text-blue-600 border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-50">Restore</button>'
        + '<button onclick="BeDrive.permanentDelete(\'' + f.id + '\')" class="text-xs text-red-600 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50">Delete</button>'
        + '</div></td></tr>';
    });
    html += '</tbody></table></div>';
    pc.innerHTML = html;
  } catch(e) { showError('Failed to load trash'); }
}

function renderSimpleList(files, emptyIcon, emptyTitle, emptyDesc) {
  const pc = document.getElementById('page-content');
  if (!files.length) { pc.innerHTML = emptyPage(emptyIcon, emptyTitle, emptyDesc); return; }
  if (state.view === 'grid') {
    let html = '<div class="grid gap-3" style="grid-template-columns:repeat(auto-fill,minmax(155px,1fr))">';
    files.forEach(function(f) { html += fileCard(f); });
    html += '</div>';
    pc.innerHTML = html;
  } else {
    state.files = files; state.folders = [];
    pc.innerHTML = listView([], files);
  }
}

// ─── Analytics ────────────────────────────────────────────
async function loadAnalytics() {
  showLoading();
  try {
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    const to   = new Date().toISOString();
    const res  = await fetch('/api/admin/analytics?from=' + from + '&to=' + to, { headers: authHeaders() });
    if (!res.ok) { showError('Admin access required'); return; }
    const data = await res.json();
    renderAnalytics(data);
  } catch(e) { showError('Failed to load analytics'); }
}

function renderAnalytics(data) {
  const sum = data.summary || {};
  const pc  = document.getElementById('page-content');
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  pc.innerHTML = '<div class="flex items-center justify-between mb-6">'
    + '<h2 class="text-xl font-semibold text-gray-800 flex items-center gap-2"><i class="far fa-chart-bar text-blue-500"></i> Visitors report</h2>'
    + '<span class="text-sm text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-lg">' + dateStr + '</span>'
    + '</div>'
    + '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">'
    + statCard('New files', sum.new_files || 0)
    + statCard('New folders', sum.new_folders || 0)
    + statCard('New users', sum.new_users || 0)
    + statCard('Total Space Used', fmtSize(sum.total_space_used || 0))
    + '</div>'
    + '<div class="grid lg:grid-cols-2 gap-6 mb-6">'
    + '<div class="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"><div class="flex justify-between items-center mb-4"><h3 class="font-semibold text-gray-700">Pageviews</h3><span class="text-sm text-gray-400">' + (data.total_views || 0).toLocaleString() + ' total views</span></div><canvas id="chart-pv" height="180"></canvas></div>'
    + '<div class="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"><h3 class="font-semibold text-gray-700 mb-4">Top devices</h3><canvas id="chart-dev" height="180"></canvas><div class="flex justify-center gap-5 mt-3 text-xs text-gray-500"><span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-blue-300 inline-block"></span>Mobile</span><span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-red-300 inline-block"></span>Tablet</span><span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-yellow-400 inline-block"></span>Desktop</span></div></div>'
    + '</div>';

  setTimeout(function() {
    const pvDates  = (data.page_views || []).map(function(p) { return p.date; });
    const pvCounts = (data.page_views || []).map(function(p) { return p.count; });
    const dummy    = [450, 280, 490, 310, 210, 430, 390];
    if (typeof Chart !== 'undefined') {
      new Chart(document.getElementById('chart-pv'), {
        type: 'line',
        data: {
          labels: pvDates.length ? pvDates : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
          datasets: [
            { label: 'Current',  data: pvCounts.length ? pvCounts : dummy, borderColor: '#93c5fd', backgroundColor: 'rgba(147,197,253,0.15)', fill: true, tension: 0.4 },
            { label: 'Previous', data: dummy.map(function(v) { return Math.max(0, v - Math.floor(Math.random() * 100)); }), borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.1)', fill: true, tension: 0.4 }
          ]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
      });
      const devs = data.devices || { mobile: 45, tablet: 30, desktop: 25 };
      new Chart(document.getElementById('chart-dev'), {
        type: 'polarArea',
        data: { labels: ['Mobile','Tablet','Desktop'], datasets: [{ data: [devs.mobile || 30, devs.tablet || 20, devs.desktop || 10], backgroundColor: ['rgba(147,197,253,0.7)','rgba(252,165,165,0.7)','rgba(251,191,36,0.7)'] }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }
  }, 100);
}

function statCard(label, value) {
  return '<div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"><p class="text-xs text-gray-500 mb-1">' + label + '</p><div class="flex items-baseline gap-2"><span class="text-2xl font-bold text-gray-800">' + value + '</span><span class="text-xs text-green-600 flex items-center gap-0.5"><i class="fas fa-arrow-up text-xs"></i>100%</span></div></div>';
}

// ─── Admin Users (old simple view - kept for nav-admin-users) ──
async function loadAdminUsers() {
  // Redirect to full settings → users tab
  loadSettings('users');
}

async function loadAdminLogs() {
  showLoading();
  try {
    const res  = await fetch('/api/admin/logs', { headers: authHeaders() });
    if (!res.ok) { showError('Admin access required'); return; }
    const data = await res.json();
    const logs = data.logs || [];
    const iconMap = { upload: 'fa-upload text-green-500', download: 'fa-download text-blue-500', delete: 'fa-trash text-red-500', share: 'fa-share text-purple-500', login: 'fa-sign-in-alt text-yellow-500', create_folder: 'fa-folder-plus text-yellow-400' };
    let html = '<div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"><table class="w-full text-sm">';
    html += '<thead class="bg-gray-50 border-b"><tr><th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th><th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">User</th><th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">IP</th><th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Time</th></tr></thead>';
    html += '<tbody class="divide-y divide-gray-100">';
    if (!logs.length) html += '<tr><td colspan="4" class="px-4 py-10 text-center text-gray-400">No logs yet</td></tr>';
    logs.forEach(function(l) {
      const ic = iconMap[l.action] || 'fa-circle text-gray-400';
      html += '<tr class="hover:bg-gray-50"><td class="px-4 py-3"><div class="flex items-center gap-2"><i class="fas ' + ic + ' text-sm w-4 text-center"></i><span class="capitalize">' + l.action + '</span></div></td><td class="px-4 py-3 text-gray-600">' + escHtml((l.profiles && (l.profiles.name || l.profiles.email)) || '—') + '</td><td class="px-4 py-3 text-gray-400 hidden md:table-cell">' + (l.ip || '—') + '</td><td class="px-4 py-3 text-gray-400">' + fmtDate(l.created_at) + '</td></tr>';
    });
    html += '</tbody></table></div>';
    document.getElementById('page-content').innerHTML = html;
  } catch(e) { showError('Failed to load logs'); }
}

// ─── Settings Page ───────────────────────────────────────

async function loadSettings(tab) {
  state.currentPage = 'settings';
  state.settingsTab = tab || state.settingsTab || 'users';
  showLoading();
  const pc = document.getElementById('page-content');

  // Outer layout: left tabs + right panel
  pc.innerHTML = `
  <div class="flex gap-0 min-h-[600px]">
    <!-- Tab sidebar -->
    <div class="w-52 flex-shrink-0 bg-white border border-gray-200 rounded-l-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-100">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Settings</p>
      </div>
      <nav class="py-2">
        <div id="stab-users"    class="settings-tab nav-item ${state.settingsTab==='users'       ? 'active':''}" onclick="BeDrive.settingsTab('users')"><i class="fas fa-users text-blue-400"></i> Users</div>
        <div id="stab-new-user" class="settings-tab nav-item ${state.settingsTab==='new-user'    ? 'active':''}" onclick="BeDrive.settingsTab('new-user')"><i class="fas fa-user-plus text-green-500"></i> Add User</div>
        <div id="stab-pending"  class="settings-tab nav-item ${state.settingsTab==='pending'     ? 'active':''}" onclick="BeDrive.settingsTab('pending')"><i class="fas fa-user-clock text-orange-500"></i> Pending <span id="pending-count-badge" class="ml-1 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 hidden">0</span></div>
        <div id="stab-app"      class="settings-tab nav-item ${state.settingsTab==='app'         ? 'active':''}" onclick="BeDrive.settingsTab('app')"><i class="fas fa-sliders-h text-indigo-500"></i> App Settings</div>
        <div id="stab-config"   class="settings-tab nav-item ${state.settingsTab==='config'      ? 'active':''}" onclick="BeDrive.settingsTab('config')"><i class="fas fa-plug text-purple-500"></i> Connection</div>
        <div id="stab-mypass"   class="settings-tab nav-item ${state.settingsTab==='mypass'      ? 'active':''}" onclick="BeDrive.settingsTab('mypass')"><i class="fas fa-key text-yellow-500"></i> My Password</div>
      </nav>
    </div>
    <!-- Content panel -->
    <div id="settings-panel" class="flex-1 bg-white border border-gray-200 border-l-0 rounded-r-xl p-6 overflow-auto"></div>
  </div>`;

  renderSettingsTab(state.settingsTab);
  // Load pending count badge
  loadPendingCount();
}

function settingsTabSwitch(tab) {
  state.settingsTab = tab;
  document.querySelectorAll('.settings-tab').forEach(function(el) { el.classList.remove('active'); });
  const active = document.getElementById('stab-' + tab);
  if (active) active.classList.add('active');
  renderSettingsTab(tab);
}

async function loadPendingCount() {
  try {
    const res = await fetch('/api/settings/pending-users', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const cnt = data.total || 0;
    const badge = document.getElementById('pending-count-badge');
    if (badge) {
      badge.textContent = cnt;
      if (cnt > 0) badge.classList.remove('hidden');
      else badge.classList.add('hidden');
    }
  } catch(_e) {}
}

async function renderSettingsTab(tab) {
  const panel = document.getElementById('settings-panel');
  if (!panel) return;

  if (tab === 'users') {
    panel.innerHTML = '<div class="flex items-center justify-between mb-4">'
      + '<h2 class="text-lg font-semibold text-gray-800">User Management</h2>'
      + '<div class="flex gap-2">'
      + '<div class="relative"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>'
      + '<input id="settings-search" type="text" placeholder="Search users…" value="' + escHtml(state.settingsSearch) + '"'
      + ' class="pl-8 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"'
      + ' oninput="BeDrive.settingsSearchUsers(this.value)"></div>'
      + '<button onclick="BeDrive.settingsTab(\'new-user\')" class="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"><i class="fas fa-plus"></i> Add User</button>'
      + '</div></div>'
      + '<div id="users-table-wrap"><div class="text-center py-10"><i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i></div></div>';
    await fetchSettingsUsers();
    return;
  }

  if (tab === 'new-user') {
    panel.innerHTML = '<h2 class="text-lg font-semibold text-gray-800 mb-5">Create New User</h2>'
      + '<div class="max-w-lg space-y-4">'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>'
      + '<input id="nu-name" type="text" placeholder="John Doe" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Email <span class="text-red-500">*</span></label>'
      + '<input id="nu-email" type="email" placeholder="user@example.com" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Password <span class="text-red-500">*</span></label>'
      + '<input id="nu-password" type="password" placeholder="Min 6 characters" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Role</label>'
      + '<select id="nu-role" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">'
      + '<option value="user">User</option><option value="admin">Admin</option></select></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Storage Quota (GB)</label>'
      + '<input id="nu-quota" type="number" value="5" min="1" max="1000" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>'
      + '<div id="nu-msg" class="hidden"></div>'
      + '<div class="flex gap-3 pt-2">'
      + '<button onclick="BeDrive.settingsTab(\'users\')" class="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>'
      + '<button onclick="BeDrive.settingsCreateUser()" class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"><i class="fas fa-user-plus"></i> Create User</button>'
      + '</div></div>';
    return;
  }

  if (tab === 'pending') {
    panel.innerHTML = '<div class="flex items-center justify-between mb-4">'
      + '<div><h2 class="text-lg font-semibold text-gray-800">Pending Approvals</h2>'
      + '<p class="text-sm text-gray-400 mt-0.5">Users who registered and are awaiting admin approval</p></div>'
      + '</div>'
      + '<div id="pending-table-wrap"><div class="text-center py-10"><i class="fas fa-spinner fa-spin text-orange-500 text-2xl"></i></div></div>';
    await fetchPendingUsers();
    return;
  }

  if (tab === 'app') {
    panel.innerHTML = '<h2 class="text-lg font-semibold text-gray-800 mb-1">App Settings</h2>'
      + '<p class="text-sm text-gray-400 mb-5">Control registration and account approval behaviour</p>'
      + '<div id="app-settings-loading" class="text-center py-10"><i class="fas fa-spinner fa-spin text-indigo-500 text-2xl"></i></div>'
      + '<div id="app-settings-form" class="hidden max-w-lg space-y-5"></div>';
    try {
      const res  = await fetch('/api/settings/app-settings', { headers: authHeaders() });
      const data = await res.json();
      document.getElementById('app-settings-loading').classList.add('hidden');
      const form = document.getElementById('app-settings-form');
      form.classList.remove('hidden');
      form.innerHTML =
        '<div class="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between">'
        + '<div><p class="font-medium text-gray-800">Allow Sign Up</p>'
        + '<p class="text-sm text-gray-400 mt-0.5">When OFF, the registration page is disabled and new users cannot sign up.</p></div>'
        + '<label class="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">'
        + '<input type="checkbox" id="toggle-signup" ' + (data.signup_enabled ? 'checked' : '') + ' onchange="BeDrive.settingsToggle(\'signup_enabled\', this.checked)" class="sr-only peer">'
        + '<div class="w-11 h-6 bg-gray-300 peer-checked:bg-blue-600 rounded-full transition-colors duration-200 after:content-[\'\'] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>'
        + '</label></div>'

        + '<div class="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between">'
        + '<div><p class="font-medium text-gray-800">Require Admin Approval</p>'
        + '<p class="text-sm text-gray-400 mt-0.5">When ON, new registrations are set to <em>pending</em> and must be approved by an admin before the user can log in.</p></div>'
        + '<label class="relative inline-flex items-center cursor-pointer ml-4 flex-shrink-0">'
        + '<input type="checkbox" id="toggle-approval" ' + (data.approval_required ? 'checked' : '') + ' onchange="BeDrive.settingsToggle(\'approval_required\', this.checked)" class="sr-only peer">'
        + '<div class="w-11 h-6 bg-gray-300 peer-checked:bg-indigo-600 rounded-full transition-colors duration-200 after:content-[\'\'] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>'
        + '</label></div>'

        + '<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">'
        + '<i class="fas fa-info-circle mr-1"></i> When <strong>Require Admin Approval</strong> is enabled, go to the <strong>Pending</strong> tab to approve or reject new registrations.'
        + '</div>';
    } catch(_e) {
      document.getElementById('app-settings-loading').innerHTML = '<p class="text-red-500 text-sm">Failed to load app settings</p>';
    }
    return;
  }

  if (tab === 'config') {
    panel.innerHTML = '<h2 class="text-lg font-semibold text-gray-800 mb-5">Connection Configuration</h2>'
      + '<div id="config-loading" class="text-center py-10"><i class="fas fa-spinner fa-spin text-blue-500 text-2xl"></i></div>'
      + '<div id="config-form" class="hidden max-w-lg space-y-4"></div>';
    try {
      const res  = await fetch('/api/settings/config', { headers: authHeaders() });
      const data = await res.json();
      document.getElementById('config-loading').classList.add('hidden');
      const form = document.getElementById('config-form');
      form.classList.remove('hidden');
      form.innerHTML = configField('Supabase URL', 'cfg-url', 'https://xxx.supabase.co', data.supabase_url || '', 'text', 'URL of your Supabase project')
        + configField('CDN URL', 'cfg-cdn', 'https://cdn.example.com', data.cdn_url || '', 'text', 'CDN base URL for file delivery')
        + configField('App URL', 'cfg-app', 'https://bedrive.example.com', data.app_url || '', 'text', 'Public URL of this app')
        + '<div class="grid grid-cols-2 gap-4">'
        + configField('Free Quota (GB)', 'cfg-quota', '5', String(data.free_quota_gb || 5), 'number', 'Default storage per user')
        + configField('Max File Size (MB)', 'cfg-maxfile', '100', String(data.max_file_size_mb || 100), 'number', 'Max upload size')
        + '</div>'
        + '<div class="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">'
        + '<p class="font-medium text-gray-700 mb-1"><i class="fas fa-info-circle text-blue-500 mr-1"></i> Note</p>'
        + '<p>To update Supabase keys or add a new R2 bucket, edit <code class="bg-white border border-gray-200 rounded px-1">.dev.vars</code> (dev) or Cloudflare Pages environment variables (production).</p>'
        + '</div>'
        + '<div class="flex gap-3 pt-2">'
        + '<button onclick="BeDrive.settingsSaveConfig()" class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"><i class="fas fa-save"></i> Save Configuration</button>'
        + '</div>';
    } catch(e) {
      document.getElementById('config-loading').innerHTML = '<p class="text-red-500 text-sm">Failed to load configuration</p>';
    }
    return;
  }

  if (tab === 'mypass') {
    panel.innerHTML = '<h2 class="text-lg font-semibold text-gray-800 mb-5">Change My Password</h2>'
      + '<div class="max-w-lg space-y-4">'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">New Password <span class="text-red-500">*</span></label>'
      + '<input id="mp-new" type="password" placeholder="Min 6 characters" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>'
      + '<div><label class="block text-sm font-medium text-gray-700 mb-1">Confirm Password <span class="text-red-500">*</span></label>'
      + '<input id="mp-confirm" type="password" placeholder="Repeat new password" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>'
      + '<div id="mp-msg" class="hidden"></div>'
      + '<button onclick="BeDrive.settingsChangeMyPassword()" class="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"><i class="fas fa-key"></i> Update Password</button>'
      + '</div>';
    return;
  }
}

function configField(label, id, placeholder, value, type, hint) {
  return '<div><label class="block text-sm font-medium text-gray-700 mb-1">' + label + '</label>'
    + '<input id="' + id + '" type="' + type + '" placeholder="' + placeholder + '" value="' + escHtml(value) + '"'
    + ' class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">'
    + (hint ? '<p class="text-xs text-gray-400 mt-1">' + hint + '</p>' : '')
    + '</div>';
}

async function fetchSettingsUsers() {
  const wrap = document.getElementById('users-table-wrap');
  if (!wrap) return;
  try {
    const params = new URLSearchParams({ page: state.settingsPage, limit: 20 });
    if (state.settingsSearch) params.set('search', state.settingsSearch);
    const res  = await fetch('/api/settings/users?' + params, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { wrap.innerHTML = '<p class="text-red-500 text-sm p-4">' + escHtml(data.error || 'Error') + '</p>'; return; }
    state.settingsUsers = data.users || [];
    renderUsersTable(wrap, state.settingsUsers, data.total || 0);
  } catch(e) {
    wrap.innerHTML = '<p class="text-red-500 text-sm p-4">Failed to load users</p>';
  }
}

function renderUsersTable(wrap, users, total) {
  if (!users.length) {
    wrap.innerHTML = '<div class="text-center py-12"><i class="fas fa-users text-4xl text-gray-300 mb-3"></i><p class="text-gray-400">No users found</p></div>';
    return;
  }
  let html = '<div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">'
    + '<table class="w-full text-sm">'
    + '<thead class="bg-gray-50 border-b border-gray-200"><tr>'
    + '<th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>'
    + '<th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>'
    + '<th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Storage</th>'
    + '<th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Joined</th>'
    + '<th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>'
    + '</tr></thead><tbody class="divide-y divide-gray-100">';

  users.forEach(function(u) {
    const pct      = u.quota ? Math.min(100, Math.round((u.used_space || 0) / u.quota * 100)) : 0;
    const initial  = (u.name || u.email || 'U')[0].toUpperCase();
    const roleCls  = u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';
    const isSelf   = state.user && u.id === state.user.id;
    html += '<tr class="hover:bg-gray-50">'
      + '<td class="px-4 py-3"><div class="flex items-center gap-3">'
      + '<div class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">' + initial + '</div>'
      + '<div class="min-w-0"><p class="font-medium text-gray-800 truncate">' + escHtml(u.name || '—') + '</p>'
      + '<p class="text-xs text-gray-400 truncate">' + escHtml(u.email || '') + '</p></div>'
      + (isSelf ? '<span class="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">You</span>' : '')
      + '</div></td>'
      + '<td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full text-xs font-semibold ' + roleCls + '">' + (u.role || 'user') + '</span></td>'
      + '<td class="px-4 py-3 hidden md:table-cell">'
      + '<div class="text-xs text-gray-500 mb-1">' + fmtSize(u.used_space || 0) + ' / ' + fmtSize(u.quota || 0) + '</div>'
      + '<div class="h-1.5 bg-gray-200 rounded-full overflow-hidden w-28"><div class="h-full bg-blue-500 rounded-full" style="width:' + pct + '%"></div></div>'
      + '</td>'
      + '<td class="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">' + fmtDate(u.created_at) + '</td>'
      + '<td class="px-4 py-3">'
      + '<div class="flex gap-1 justify-end">'
      + '<button onclick="BeDrive.settingsEditUser(\'' + u.id + '\')" title="Edit" class="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"><i class="fas fa-edit text-sm"></i></button>'
      + '<button onclick="BeDrive.settingsChangePassword(\'' + u.id + '\',\'' + escHtml(u.name || u.email) + '\')" title="Change Password" class="p-1.5 rounded-lg text-yellow-600 hover:bg-yellow-50 transition-colors"><i class="fas fa-key text-sm"></i></button>'
      + (isSelf ? '' : '<button onclick="BeDrive.settingsDeleteUser(\'' + u.id + '\',\'' + escHtml(u.name || u.email) + '\')" title="Delete" class="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"><i class="fas fa-trash text-sm"></i></button>')
      + '</div>'
      + '</td></tr>';
  });

  html += '</tbody></table></div>';
  html += '<p class="text-xs text-gray-400 mt-2 text-right">' + total + ' user(s) total</p>';
  wrap.innerHTML = html;
}

async function fetchPendingUsers() {
  const wrap = document.getElementById('pending-table-wrap');
  if (!wrap) return;
  try {
    const res  = await fetch('/api/settings/pending-users', { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { wrap.innerHTML = '<p class="text-red-500 text-sm p-4">' + escHtml(data.error || 'Error') + '</p>'; return; }
    const users = data.users || [];
    if (!users.length) {
      wrap.innerHTML = '<div class="text-center py-12"><i class="fas fa-check-circle text-4xl text-green-400 mb-3"></i><p class="text-gray-500 font-medium">No pending approvals</p><p class="text-gray-400 text-sm mt-1">All registrations have been reviewed.</p></div>';
      return;
    }
    let html = '<div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">'
      + '<table class="w-full text-sm">'
      + '<thead class="bg-orange-50 border-b border-gray-200"><tr>'
      + '<th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>'
      + '<th class="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Registered</th>'
      + '<th class="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Action</th>'
      + '</tr></thead><tbody class="divide-y divide-gray-100">';
    users.forEach(function(u) {
      const initial = (u.name || u.email || 'U')[0].toUpperCase();
      html += '<tr class="hover:bg-gray-50">'
        + '<td class="px-4 py-3"><div class="flex items-center gap-3">'
        + '<div class="w-8 h-8 rounded-full bg-orange-400 text-white flex items-center justify-center text-sm font-bold">' + initial + '</div>'
        + '<div><p class="font-medium text-gray-800">' + escHtml(u.name || '—') + '</p><p class="text-xs text-gray-400">' + escHtml(u.email || '') + '</p></div>'
        + '</div></td>'
        + '<td class="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">' + fmtDate(u.created_at) + '</td>'
        + '<td class="px-4 py-3"><div class="flex gap-2 justify-end">'
        + '<button onclick="BeDrive.settingsApproveUser(\''+u.id+'\',\''+escHtml(u.name||u.email)+'\')" class="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700"><i class="fas fa-check"></i> Approve</button>'
        + '<button onclick="BeDrive.settingsRejectUser(\''+u.id+'\',\''+escHtml(u.name||u.email)+'\')" class="flex items-center gap-1.5 bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-200"><i class="fas fa-times"></i> Reject</button>'
        + '</div></td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<p class="text-xs text-gray-400 mt-2 text-right">' + users.length + ' pending user(s)</p>';
    wrap.innerHTML = html;
  } catch(_e) {
    wrap.innerHTML = '<p class="text-red-500 text-sm p-4">Failed to load pending users</p>';
  }
}

async function settingsApproveUser(userId, userName) {
  if (!confirm('Approve "' + userName + '"? They will be able to log in immediately.')) return;
  try {
    const res  = await fetch('/api/settings/users/' + userId + '/approve', { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Failed to approve user', 'error'); return; }
    toast(userName + ' approved!', 'success');
    fetchPendingUsers();
    loadPendingCount();
    refreshNotifBadge();
  } catch(_e) { toast('Network error', 'error'); }
}

async function settingsRejectUser(userId, userName) {
  if (!confirm('Reject and delete "' + userName + '"? This cannot be undone.')) return;
  try {
    const res  = await fetch('/api/settings/users/' + userId + '/reject', { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Failed to reject user', 'error'); return; }
    toast(userName + ' rejected and removed', 'success');
    fetchPendingUsers();
    loadPendingCount();
  } catch(_e) { toast('Network error', 'error'); }
}

async function settingsToggle(key, value) {
  try {
    const body = {};
    body[key] = value;
    const res  = await fetch('/api/settings/app-settings', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Failed to update setting', 'error'); return; }
    const label = key === 'signup_enabled' ? 'Sign Up' : 'Admin Approval';
    toast(label + ' ' + (value ? 'enabled' : 'disabled'), 'success');
  } catch(_e) { toast('Network error', 'error'); }
}

function settingsSearchUsers(val) {
  state.settingsSearch = val;
  state.settingsPage   = 1;
  clearTimeout(state.searchTimeout);
  state.searchTimeout  = setTimeout(fetchSettingsUsers, 400);
}

async function settingsCreateUser() {
  const email    = (document.getElementById('nu-email') || {}).value || '';
  const password = (document.getElementById('nu-password') || {}).value || '';
  const name     = (document.getElementById('nu-name') || {}).value || '';
  const role     = (document.getElementById('nu-role') || {}).value || 'user';
  const quotaGB  = parseFloat((document.getElementById('nu-quota') || {}).value || '5');
  const msgEl    = document.getElementById('nu-msg');

  if (!email || !password) { showSettingsMsg(msgEl, 'Email and password are required', 'error'); return; }
  if (password.length < 6) { showSettingsMsg(msgEl, 'Password must be at least 6 characters', 'error'); return; }

  showSettingsMsg(msgEl, '<i class="fas fa-spinner fa-spin mr-1"></i> Creating user…', 'info');

  try {
    const res  = await fetch('/api/settings/users', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ email, password, name, role, quota: Math.round(quotaGB * 1073741824) })
    });
    const data = await res.json();
    if (!res.ok) { showSettingsMsg(msgEl, data.error || 'Failed to create user', 'error'); return; }
    showSettingsMsg(msgEl, '<i class="fas fa-check mr-1"></i> User created successfully!', 'success');
    setTimeout(function() { settingsTabSwitch('users'); }, 1200);
  } catch(e) {
    showSettingsMsg(msgEl, 'Network error', 'error');
  }
}

async function settingsEditUser(userId) {
  const u = state.settingsUsers.find(function(x) { return x.id === userId; });
  if (!u) return;

  // Build edit modal
  showUserModal(
    'Edit User: ' + escHtml(u.name || u.email),
    `<div class="space-y-4">
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
      <input id="eu-name" type="text" value="${escHtml(u.name||'')}" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
      <input id="eu-email" type="email" value="${escHtml(u.email||'')}" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Role</label>
      <select id="eu-role" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="user" ${u.role==='user'?'selected':''}>User</option>
        <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
      </select></div>
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Storage Quota (GB)</label>
      <input id="eu-quota" type="number" value="${Math.round((u.quota||5368709120)/1073741824)}" min="1" max="1000" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
      <div id="eu-msg" class="hidden"></div>
    </div>`,
    function() {
      const name    = document.getElementById('eu-name').value.trim();
      const email   = document.getElementById('eu-email').value.trim();
      const role    = document.getElementById('eu-role').value;
      const quotaGB = parseFloat(document.getElementById('eu-quota').value || '5');
      const msgEl   = document.getElementById('eu-msg');

      showSettingsMsg(msgEl, '<i class="fas fa-spinner fa-spin mr-1"></i> Saving…', 'info');

      fetch('/api/settings/users/' + userId, {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({ name, email, role, quota: Math.round(quotaGB * 1073741824) })
      }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d }; }); })
      .then(function({ ok, d }) {
        if (!ok) { showSettingsMsg(msgEl, d.error || 'Failed', 'error'); return; }
        toast('User updated successfully', 'success');
        closeUserModal();
        fetchSettingsUsers();
      }).catch(function() { showSettingsMsg(msgEl, 'Network error', 'error'); });
    }
  );
}

function settingsChangePassword(userId, userName) {
  showUserModal(
    'Change Password: ' + escHtml(userName),
    `<div class="space-y-4">
      <div><label class="block text-sm font-medium text-gray-700 mb-1">New Password <span class="text-red-500">*</span></label>
      <input id="cp-new" type="password" placeholder="Min 6 characters" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
      <div><label class="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
      <input id="cp-confirm" type="password" placeholder="Repeat new password" class="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
      <div id="cp-msg" class="hidden"></div>
    </div>`,
    function() {
      const pw  = document.getElementById('cp-new').value;
      const pw2 = document.getElementById('cp-confirm').value;
      const msg = document.getElementById('cp-msg');
      if (!pw || pw.length < 6) { showSettingsMsg(msg, 'Password must be at least 6 characters', 'error'); return; }
      if (pw !== pw2)             { showSettingsMsg(msg, 'Passwords do not match', 'error'); return; }
      showSettingsMsg(msg, '<i class="fas fa-spinner fa-spin mr-1"></i> Updating…', 'info');
      fetch('/api/settings/users/' + userId + '/password', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ password: pw })
      }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d }; }); })
      .then(function({ ok, d }) {
        if (!ok) { showSettingsMsg(msg, d.error || 'Failed', 'error'); return; }
        toast('Password updated', 'success'); closeUserModal();
      }).catch(function() { showSettingsMsg(msg, 'Network error', 'error'); });
    }
  );
}

async function settingsDeleteUser(userId, userName) {
  if (!confirm('Delete user "' + userName + '"? This will permanently remove their account and all their data. This cannot be undone.')) return;
  try {
    const res  = await fetch('/api/settings/users/' + userId, { method: 'DELETE', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Failed to delete user', 'error'); return; }
    toast('User deleted', 'success');
    fetchSettingsUsers();
  } catch(e) { toast('Network error', 'error'); }
}

async function settingsSaveConfig() {
  const url    = (document.getElementById('cfg-url')     || {}).value || '';
  const cdn    = (document.getElementById('cfg-cdn')     || {}).value || '';
  const appUrl = (document.getElementById('cfg-app')     || {}).value || '';
  toast('Configuration is managed via environment variables. Update .dev.vars (dev) or Cloudflare Pages settings (prod).', 'success');
}

async function settingsChangeMyPassword() {
  const pw  = (document.getElementById('mp-new')     || {}).value || '';
  const pw2 = (document.getElementById('mp-confirm') || {}).value || '';
  const msg = document.getElementById('mp-msg');
  if (!pw || pw.length < 6) { showSettingsMsg(msg, 'Password must be at least 6 characters', 'error'); return; }
  if (pw !== pw2)             { showSettingsMsg(msg, 'Passwords do not match', 'error'); return; }
  showSettingsMsg(msg, '<i class="fas fa-spinner fa-spin mr-1"></i> Updating…', 'info');
  try {
    const res  = await fetch('/api/settings/me/password', {
      method: 'PATCH', headers: authHeaders(),
      body: JSON.stringify({ new_password: pw })
    });
    const data = await res.json();
    if (!res.ok) { showSettingsMsg(msg, data.error || 'Failed', 'error'); return; }
    showSettingsMsg(msg, '<i class="fas fa-check mr-1"></i> Password updated successfully!', 'success');
    document.getElementById('mp-new').value     = '';
    document.getElementById('mp-confirm').value = '';
  } catch(e) { showSettingsMsg(msg, 'Network error', 'error'); }
}

// ─── Shared modal for user edit/password ──────────────────
function showUserModal(title, bodyHtml, onSave) {
  closeUserModal();
  const overlay = document.createElement('div');
  overlay.id = 'user-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
  <div class="modal" style="max-width:480px">
    <div class="flex items-center justify-between mb-5">
      <h3 class="font-semibold text-gray-800 text-base">${title}</h3>
      <button onclick="BeDrive.closeUserModal()" class="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><i class="fas fa-times"></i></button>
    </div>
    <div id="user-modal-body">${bodyHtml}</div>
    <div class="flex gap-3 mt-5">
      <button onclick="BeDrive.closeUserModal()" class="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
      <button id="user-modal-save" class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2"><i class="fas fa-save"></i> Save</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('user-modal-save').onclick = onSave;
}

function closeUserModal() {
  const m = document.getElementById('user-modal');
  if (m) m.remove();
}

function showSettingsMsg(el, html, type) {
  if (!el) return;
  const cls = type === 'error'   ? 'bg-red-50 border border-red-200 text-red-700'
            : type === 'success' ? 'bg-green-50 border border-green-200 text-green-700'
            :                      'bg-blue-50 border border-blue-200 text-blue-700';
  el.className = cls + ' px-4 py-2.5 rounded-xl text-sm';
  el.innerHTML = html;
  el.classList.remove('hidden');
}

// ─── Notification System ─────────────────────────────────
function toggleNotifPanel() {
  state.notifOpen = !state.notifOpen;
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  if (state.notifOpen) {
    panel.classList.remove('hidden');
    fetchNotifications();
    // Close when clicking outside
    setTimeout(function() {
      document.addEventListener('click', closeNotifOnOutside, { once: true });
    }, 10);
  } else {
    panel.classList.add('hidden');
  }
}

function closeNotifOnOutside(e) {
  const wrapper = document.getElementById('notif-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    state.notifOpen = false;
    const panel = document.getElementById('notif-panel');
    if (panel) panel.classList.add('hidden');
  } else if (state.notifOpen) {
    // re-attach if click was inside
    setTimeout(function() {
      document.addEventListener('click', closeNotifOnOutside, { once: true });
    }, 10);
  }
}

async function fetchNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  // Only admins get notifications
  if (!state.user || state.user.role !== 'admin') {
    list.innerHTML = '<div class="p-6 text-center text-gray-400 text-sm">Notifications are for admins only</div>';
    return;
  }
  try {
    const res  = await fetch('/api/notifications?limit=20', { headers: authHeaders() });
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    state.notifList   = data.notifications || [];
    state.notifUnread = data.unread_count  || 0;
    renderNotifBadge();
    renderNotifList(list);
  } catch(_e) {
    if (list) list.innerHTML = '<div class="p-6 text-center text-gray-400 text-sm">Failed to load notifications</div>';
  }
}

async function refreshNotifBadge() {
  if (!state.user || state.user.role !== 'admin') return;
  try {
    const res  = await fetch('/api/notifications?limit=1&unread=true', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    state.notifUnread = data.unread_count || 0;
    renderNotifBadge();
  } catch(_e) {}
}

function renderNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (state.notifUnread > 0) {
    badge.textContent = state.notifUnread > 99 ? '99+' : String(state.notifUnread);
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderNotifList(list) {
  if (!list) return;
  if (!state.notifList.length) {
    list.innerHTML = '<div class="p-8 text-center"><i class="fas fa-bell-slash text-3xl text-gray-300 mb-3"></i><p class="text-gray-400 text-sm">No notifications yet</p></div>';
    return;
  }
  const icons = { register: 'fa-user-plus text-blue-500', upload: 'fa-upload text-green-500',
    login: 'fa-sign-in-alt text-indigo-500', share: 'fa-share-alt text-purple-500',
    delete: 'fa-trash text-red-500', approve: 'fa-check-circle text-green-600', default: 'fa-bell text-gray-400' };
  let html = '';
  state.notifList.forEach(function(n) {
    const ico   = icons[n.type] || icons.default;
    const unread = !n.is_read;
    const ago   = timeAgo(n.created_at);
    html += '<div class="flex gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 transition-colors ' + (unread ? 'bg-blue-50/40' : '') + '" onclick="BeDrive.markNotifRead(\''+n.id+'\')" data-notif-id="'+n.id+'">'
      + '<div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5"><i class="fas '+ico+' text-sm"></i></div>'
      + '<div class="flex-1 min-w-0">'
      + '<p class="text-sm font-medium text-gray-800 leading-snug">' + escHtml(n.title) + (unread ? ' <span class="inline-block w-2 h-2 bg-blue-500 rounded-full ml-1 align-middle"></span>' : '') + '</p>'
      + '<p class="text-xs text-gray-400 mt-0.5 leading-snug line-clamp-2">' + escHtml(n.message) + '</p>'
      + '<p class="text-xs text-gray-300 mt-1">' + ago + '</p>'
      + '</div></div>';
  });
  list.innerHTML = html;
}

async function markNotifRead(id) {
  // Mark single notification read
  const el = document.querySelector('[data-notif-id="'+id+'"]');
  if (el) el.classList.remove('bg-blue-50/40');
  try {
    await fetch('/api/notifications/' + id + '/read', { method: 'PATCH', headers: authHeaders() });
    const n = state.notifList.find(function(x) { return x.id === id; });
    if (n && !n.is_read) {
      n.is_read = true;
      state.notifUnread = Math.max(0, state.notifUnread - 1);
      renderNotifBadge();
    }
  } catch(_e) {}
}

async function markAllNotifsRead() {
  try {
    await fetch('/api/notifications/read-all', { method: 'POST', headers: authHeaders() });
    state.notifList.forEach(function(n) { n.is_read = true; });
    state.notifUnread = 0;
    renderNotifBadge();
    const list = document.getElementById('notif-list');
    renderNotifList(list);
    toast('All notifications marked as read', 'success');
  } catch(_e) { toast('Failed to mark read', 'error'); }
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400)return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function startNotifPolling() {
  if (!state.user || state.user.role !== 'admin') return;
  refreshNotifBadge();
  // Poll every 30 seconds
  if (state.notifInterval) clearInterval(state.notifInterval);
  state.notifInterval = setInterval(refreshNotifBadge, 30000);
}

// ─── View toggle ──────────────────────────────────────────
function setView(v) {
  state.view = v;
  const gridBtn = document.getElementById('btn-grid');
  const listBtn = document.getElementById('btn-list');
  if (gridBtn) gridBtn.className = 'px-3 py-1.5 text-sm border-r border-gray-200 ' + (v === 'grid' ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-50');
  if (listBtn) listBtn.className = 'px-3 py-1.5 text-sm ' + (v === 'list' ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:bg-gray-50');
  if (state.currentPage === 'files') loadFiles();
  else if (state.currentPage === 'recent')  loadRecent();
  else if (state.currentPage === 'starred') loadStarred();
}

// ─── Search ───────────────────────────────────────────────
function debounceSearch(val) {
  clearTimeout(state.searchTimeout);
  state.searchTimeout = setTimeout(function() {
    if (state.currentPage === 'files') loadFiles();
  }, 400);
}

// ─── Logout ───────────────────────────────────────────────
async function logout() {
  try { await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() }); } catch(e) {}
  localStorage.removeItem('sb_token');
  localStorage.removeItem('sb_refresh');
  document.cookie = 'sb_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  window.location.href = '/login';
}

// ─── Utils ────────────────────────────────────────────────
function showLoading() {
  const pc = document.getElementById('page-content');
  if (pc) pc.innerHTML = '<div class="flex items-center justify-center py-24"><div class="text-center"><i class="fas fa-spinner fa-spin text-3xl text-blue-500 mb-3"></i><p class="text-gray-400 text-sm mt-3">Loading...</p></div></div>';
}
function showError(msg) {
  const pc = document.getElementById('page-content');
  if (pc) pc.innerHTML = '<div class="flex items-center justify-center py-24"><div class="text-center"><i class="fas fa-exclamation-circle text-3xl text-red-400 mb-3"></i><p class="text-gray-700 font-medium mt-3">' + escHtml(msg) + '</p><button onclick="BeDrive.navigate(BeDrive.getPage())" class="mt-4 text-blue-600 text-sm hover:underline">Try again</button></div></div>';
}
function emptyPage(icon, title, desc) {
  return '<div class="flex flex-col items-center justify-center py-24 text-center"><div class="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-5"><i class="fas ' + icon + ' text-3xl text-gray-400"></i></div><h3 class="text-lg font-semibold text-gray-700 mb-2">' + title + '</h3><p class="text-gray-400 text-sm">' + desc + '</p></div>';
}
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function getPage() { return state.currentPage; }

// ─── Keyboard shortcuts ───────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(function(m) { m.classList.add('hidden'); });
    closeContextMenus();
    closeDetail();
  }
});

// ─── Expose global API ────────────────────────────────────
window.BeDrive = {
  init, navigate, goRoot, openFolder, goPathIndex,
  setView, debounceSearch,
  selectFile, selectFolder, closeDetail,
  showUploadModal, closeUploadModal, handleFileSelect, startUpload,
  showFolderModal, closeFolderModal, createFolder,
  renameFile, renameFolder, closeRenameModal, confirmRename,
  toggleStar,
  trashFile, trashFolder, restoreFile, permanentDelete, emptyTrash,
  shareFile, closeShareModal, createShare, copyShareLink,
  ctxFile, ctxFolder,
  logout,
  getPage,
  // Notifications
  toggleNotifPanel,
  markNotifRead,
  markAllNotifsRead,
  refreshNotifBadge,
  // Settings
  loadSettings,
  settingsTab: settingsTabSwitch,
  settingsSearchUsers,
  settingsCreateUser,
  settingsEditUser,
  settingsChangePassword,
  settingsDeleteUser,
  settingsSaveConfig,
  settingsChangeMyPassword,
  settingsApproveUser,
  settingsRejectUser,
  settingsToggle,
  closeUserModal,
};

// ─── Auto-init ────────────────────────────────────────────
// Close notification panel when pressing Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && state.notifOpen) {
    state.notifOpen = false;
    const panel = document.getElementById('notif-panel');
    if (panel) panel.classList.add('hidden');
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
