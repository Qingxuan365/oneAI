import { app, dialog, ipcMain, BrowserWindow, protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isSamePath } from './fs-utils';
import { t } from './i18n';

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.opus': 'audio/ogg',
};
const AUDIO_EXTENSIONS = new Set(Object.keys(AUDIO_MIME));
const MAX_TRACK_BYTES = 200 * 1024 * 1024;
export const MUSIC_SCHEME = 'oneai-music';

export interface MusicTrack {
  name: string;
  path: string;
}

// 渲染进程只能读取最近一次列出的目录内的真实音频文件（经 realpath 校验，防符号链接越界，且兼容 Windows 大小写差异）
let allowedDir = '';

/** 须在 app.whenReady() 前调用：让自定义音频协议支持流式读取、Range 拖拽与 Web Audio 频谱采集 */
export function registerMusicScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: MUSIC_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  }]);
}

async function resolveDir(dir?: string): Promise<string> {
  if (dir) {
    try {
      if ((await fs.promises.stat(dir)).isDirectory()) return dir;
    } catch {}
  }
  return app.getPath('music');
}

export async function listTracks(dir?: string): Promise<{ directory: string; tracks: MusicTrack[] }> {
  const directory = await resolveDir(dir);
  allowedDir = await fs.promises.realpath(directory).catch(() => path.resolve(directory));
  try {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    const candidates = await Promise.all(entries.map(async (entry): Promise<MusicTrack | null> => {
      if (!AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return null;
      const fullPath = path.join(directory, entry.name);
      if (entry.isFile()) return { name: path.parse(entry.name).name, path: fullPath };
      if (!entry.isSymbolicLink()) return null;
      // 仅允许指向同一目录内部的符号链接，拒绝指向目录外的符号链接
      try {
        const real = await fs.promises.realpath(fullPath);
        if (isSamePath(path.dirname(real), allowedDir) && (await fs.promises.stat(real)).isFile()) {
          return { name: path.parse(entry.name).name, path: fullPath };
        }
      } catch {}
      return null;
    }));
    const tracks = candidates
      .filter((item): item is MusicTrack => item !== null)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { directory, tracks };
  } catch {
    return { directory, tracks: [] };
  }
}

interface AllowedTrack {
  path: string;
  size: number;
  mime: string;
}

export async function resolveAllowedTrack(filePath: string): Promise<AllowedTrack | null> {
  if (!allowedDir || !filePath) return null;
  const candidate = path.resolve(String(filePath));
  if (!AUDIO_MIME[path.extname(candidate).toLowerCase()]) return null;
  try {
    const real = await fs.promises.realpath(candidate);
    if (!isSamePath(path.dirname(real), allowedDir)) return null;
    const mime = AUDIO_MIME[path.extname(real).toLowerCase()];
    if (!mime) return null;
    const stat = await fs.promises.stat(real);
    return stat.isFile() && stat.size <= MAX_TRACK_BYTES ? { path: real, size: stat.size, mime } : null;
  } catch {
    return null;
  }
}

async function readTrack(filePath: string): Promise<Buffer | null> {
  const allowed = await resolveAllowedTrack(filePath);
  if (!allowed) return null;
  try {
    return await fs.promises.readFile(allowed.path);
  } catch {
    return null;
  }
}

function createRangeStream(filePath: string, start: number, end: number, signal?: AbortSignal): ReadableStream<Uint8Array> {
  let fileStream: fs.ReadStream | null = null;
  const cleanup = () => {
    if (!fileStream) return;
    const s = fileStream;
    fileStream = null;
    s.removeAllListeners();
    s.destroy();
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) {
        controller.close();
        return;
      }
      const s = fs.createReadStream(filePath, { start, end });
      fileStream = s;
      signal?.addEventListener('abort', () => {
        cleanup();
        try { controller.close(); } catch {}
      }, { once: true });
      s.on('data', (chunk: Buffer | string) => {
        const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        controller.enqueue(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
        if ((controller.desiredSize ?? 1) <= 0) s.pause();
      });
      s.on('end', () => {
        cleanup();
        try { controller.close(); } catch {}
      });
      s.on('error', (err) => {
        cleanup();
        try { controller.error(err); } catch {}
      });
    },
    pull() {
      fileStream?.resume();
    },
    cancel() {
      cleanup();
    },
  }, { highWaterMark: 256 * 1024, size: (chunk) => chunk.byteLength });
}

