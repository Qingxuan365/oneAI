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
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
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

export interface StreamEntry {
  name: string;
  url: string;
}

const PLAYLIST_EXTENSIONS = new Set(['.m3u', '.pls']);
const MAX_PLAYLIST_BYTES = 1024 * 1024;
const MAX_PLAYLIST_ENTRIES = 200;
const PLAYLIST_TIMEOUT_MS = 8000;

function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(String(raw || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function entryUrl(raw: string, base: URL): string | null {
  const url = parseHttpUrl(new URL(raw.trim(), base).href);
  return url && !url.pathname.toLowerCase().endsWith('.m3u8') ? url.href : null;
}

/** 解析 .m3u / .pls 歌单文本，只保留 http(s) 条目；相对地址按歌单地址补全 */
export function parsePlaylist(text: string, base: URL, kind: '.m3u' | '.pls'): StreamEntry[] {
  const entries: StreamEntry[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  try {
    if (kind === '.pls') {
      const files = new Map<string, string>();
      const titles = new Map<string, string>();
      for (const line of lines) {
        const match = line.match(/^(File|Title)(\d+)\s*=\s*(.*)$/i);
        if (!match) continue;
        (match[1].toLowerCase() === 'file' ? files : titles).set(match[2], match[3]);
      }
      for (const [index, file] of [...files].sort((a, b) => Number(a[0]) - Number(b[0]))) {
        const url = entryUrl(file, base);
        if (url) entries.push({ name: titles.get(index) || '', url });
      }
    } else {
      let title = '';
      for (const line of lines) {
        if (line.startsWith('#')) {
          const info = line.match(/^#EXTINF:[^,]*,(.*)$/i);
          if (info) title = info[1].trim();
          continue;
        }
        const url = entryUrl(line, base);
        if (url) entries.push({ name: title, url });
        title = '';
      }
    }
  } catch {
    // 个别条目地址无法解析时，保留已解析出的部分
  }
  return entries.slice(0, MAX_PLAYLIST_ENTRIES);
}

/** 把用户添加的在线音乐地址展开成可播放条目：歌单文件取其中的曲目，其他地址视为音频直链原样返回；歌单下载失败时回退为原地址 */
async function resolveStream(rawUrl: string): Promise<StreamEntry[]> {
  const url = parseHttpUrl(rawUrl);
  if (!url) return [];
  const kind = path.extname(url.pathname).toLowerCase();
  if (!PLAYLIST_EXTENSIONS.has(kind)) return [{ name: '', url: url.href }];
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PLAYLIST_TIMEOUT_MS) });
    const length = Number(response.headers.get('content-length') || 0);
    if (!response.ok || length > MAX_PLAYLIST_BYTES) return [{ name: '', url: url.href }];
    const entries = parsePlaylist((await response.text()).slice(0, MAX_PLAYLIST_BYTES), url, kind as '.m3u' | '.pls');
    return entries.length > 0 ? entries : [{ name: '', url: url.href }];
  } catch {
    return [{ name: '', url: url.href }];
  }
}

export function setupMusicLibrary(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('music:list', (_event, dir?: string) => listTracks(dir));
  ipcMain.handle('music:resolve-stream', (_event, url: string) => resolveStream(url));
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
