// Mock data for demo mode (when Supabase is not configured)
import { DEMO_USER_ID } from '../middleware/auth'

const NOW = new Date().toISOString()
const YESTERDAY = new Date(Date.now() - 86400000).toISOString()
const WEEK_AGO = new Date(Date.now() - 7 * 86400000).toISOString()

export const MOCK_FOLDERS = [
  { id: 'folder-1', user_id: DEMO_USER_ID, name: 'Documents', parent_id: null, is_trashed: false, created_at: WEEK_AGO, updated_at: WEEK_AGO },
  { id: 'folder-2', user_id: DEMO_USER_ID, name: 'Images', parent_id: null, is_trashed: false, created_at: WEEK_AGO, updated_at: YESTERDAY },
  { id: 'folder-3', user_id: DEMO_USER_ID, name: 'Videos', parent_id: null, is_trashed: false, created_at: YESTERDAY, updated_at: YESTERDAY },
  { id: 'folder-4', user_id: DEMO_USER_ID, name: 'Projects', parent_id: null, is_trashed: false, created_at: YESTERDAY, updated_at: NOW },
  { id: 'folder-5', user_id: DEMO_USER_ID, name: 'Reports', parent_id: 'folder-1', is_trashed: false, created_at: NOW, updated_at: NOW },
]

export const MOCK_FILES = [
  {
    id: 'file-1', user_id: DEMO_USER_ID, folder_id: null,
    file_name: 'project-overview.pdf', file_path: 'demo/project-overview.pdf',
    file_size: 2457600, mime_type: 'application/pdf', storage: 'r2',
    is_public: false, is_starred: true, is_trashed: false,
    created_at: WEEK_AGO, updated_at: WEEK_AGO,
    url: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/img/table-word.jpg',
  },
  {
    id: 'file-2', user_id: DEMO_USER_ID, folder_id: null,
    file_name: 'photo-landscape.jpg', file_path: 'demo/photo-landscape.jpg',
    file_size: 3145728, mime_type: 'image/jpeg', storage: 'r2',
    is_public: true, is_starred: false, is_trashed: false,
    created_at: YESTERDAY, updated_at: YESTERDAY,
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80',
  },
  {
    id: 'file-3', user_id: DEMO_USER_ID, folder_id: null,
    file_name: 'presentation.pptx', file_path: 'demo/presentation.pptx',
    file_size: 5242880, mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    storage: 'r2', is_public: false, is_starred: false, is_trashed: false,
    created_at: YESTERDAY, updated_at: NOW,
    url: '',
  },
  {
    id: 'file-4', user_id: DEMO_USER_ID, folder_id: null,
    file_name: 'data-export.xlsx', file_path: 'demo/data-export.xlsx',
    file_size: 1048576, mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    storage: 'r2', is_public: false, is_starred: true, is_trashed: false,
    created_at: NOW, updated_at: NOW,
    url: '',
  },
  {
    id: 'file-5', user_id: DEMO_USER_ID, folder_id: null,
    file_name: 'notes.txt', file_path: 'demo/notes.txt',
    file_size: 4096, mime_type: 'text/plain', storage: 'r2',
    is_public: false, is_starred: false, is_trashed: false,
    created_at: NOW, updated_at: NOW,
    url: '',
  },
  {
    id: 'file-6', user_id: DEMO_USER_ID, folder_id: 'folder-2',
    file_name: 'avatar.png', file_path: 'demo/avatar.png',
    file_size: 524288, mime_type: 'image/png', storage: 'r2',
    is_public: true, is_starred: false, is_trashed: false,
    created_at: WEEK_AGO, updated_at: WEEK_AGO,
    url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=300&q=80',
  },
  {
    id: 'file-7', user_id: DEMO_USER_ID, folder_id: 'folder-1',
    file_name: 'contract-2024.pdf', file_path: 'demo/contract-2024.pdf',
    file_size: 1572864, mime_type: 'application/pdf', storage: 'r2',
    is_public: false, is_starred: false, is_trashed: false,
    created_at: WEEK_AGO, updated_at: WEEK_AGO,
    url: '',
  },
  {
    id: 'file-8', user_id: DEMO_USER_ID, folder_id: null,
    file_name: 'archive-backup.zip', file_path: 'demo/archive-backup.zip',
    file_size: 10485760, mime_type: 'application/zip', storage: 'r2',
    is_public: false, is_starred: false, is_trashed: true,
    created_at: WEEK_AGO, updated_at: YESTERDAY,
    trashed_at: YESTERDAY, url: '',
  },
]

export const MOCK_SHARES = [
  {
    id: 'share-1', file_id: 'file-2', folder_id: null,
    user_id: DEMO_USER_ID, share_token: 'demo-abc123',
    password: null, expires_at: null, allow_download: true,
    created_at: YESTERDAY,
    files: MOCK_FILES.find(f => f.id === 'file-2'),
  },
]