export async function serveMusicTrack(request: Request): Promise<Response> {
  try {
    const fileParam = new URL(request.url).searchParams.get('file') ?? '';
    const allowed = await resolveAllowedTrack(fileParam);
    if (!allowed) return new Response(null, { status: 403 });
    const baseHeaders: Record<string, string> = {
      'Content-Type': allowed.mime,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    };
    const isHead = request.method === 'HEAD';
    if (allowed.size === 0) {
      return new Response(isHead ? null : new Uint8Array(0), {
        status: 200,
        headers: { ...baseHeaders, 'Content-Length': '0' },
      });
    }
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
      let start = -1;
      let end = -1;
      if (match) {
        const [, rawStart, rawEnd] = match;
        if (!rawStart && rawEnd) {
          const suffix = Number(rawEnd);
          if (suffix > 0) {
            start = Math.max(0, allowed.size - suffix);
            end = allowed.size - 1;
          }
        } else if (rawStart) {
          start = Number(rawStart);
          end = rawEnd ? Math.min(Number(rawEnd), allowed.size - 1) : allowed.size - 1;
        }
      }
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= allowed.size || start > end) {
        return new Response(null, {
          status: 416,
          headers: { ...baseHeaders, 'Content-Range': `bytes */${allowed.size}` },
        });
      }
      return new Response(isHead ? null : createRangeStream(allowed.path, start, end, request.signal), {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${allowed.size}`,
          'Content-Length': String(end - start + 1),
        },
      });
    }
    return new Response(isHead ? null : createRangeStream(allowed.path, 0, allowed.size - 1, request.signal), {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(allowed.size) },
    });
  } catch {
    return new Response(null, { status: 404 });
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

/** 判断主机是否为本机回环或链路本地地址；远程公网歌单不得重定向或展开到此范围 */
export function isLocalOrLinkLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::' || host === '::1') {
    return true;
  }
  if (/^127\./.test(host) || /^169\.254\./.test(host)) return true;
  if (host.startsWith('fe80:') || host.startsWith('::ffff:127.') || host.startsWith('::ffff:169.254.')) return true;
  return false;
}

function entryUrl(raw: string, base: URL): string | null {
  let candidate: URL | null = null;
  try {
    candidate = parseHttpUrl(new URL(raw.trim(), base).href);
  } catch {
    return null;
  }
  if (!candidate || candidate.pathname.toLowerCase().endsWith('.m3u8')) return null;
  // 只有用户自己直接填写了本机歌单时才允许展开本机曲目；公网歌单禁止展开到本机回环 / 链路本地地址
  if (!isLocalOrLinkLocalHost(base.hostname) && isLocalOrLinkLocalHost(candidate.hostname)) return null;
  return candidate.href;
}

/** 解析 .m3u / .pls 歌单文本，只保留 http(s) 条目；相对地址按歌单地址补全 */
export function parsePlaylist(text: string, base: URL, kind: '.m3u' | '.pls'): StreamEntry[] {
  const entries: StreamEntry[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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

/** 流式读取响应文本，累计字节超过 maxBytes 时立即中止连接并返回 null，避免无 Content-Length 的长流撑爆内存 */
export async function readBodyTextCapped(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8').decode(merged);
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

/** 把用户添加的在线音乐地址展开成可播放条目：歌单文件取其中的曲目，其他地址视为音频直链原样返回；歌单下载失败或超限时回退为原地址 */
export async function resolveStream(rawUrl: string): Promise<StreamEntry[]> {
  const url = parseHttpUrl(rawUrl);
  if (!url) return [];
  const kind = path.extname(url.pathname).toLowerCase();
  if (!PLAYLIST_EXTENSIONS.has(kind)) return [{ name: '', url: url.href }];
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PLAYLIST_TIMEOUT_MS) });
    const finalUrl = parseHttpUrl(response.url || url.href) ?? url;
    if (!isLocalOrLinkLocalHost(url.hostname) && isLocalOrLinkLocalHost(finalUrl.hostname)) {
      await response.body?.cancel().catch(() => {});
      return [{ name: '', url: url.href }];
    }
    const length = Number(response.headers.get('content-length') || 0);
    if (!response.ok || length > MAX_PLAYLIST_BYTES) {
      await response.body?.cancel().catch(() => {});
      return [{ name: '', url: url.href }];
    }
    const text = await readBodyTextCapped(response, MAX_PLAYLIST_BYTES);
    if (text === null) return [{ name: '', url: url.href }];
    const entries = parsePlaylist(text, finalUrl, kind as '.m3u' | '.pls');
    return entries.length > 0 ? entries : [{ name: '', url: url.href }];
  } catch {
    return [{ name: '', url: url.href }];
  }
}

export function setupMusicLibrary(getWindow: () => BrowserWindow | null) {
  protocol.handle(MUSIC_SCHEME, (request) => serveMusicTrack(request));
  ipcMain.handle('music:list', (_event, dir?: string) => listTracks(dir));
  ipcMain.handle('music:resolve-stream', (_event, url: string) => resolveStream(url));
  ipcMain.handle('music:read', (_event, filePath: string) => readTrack(filePath));
  ipcMain.handle('music:select-directory', async (_event, currentPath?: string) => {
    const win = getWindow();
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: t('选择音乐目录'),
      defaultPath: await resolveDir(currentPath),
      properties: ['openDirectory'],
    });
    return canceled ? null : filePaths[0] || null;
  });
}
