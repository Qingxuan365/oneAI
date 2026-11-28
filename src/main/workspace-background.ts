import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { WorkspaceBackgroundImageResult } from '../shared/types';
import { isSamePath } from './fs-utils';
import { t } from './i18n';

export const MAX_BACKGROUND_IMAGE_BYTES = 15 * 1024 * 1024;
export const BACKGROUND_SCHEME = 'oneai-bg';

export const BACKGROUND_IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

let allowedBackgroundRealPath = '';
let allowedBackgroundMime = '';
let protocolHandlerRegistered = false;

/** 须在 app.whenReady() 前调用：允许通过只读流式协议加载已授权的工作区壁纸，避免 15 MB 原图转 20 MB Base64 常驻内存 */
export function registerBackgroundScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: BACKGROUND_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  }]);
}

export async function readWorkspaceBackgroundImage(filePath: unknown): Promise<WorkspaceBackgroundImageResult> {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { ok: false, error: t('图片路径无效') };
  }
  const resolved = path.resolve(filePath.trim());
  const mime = BACKGROUND_IMAGE_MIME[path.extname(resolved).toLowerCase()];
  if (!mime) {
    return { ok: false, error: t('不支持的图片格式') };
  }
  try {
    const real = await fs.promises.realpath(resolved);
    const actualMime = BACKGROUND_IMAGE_MIME[path.extname(real).toLowerCase()] ?? mime;
    const stat = await fs.promises.stat(real);
    if (!stat.isFile()) return { ok: false, error: t('所选路径不是有效文件') };
    if (stat.size > MAX_BACKGROUND_IMAGE_BYTES) {
      return { ok: false, error: t('图片超过 15 MB 上限，请选择更小的图片') };
    }
    allowedBackgroundRealPath = real;
    allowedBackgroundMime = actualMime;
    if (protocolHandlerRegistered) {
      return {
        ok: true,
        path: resolved,
        dataUrl: `${BACKGROUND_SCHEME}://wallpaper/current?v=${Math.trunc(stat.mtimeMs)}-${stat.size}`,
      };
    }
    const bytes = await fs.promises.readFile(real);
    return {
      ok: true,
      path: resolved,
      dataUrl: `data:${actualMime};base64,${bytes.toString('base64')}`,
    };
  } catch {
    return { ok: false, error: t('无法读取背景图片文件') };
  }
}

export function setupWorkspaceBackground(getWindow: () => BrowserWindow | null) {
  if (typeof protocol?.handle === 'function' && !protocolHandlerRegistered) {
    protocol.handle(BACKGROUND_SCHEME, async () => {
      if (!allowedBackgroundRealPath || !allowedBackgroundMime) {
        return new Response('Not Found', { status: 404 });
      }
      try {
        const real = await fs.promises.realpath(allowedBackgroundRealPath);
        if (!isSamePath(real, allowedBackgroundRealPath)) {
          return new Response('Forbidden', { status: 403 });
        }
        const stat = await fs.promises.stat(real);
        if (!stat.isFile() || stat.size > MAX_BACKGROUND_IMAGE_BYTES) {
          return new Response('Not Found', { status: 404 });
        }
        const stream = fs.createReadStream(real);
        return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
          status: 200,
          headers: {
            'Content-Type': allowedBackgroundMime,
            'Content-Length': String(stat.size),
            'Cache-Control': 'private, max-age=3600',
          },
        });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    });
    protocolHandlerRegistered = true;
  }

  ipcMain.handle('workspace:select-background-image', async (_event, currentPath?: unknown): Promise<WorkspaceBackgroundImageResult> => {
    const win = getWindow();
    if (!win) return { ok: false, canceled: true };
    let defaultPath = app.getPath('pictures');
    if (typeof currentPath === 'string' && currentPath.trim()) {
      const candidate = path.dirname(path.resolve(currentPath.trim()));
      if (fs.existsSync(candidate)) defaultPath = candidate;
    }
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: t('选择工作区背景图片'),
      defaultPath,
      properties: ['openFile'],
      filters: [
        { name: t('图片文件'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] },
      ],
    });
    if (canceled || !filePaths[0]) return { ok: false, canceled: true };
    return readWorkspaceBackgroundImage(filePaths[0]);
  });

  ipcMain.handle('workspace:read-background-image', (_event, filePath: unknown) =>
    readWorkspaceBackgroundImage(filePath));
}
