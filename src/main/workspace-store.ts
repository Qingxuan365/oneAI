import { app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// 工作区状态落盘：异步串行原子写入（先写临时文件再重命名），避免频繁阻塞主进程事件循环；退出前兜底同步落盘未完成的最新状态
function stateFile(): string {
  return path.join(app.getPath('userData'), 'workspace-state.json');
}

export function setupWorkspaceStore(): void {
  let pendingJson: string | null = null;
  let writing = false;

  const flushAsync = async () => {
    if (writing) return;
    writing = true;
    try {
      while (pendingJson !== null) {
        const json = pendingJson;
        pendingJson = null;
        const file = stateFile();
        const tmp = `${file}.tmp`;
        try {
          await fs.promises.mkdir(path.dirname(file), { recursive: true });
          await fs.promises.writeFile(tmp, json, 'utf-8');
          await fs.promises.rename(tmp, file);
        } catch (e) {
          console.error('[OneAI] 无法写入工作区状态文件:', e);
        }
      }
    } finally {
      writing = false;
    }
  };

  app.on('before-quit', () => {
    if (pendingJson === null) return;
    const json = pendingJson;
    pendingJson = null;
    const file = stateFile();
    const tmp = `${file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, json, 'utf-8');
      fs.renameSync(tmp, file);
    } catch (e) {
      console.error('[OneAI] 退出前写入工作区状态文件失败:', e);
    }
  });

  ipcMain.on('state:load', (event) => {
    try {
      event.returnValue = fs.readFileSync(stateFile(), 'utf-8');
    } catch {
      event.returnValue = null;
    }
  });

  ipcMain.on('state:save', (_event, json: unknown) => {
    if (typeof json !== 'string') return;
    pendingJson = json;
    void flushAsync();
  });
}
