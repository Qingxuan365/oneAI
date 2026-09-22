import { contextBridge, ipcRenderer, webUtils } from 'electron';

export interface CreateSessionOptions {
  id: string;
  command?: string;
  cwd?: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  readPasteContent: () => ipcRenderer.invoke('clipboard:read-paste-content'),
  writeClipboardText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),

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

  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:open-external', url),

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

  onQuotaUpdate: (callback: (quotas: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('quota:update', subscription);
    return () => {
      ipcRenderer.removeListener('quota:update', subscription);
    };
  },
});
