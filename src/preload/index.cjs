const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  createSession: (options) => ipcRenderer.invoke('terminal:create', options),
  getSessionBuffer: (id) => ipcRenderer.invoke('terminal:get-buffer', { id }),
  writeSession: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
  resizeSession: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
  killSession: (id) => ipcRenderer.invoke('terminal:kill', { id }),
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
  getQuota: () => ipcRenderer.invoke('quota:get'),
  refreshQuota: () => ipcRenderer.invoke('quota:refresh'),
  onQuotaUpdate: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('quota:update', subscription);
    return () => {
      ipcRenderer.removeListener('quota:update', subscription);
    };
  },
});
