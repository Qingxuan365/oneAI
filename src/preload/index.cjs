const { contextBridge, ipcRenderer, webUtils } = require('electron');

let cachedHomeDir = null;

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
  setCloseToTray: (enabled) => ipcRenderer.send('window:set-close-to-tray', enabled),
  selectWorkspaceDirectory: (currentPath) => ipcRenderer.invoke('workspace:select-directory', currentPath),
  selectWorkspaceBackgroundImage: (currentPath) => ipcRenderer.invoke('workspace:select-background-image', currentPath),
  readWorkspaceBackgroundImage: (filePath) => ipcRenderer.invoke('workspace:read-background-image', filePath),
  loadWorkspaceState: () => ipcRenderer.sendSync('state:load'),
  saveWorkspaceState: (json) => ipcRenderer.send('state:save', json),
  listMusic: (dir) => ipcRenderer.invoke('music:list', dir),
  readMusic: (filePath) => ipcRenderer.invoke('music:read', filePath),
  getMusicTrackUrl: (filePath) => `oneai-music://track?file=${encodeURIComponent(filePath)}`,
  selectMusicDirectory: (currentPath) => ipcRenderer.invoke('music:select-directory', currentPath),
  resolveMusicStream: (url) => ipcRenderer.invoke('music:resolve-stream', url),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  readPasteContent: () => ipcRenderer.invoke('clipboard:read-paste-content'),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  listSessionHistory: (accounts) => ipcRenderer.invoke('history:list', accounts),
  deleteSessionHistory: (items) => ipcRenderer.invoke('history:delete', items),
  getUsageStats: (accounts) => ipcRenderer.invoke('usage:stats', accounts),
  getDashboardStats: (accounts) => ipcRenderer.invoke('dashboard:stats', accounts),
  detectClis: (custom, refreshPath) => ipcRenderer.invoke('cli:detect', custom, refreshPath),
  listKnownClis: () => ipcRenderer.invoke('cli:known'),
  getCliEnvInfo: () => ipcRenderer.invoke('cli:env-info'),
  installClis: (cliIds) => ipcRenderer.invoke('cli:install', cliIds),
  cancelCliInstall: () => ipcRenderer.invoke('cli:install-cancel'),
  onCliInstallEvent: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('cli:install-event', subscription);
    return () => {
      ipcRenderer.removeListener('cli:install-event', subscription);
    };
  },
  setLanguage: (language) => ipcRenderer.invoke('app:set-language', language),
  getHomeDir: () => {
    if (cachedHomeDir === null) cachedHomeDir = ipcRenderer.sendSync('app:home-dir');
    return cachedHomeDir;
  },
  createSession: (options) => ipcRenderer.invoke('terminal:create', options),
  acknowledgeSession: (id, seq) => ipcRenderer.send('terminal:acknowledge', { id, seq }),
  getSessionBuffer: (id) => ipcRenderer.invoke('terminal:get-buffer', { id }),
  getSessionSnapshot: (id) => ipcRenderer.invoke('terminal:get-snapshot', { id }),
  getSessionShellActivity: (ids) => ipcRenderer.invoke('terminal:shell-activity', ids),
  writeSession: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
  resizeSession: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
  killSession: (id) => ipcRenderer.invoke('terminal:kill', { id }),
  restartSession: (id, options) => ipcRenderer.invoke('terminal:restart', { id, ...(options || {}) }),
  clearSessionBuffer: (id) => ipcRenderer.invoke('terminal:clear-buffer', { id }),
  setActiveSession: (id, cliId) => ipcRenderer.send('terminal:set-active', id, cliId),
  resolvePreviewPaths: (cwd, candidates) => ipcRenderer.invoke('preview:resolve', cwd, candidates),
  allowDroppedPreview: (paths) => ipcRenderer.invoke('preview:allow-dropped', paths),
  readPreviewFile: (cwd, filePath) => ipcRenderer.invoke('preview:read', cwd, filePath),
  listDirectory: (rootPath, relDir) => ipcRenderer.invoke('fs:list-dir', rootPath, relDir),
  copyProjectFile: (rootPath, relPath) => ipcRenderer.invoke('fs:copy-project-file', rootPath, relPath),
  revealInExplorer: (targetPath) => ipcRenderer.invoke('shell:reveal-in-explorer', targetPath),
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
  listLocalGitBranches: (dir) => ipcRenderer.invoke('git:list-local-branches', dir),
  switchLocalGitBranch: (dir, branch) => ipcRenderer.invoke('git:switch-local-branch', dir, branch),
  listGitConflicts: (dir) => ipcRenderer.invoke('git:list-conflicts', dir),
  readGitConflictDiff: (dir, file) => ipcRenderer.invoke('git:conflict-diff', dir, file),
  readGitStatus: (dir) => ipcRenderer.invoke('git:status', dir),
  readGitChangeDiff: (dir, file) => ipcRenderer.invoke('git:change-diff', dir, file),
  commitGitChanges: (dir, files, message) => ipcRenderer.invoke('git:commit', dir, files, message),
  getTaskSummaries: (tasks) => ipcRenderer.invoke('task:summaries', tasks),
  onQuotaUpdate: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('quota:update', subscription);
    return () => {
      ipcRenderer.removeListener('quota:update', subscription);
    };
  },
  setSystemStatsEnabled: (enabled) => ipcRenderer.send('system:set-stats-enabled', enabled),
  onSystemStats: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('system:stats', subscription);
    return () => {
      ipcRenderer.removeListener('system:stats', subscription);
    };
  },
  getUpdateState: () => ipcRenderer.invoke('update:get-state'),
  checkForUpdates: (manual) => ipcRenderer.invoke('update:check', manual),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openUpdateRelease: () => ipcRenderer.invoke('update:open-release'),
  onUpdateState: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('update:state', subscription);
    return () => {
      ipcRenderer.removeListener('update:state', subscription);
    };
  },
});
