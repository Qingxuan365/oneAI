import { app, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// 工作区状态落盘：渲染进程每次变更即同步写入，先写临时文件再重命名，避免崩溃时留下半截文件
function stateFile(): string {
  return path.join(app.getPath('userData'), 'workspace-state.json');
}

export function setupWorkspaceStore(): void {
  ipcMain.on('state:load', (event) => {
    try {
      event.returnValue = fs.readFileSync(stateFile(), 'utf-8');
    } catch {
      event.returnValue = null;
    }
  });

  ipcMain.on('state:save', (_event, json: unknown) => {
    if (typeof json !== 'string') return;
    const file = stateFile();
    const tmp = `${file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, json, 'utf-8');
      fs.renameSync(tmp, file);
    } catch (e) {
      console.error('[OneAI] 无法写入工作区状态文件:', e);
    }
  });
}
