const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  readPasteContent: () => ipcRenderer.invoke('clipboard:read-paste-content'),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  createSession: (options) => ipcRenderer.invoke('terminal:create', options),
  getSessionBuffer: (id) => ipcRenderer.invoke('terminal:get-buffer', { id }),
  writeSession: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
  resizeSession: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
  killSession: (id) => ipcRenderer.invoke('terminal:kill', { id }),
  restartSession: (id) => ipcRenderer.invoke('terminal:restart', { id }),
  clearSessionBuffer: (id) => ipcRenderer.invoke('terminal:clear-buffer', { id }),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
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
  onQuotaUpdate: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('quota:update', subscription);
    return () => {
      ipcRenderer.removeListener('quota:update', subscription);
    };
  },
});
