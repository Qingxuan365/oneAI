const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximizedChange: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on('window:maximized-change', listener);
    return () => ipcRenderer.removeListener('window:maximized-change', listener);
  },
  onWindowCloseRequest: (callback) => {
    const listener = (_event, aliveCount) => callback(aliveCount);
    ipcRenderer.on('window:close-request', listener);
    return () => ipcRenderer.removeListener('window:close-request', listener);
  },
  confirmWindowClose: () => ipcRenderer.send('window:confirm-close'),
  cancelWindowClose: () => ipcRenderer.send('window:cancel-close'),
  selectWorkspaceDirectory: (currentPath) => ipcRenderer.invoke('workspace:select-directory', currentPath),
  loadWorkspaceState: () => ipcRenderer.sendSync('state:load'),
  saveWorkspaceState: (json) => ipcRenderer.send('state:save', json),
  listMusic: (dir) => ipcRenderer.invoke('music:list', dir),
  readMusic: (filePath) => ipcRenderer.invoke('music:read', filePath),
  selectMusicDirectory: (currentPath) => ipcRenderer.invoke('music:select-directory', currentPath),
  resolveMusicStream: (url) => ipcRenderer.invoke('music:resolve-stream', url),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  readPasteContent: () => ipcRenderer.invoke('clipboard:read-paste-content'),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  listSessionHistory: () => ipcRenderer.invoke('history:list'),
  deleteSessionHistory: (items) => ipcRenderer.invoke('history:delete', items),
  getUsageStats: (accounts) => ipcRenderer.invoke('usage:stats', accounts),
  detectClis: (custom) => ipcRenderer.invoke('cli:detect', custom),
  listKnownClis: () => ipcRenderer.invoke('cli:known'),
  setLanguage: (language) => ipcRenderer.invoke('app:set-language', language),
  getHomeDir: () => ipcRenderer.sendSync('app:home-dir'),
  createSession: (options) => ipcRenderer.invoke('terminal:create', options),
  getSessionBuffer: (id) => ipcRenderer.invoke('terminal:get-buffer', { id }),
  writeSession: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
  resizeSession: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
  killSession: (id) => ipcRenderer.invoke('terminal:kill', { id }),
  restartSession: (id) => ipcRenderer.invoke('terminal:restart', { id }),
  clearSessionBuffer: (id) => ipcRenderer.invoke('terminal:clear-buffer', { id }),
  resolvePreviewPaths: (cwd, candidates) => ipcRenderer.invoke('preview:resolve', cwd, candidates),
  readPreviewFile: (cwd, filePath) => ipcRenderer.invoke('preview:read', cwd, filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openDirectory: (dir) => ipcRenderer.invoke('shell:open-directory', dir),
  saveLogFile: (defaultName, content) => ipcRenderer.invoke('dialog:save-log-file', { defaultName, content }),
  onSessionData: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('terminal:data', subscription);
    return () => {
      ipcRenderer.removeListener('terminal:data', subscription);
    };
  },
  onSessionExit: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('terminal:exit', subscription);
    return () => {
      ipcRenderer.removeListener('terminal:exit', subscription);
    };
  },
  getQuota: (cliId) => ipcRenderer.invoke('quota:get', cliId),
  getAllQuotas: () => ipcRenderer.invoke('quota:get-all'),
  refreshQuota: (cliId) => ipcRenderer.invoke('quota:refresh', cliId),
  setQuotaAccounts: (accounts) => ipcRenderer.invoke('quota:set-accounts', accounts),
  checkAccountLogin: (account) => ipcRenderer.invoke('account:login-status', account),
  setTitleBarOverlay: (opts) => ipcRenderer.send('window:set-title-bar-overlay', opts),
  getGitBranches: (paths) => ipcRenderer.invoke('git:branches', paths),
  getTaskSummaries: (tasks) => ipcRenderer.invoke('task:summaries', tasks),
  onQuotaUpdate: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('quota:update', subscription);
    return () => {
      ipcRenderer.removeListener('quota:update', subscription);
    };
  },
  onSystemStats: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('system:stats', subscription);
    return () => {
      ipcRenderer.removeListener('system:stats', subscription);
    };
  },
});
