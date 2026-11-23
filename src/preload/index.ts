import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  ElectronTerminalAPI,
  HistoryAccountRef,
  HistoryEntry,
  QuotaData,
  RestartSessionOptions,
  SessionAccount,
  SystemStats,
  UsageAccountRef,
} from '../renderer/src/types';

export interface CreateSessionOptions {
  id: string;
  command?: string;
  cwd?: string;
  shell?: boolean;
  account?: SessionAccount;
  cols?: number;
  rows?: number;
}

let cachedHomeDir: string | null = null;

contextBridge.exposeInMainWorld('electronAPI', {
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on('window:maximized-change', listener);
    return () => ipcRenderer.removeListener('window:maximized-change', listener);
  },
  onWindowCloseRequest: (callback: (aliveCount: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, aliveCount: number) => callback(aliveCount);
    ipcRenderer.on('window:close-request', listener);
    return () => ipcRenderer.removeListener('window:close-request', listener);
  },
  confirmWindowClose: () => ipcRenderer.send('window:confirm-close'),
  cancelWindowClose: () => ipcRenderer.send('window:cancel-close'),
  selectWorkspaceDirectory: (currentPath?: string) => ipcRenderer.invoke('workspace:select-directory', currentPath),
  listMusic: (dir?: string) => ipcRenderer.invoke('music:list', dir),
  readMusic: (filePath: string) => ipcRenderer.invoke('music:read', filePath),
  getMusicTrackUrl: (filePath: string) => `oneai-music://track?file=${encodeURIComponent(filePath)}`,
  selectMusicDirectory: (currentPath?: string) => ipcRenderer.invoke('music:select-directory', currentPath),
  resolveMusicStream: (url: string) => ipcRenderer.invoke('music:resolve-stream', url),
  loadWorkspaceState: () => ipcRenderer.sendSync('state:load') as string | null,
  saveWorkspaceState: (json: string) => ipcRenderer.send('state:save', json),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  readPasteContent: () => ipcRenderer.invoke('clipboard:read-paste-content'),
  writeClipboardText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  listSessionHistory: (accounts?: HistoryAccountRef[]) => ipcRenderer.invoke('history:list', accounts),
  deleteSessionHistory: (items: Array<{ cliId: HistoryEntry['cliId']; id: string; accountId?: string }>) => ipcRenderer.invoke('history:delete', items),
  getUsageStats: (accounts: UsageAccountRef[]) => ipcRenderer.invoke('usage:stats', accounts),
  getDashboardStats: (accounts: UsageAccountRef[]) => ipcRenderer.invoke('dashboard:stats', accounts),
  detectClis: (custom?: Array<{ id: string; command: string }>) => ipcRenderer.invoke('cli:detect', custom),
  listKnownClis: () => ipcRenderer.invoke('cli:known'),
  setLanguage: (language: string) => ipcRenderer.invoke('app:set-language', language),
  getHomeDir: () => {
    if (cachedHomeDir === null) cachedHomeDir = ipcRenderer.sendSync('app:home-dir') as string;
    return cachedHomeDir;
  },

  // PTY 终端管理
  createSession: (options: CreateSessionOptions) =>
    ipcRenderer.invoke('terminal:create', options),

  getSessionBuffer: (id: string) =>
    ipcRenderer.invoke('terminal:get-buffer', { id }),

  getSessionSnapshot: (id: string) =>
    ipcRenderer.invoke('terminal:get-snapshot', { id }),

  writeSession: (id: string, data: string) =>
    ipcRenderer.invoke('terminal:write', { id, data }),

  resizeSession: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', { id, cols, rows }),

  killSession: (id: string) =>
    ipcRenderer.invoke('terminal:kill', { id }),

  restartSession: (id: string, options?: RestartSessionOptions) =>
    ipcRenderer.invoke('terminal:restart', { id, ...(options || {}) }),

  clearSessionBuffer: (id: string) =>
    ipcRenderer.invoke('terminal:clear-buffer', { id }),

  setActiveSession: (id: string | null, cliId?: string | null) =>
    ipcRenderer.send('terminal:set-active', id, cliId),

  resolvePreviewPaths: (cwd: string, candidates: string[]) =>
    ipcRenderer.invoke('preview:resolve', cwd, candidates),

  allowDroppedPreview: (paths: string[]) =>
    ipcRenderer.invoke('preview:allow-dropped', paths),

  readPreviewFile: (cwd: string, filePath: string) =>
    ipcRenderer.invoke('preview:read', cwd, filePath),

  listDirectory: (rootPath: string, relDir?: string) =>
    ipcRenderer.invoke('fs:list-dir', rootPath, relDir),

  revealInExplorer: (targetPath: string) =>
    ipcRenderer.invoke('shell:reveal-in-explorer', targetPath),

  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:open-external', url),

  openDirectory: (dir: string) =>
    ipcRenderer.invoke('shell:open-directory', dir),

  saveLogFile: (defaultName: string, content: string) =>
    ipcRenderer.invoke('dialog:save-log-file', { defaultName, content }),

  onSessionData: (callback: (event: { id: string; data: string; seq?: number }) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, value: { id: string; data: string; seq?: number }) => callback(value);
    ipcRenderer.on('terminal:data', subscription);
    return () => {
      ipcRenderer.removeListener('terminal:data', subscription);
    };
  },

  onSessionExit: (callback: (event: { id: string; exitCode: number }) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, value: { id: string; exitCode: number }) => callback(value);
    ipcRenderer.on('terminal:exit', subscription);
    return () => {
      ipcRenderer.removeListener('terminal:exit', subscription);
    };
  },

  // 大模型配额
  getQuota: (cliId?: string) => ipcRenderer.invoke('quota:get', cliId),

  getAllQuotas: () => ipcRenderer.invoke('quota:get-all'),

  refreshQuota: (cliId?: string) => ipcRenderer.invoke('quota:refresh', cliId),
  setQuotaAccounts: (accounts: Array<{ key: string; cliId: string; configDir: string }>) => ipcRenderer.invoke('quota:set-accounts', accounts),
  checkAccountLogin: (account: SessionAccount) => ipcRenderer.invoke('account:login-status', account),
  setTitleBarOverlay: (opts: { color: string; symbolColor: string; height: number; backgroundColor?: string }) => ipcRenderer.send('window:set-title-bar-overlay', opts),
  getGitBranches: (paths: string[]) => ipcRenderer.invoke('git:branches', paths),
  getTaskSummaries: (tasks: Array<{ id: string; cliId: string; cwd: string; createdAt: number; historyId?: string; configDir?: string; includeUsage?: boolean }>) => ipcRenderer.invoke('task:summaries', tasks),

  onQuotaUpdate: (callback: (quotas: Record<string, QuotaData>) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, value: Record<string, QuotaData>) => callback(value);
    ipcRenderer.on('quota:update', subscription);
    return () => {
      ipcRenderer.removeListener('quota:update', subscription);
    };
  },

  onSystemStats: (callback: (stats: SystemStats) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, value: SystemStats) => callback(value);
    ipcRenderer.on('system:stats', subscription);
    return () => {
      ipcRenderer.removeListener('system:stats', subscription);
    };
  },
} satisfies Required<ElectronTerminalAPI>);
