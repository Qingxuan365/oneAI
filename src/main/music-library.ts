import { app, dialog, ipcMain, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { t } from './i18n';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus']);
const MAX_TRACK_BYTES = 200 * 1024 * 1024;

export interface MusicTrack {
  name: string;
  path: string;
}

// 渲染进程只能读取最近一次列出的目录内的音频文件
let allowedDir = '';

function resolveDir(dir?: string): string {
  return dir && fs.existsSync(dir) ? dir : app.getPath('music');
}

function listTracks(dir?: string): { directory: string; tracks: MusicTrack[] } {
  const directory = resolveDir(dir);
  allowedDir = path.resolve(directory);
  try {
    const tracks = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => ({ name: path.parse(entry.name).name, path: path.join(directory, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
    return { directory, tracks };
  } catch {
    return { directory, tracks: [] };
  }
}

function readTrack(filePath: string): Buffer | null {
  const resolved = path.resolve(String(filePath || ''));
  if (!allowedDir || path.dirname(resolved) !== allowedDir) return null;
  if (!AUDIO_EXTENSIONS.has(path.extname(resolved).toLowerCase())) return null;
  try {
    if (fs.statSync(resolved).size > MAX_TRACK_BYTES) return null;
    return fs.readFileSync(resolved);
  } catch {
    return null;
  }
}

export function setupMusicLibrary(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('music:list', (_event, dir?: string) => listTracks(dir));
  ipcMain.handle('music:read', (_event, filePath: string) => readTrack(filePath));
  ipcMain.handle('music:select-directory', async (_event, currentPath?: string) => {
    const win = getWindow();
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: t('选择音乐目录'),
      defaultPath: resolveDir(currentPath),
      properties: ['openDirectory'],
    });
    return canceled ? null : filePaths[0] || null;
  });
}
