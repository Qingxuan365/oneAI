import { contextBridge, ipcRenderer } from 'electron';

export interface CreateSessionOptions {
  id: string;
  command?: string;
  cwd?: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // PTY 终端管理
  createSession: (options: CreateSessionOptions) =>
    ipcRenderer.invoke('terminal:create', options),

  writeSession: (id: string, data: string) =>
    ipcRenderer.invoke('terminal:write', { id, data }),

  resizeSession: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', { id, cols, rows }),

  killSession: (id: string) =>
    ipcRenderer.invoke('terminal:kill', { id }),

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
  getQuota: () => ipcRenderer.invoke('quota:get'),

  refreshQuota: () => ipcRenderer.invoke('quota:refresh'),

  onQuotaUpdate: (callback: (quota: any) => void) => {
    const subscription = (_event: any, value: any) => callback(value);
    ipcRenderer.on('quota:update', subscription);
    return () => {
      ipcRenderer.removeListener('quota:update', subscription);
    };
  },
});