export const MOCK_USERS = [
  {
    id: DEMO_USER_ID, email: 'demo@bedrive.app', name: 'Demo Admin',
    role: 'admin', quota: 5 * 1024 * 1024 * 1024,
    used_space: 42 * 1024 * 1024, created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-2', email: 'alice@example.com', name: 'Alice Johnson',
    role: 'user', quota: 5 * 1024 * 1024 * 1024,
    used_space: 1.2 * 1024 * 1024 * 1024, created_at: WEEK_AGO,
  },
  {
    id: 'user-3', email: 'bob@example.com', name: 'Bob Smith',
    role: 'user', quota: 5 * 1024 * 1024 * 1024,
    used_space: 256 * 1024 * 1024, created_at: YESTERDAY,
  },
]

export const MOCK_LOGS = [
  { id: 'log-1', user_id: DEMO_USER_ID, action: 'upload', file_id: 'file-1', ip: '127.0.0.1', created_at: NOW, profiles: { name: 'Demo Admin', email: 'demo@bedrive.app' } },
  { id: 'log-2', user_id: DEMO_USER_ID, action: 'login', file_id: null, ip: '192.168.1.1', created_at: YESTERDAY, profiles: { name: 'Demo Admin', email: 'demo@bedrive.app' } },
  { id: 'log-3', user_id: 'user-2', action: 'download', file_id: 'file-2', ip: '10.0.0.2', created_at: YESTERDAY, profiles: { name: 'Alice Johnson', email: 'alice@example.com' } },
  { id: 'log-4', user_id: 'user-3', action: 'share', file_id: 'file-2', ip: '10.0.0.3', created_at: WEEK_AGO, profiles: { name: 'Bob Smith', email: 'bob@example.com' } },
  { id: 'log-5', user_id: DEMO_USER_ID, action: 'create_folder', file_id: null, ip: '127.0.0.1', created_at: WEEK_AGO, profiles: { name: 'Demo Admin', email: 'demo@bedrive.app' } },
  { id: 'log-6', user_id: 'user-2', action: 'delete', file_id: 'file-8', ip: '10.0.0.2', created_at: WEEK_AGO, profiles: { name: 'Alice Johnson', email: 'alice@example.com' } },
]

// In-memory store for demo operations (upload, create folder, rename, delete, share)
// Note: resets on worker restart - expected for demo
class DemoStore {
  private files = [...MOCK_FILES]
  private folders = [...MOCK_FOLDERS]
  private shares = [...MOCK_SHARES]
  private nextId = 100

  getFiles(folderId: string | null, trashed = false, starred = false, search = ''): typeof MOCK_FILES {
    let result = this.files.filter(f => f.is_trashed === trashed)
    if (!trashed && !starred) {
      result = result.filter(f => f.folder_id === folderId)
    }
    if (starred) result = result.filter(f => f.is_starred && !f.is_trashed)
    if (search) result = result.filter(f => f.file_name.toLowerCase().includes(search.toLowerCase()))
    return result
  }

  getFolders(parentId: string | null, trashed = false): typeof MOCK_FOLDERS {
    return this.folders.filter(f => f.parent_id === parentId && f.is_trashed === trashed)
  }

  getFile(id: string) { return this.files.find(f => f.id === id) }
  getFolder(id: string) { return this.folders.find(f => f.id === id) }

  addFile(file: any) { this.files.push(file); return file }
  addFolder(folder: any) { this.folders.push(folder); return folder }
  addShare(share: any) { this.shares.push(share); return share }

  updateFile(id: string, patch: any) {
    const idx = this.files.findIndex(f => f.id === id)
    if (idx >= 0) { this.files[idx] = { ...this.files[idx], ...patch }; return this.files[idx] }
    return null
  }

  updateFolder(id: string, patch: any) {
    const idx = this.folders.findIndex(f => f.id === id)
    if (idx >= 0) { this.folders[idx] = { ...this.folders[idx], ...patch }; return this.folders[idx] }
    return null
  }

  deleteFile(id: string) {
    const idx = this.files.findIndex(f => f.id === id)
    if (idx >= 0) this.files.splice(idx, 1)
  }

  getShare(token: string) { return this.shares.find(s => s.share_token === token) }
  getShareByFileId(fileId: string) { return this.shares.find(s => s.file_id === fileId) }

  nextFileId() { return 'file-' + (++this.nextId) }
  nextFolderId() { return 'folder-' + (++this.nextId) }
  nextShareId() { return 'share-' + (++this.nextId) }

  getRecentFiles() {
    return [...this.files]
      .filter(f => !f.is_trashed)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 20)
  }

  getTrashedFiles() {
    return this.files.filter(f => f.is_trashed)
  }

  getAnalytics() {
    return {
      summary: {
        new_files: this.files.filter(f => !f.is_trashed).length,
        new_folders: this.folders.filter(f => !f.is_trashed).length,
        new_users: MOCK_USERS.length,
        total_space_used: this.files.reduce((s, f) => s + (f.file_size || 0), 0),
      },
      total_views: 1247,
      page_views: [
        { date: 'Sun', count: 120 }, { date: 'Mon', count: 185 }, { date: 'Tue', count: 203 },
        { date: 'Wed', count: 167 }, { date: 'Thu', count: 145 }, { date: 'Fri', count: 219 },
        { date: 'Sat', count: 208 },
      ],
      devices: { mobile: 45, tablet: 20, desktop: 35 },
    }
  }
}

// Single instance persisted in module scope (survives across requests in same worker instance)
export const demoStore = new DemoStore()
