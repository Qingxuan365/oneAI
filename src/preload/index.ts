import { contextBridge, ipcRenderer, webUtils } from 'electron';

export interface CreateSessionOptions {
  id: string;
  command?: string;
  cwd?: string;
  shell?: boolean;
  account?: { cliId: 'codex' | 'claude' | 'kimi'; configDir: string; env?: Record<string, string> };
}

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
  selectMusicDirectory: (currentPath?: string) => ipcRenderer.invoke('music:select-directory', currentPath),
  loadWorkspaceState: () => ipcRenderer.sendSync('state:load') as string | null,
  saveWorkspaceState: (json: string) => ipcRenderer.send('state:save', json),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  readPasteContent: () => ipcRenderer.invoke('clipboard:read-paste-content'),
  writeClipboardText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  listSessionHistory: () => ipcRenderer.invoke('history:list'),
  deleteSessionHistory: (items: Array<{ cliId: string; id: string }>) => ipcRenderer.invoke('history:delete', items),
  getUsageStats: (accounts: Array<{ id: string; name: string; cliId: string; configDir: string }>) => ipcRenderer.invoke('usage:stats', accounts),
  detectClis: (custom?: Array<{ id: string; command: string }>) => ipcRenderer.invoke('cli:detect', custom),
  listKnownClis: () => ipcRenderer.invoke('cli:known'),
  setLanguage: (language: string) => ipcRenderer.invoke('app:set-language', language),
  getHomeDir: () => ipcRenderer.sendSync('app:home-dir') as string,

  // PTY 终端管理
  createSession: (options: CreateSessionOptions) =>
    ipcRenderer.invoke('terminal:create', options),

  getSessionBuffer: (id: string) =>
    ipcRenderer.invoke('terminal:get-buffer', { id }),

  writeSession: (id: string, data: string) =>
    ipcRenderer.invoke('terminal:write', { id, data }),

  resizeSession: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', { id, cols, rows }),

  killSession: (id: string) =>
    ipcRenderer.invoke('terminal:kill', { id }),

  restartSession: (id: string) =>
    ipcRenderer.invoke('terminal:restart', { id }),

  clearSessionBuffer: (id: string) =>
    ipcRenderer.invoke('terminal:clear-buffer', { id }),

  resolvePreviewPaths: (cwd: string, candidates: string[]) =>
    ipcRenderer.invoke('preview:resolve', cwd, candidates),

  readPreviewFile: (cwd: string, filePath: string) =>
    ipcRenderer.invoke('preview:read', cwd, filePath),

  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:open-external', url),

  openDirectory: (dir: string) =>
    ipcRenderer.invoke('shell:open-directory', dir),

  saveLogFile: (defaultName: string, content: string) =>
    ipcRenderer.invoke('dialog:save-log-file', { defaultName, content }),

  onSessionData: (callback: (event: { id: string; data: string }) => void) => {
    const subscription = (_event: any, value: { id: string; data: string }) => callback(value);
    ipcRenderer.on('terminal:data', subscription);
    return () => {
      ipcRenderer.removeListener('terminal:data', subscription);
    };
  },

  onSessionExit: (callback: (event: { id: string; exitCode: number }) => void) => {
    const subscription = (_event: any, value: { id: string; exitCode: number }) => callback(value);
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
  checkAccountLogin: (account: unknown) => ipcRenderer.invoke('account:login-status', account),
  setTitleBarOverlay: (opts: { color: string; symbolColor: string; height: number }) => ipcRenderer.send('window:set-title-bar-overlay', opts),
  getGitBranches: (paths: string[]) => ipcRenderer.invoke('git:branches', paths),
  getTaskSummaries: (tasks: unknown[]) => ipcRenderer.invoke('task:summaries', tasks),

  onQuotaUpdate: (callback: (quotas: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('quota:update', subscription);
    return () => {
      ipcRenderer.removeListener('quota:update', subscription);
    };
  },

  onSystemStats: (callback: (stats: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('system:stats', subscription);
    return () => {
      ipcRenderer.removeListener('system:stats', subscription);
    };
  },
});
