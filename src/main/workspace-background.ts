import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { WorkspaceBackgroundImageResult } from '../shared/types';
import { t } from './i18n';

export const MAX_BACKGROUND_IMAGE_BYTES = 15 * 1024 * 1024;

export const BACKGROUND_IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

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
    const stat = await fs.promises.stat(resolved);
    if (!stat.isFile()) return { ok: false, error: t('所选路径不是有效文件') };
    if (stat.size > MAX_BACKGROUND_IMAGE_BYTES) {
      return { ok: false, error: t('图片超过 15 MB 上限，请选择更小的图片') };
    }
    const bytes = await fs.promises.readFile(resolved);
    return {
      ok: true,
      path: resolved,
      dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
    };
  } catch {
    return { ok: false, error: t('无法读取背景图片文件') };
  }
}

export function setupWorkspaceBackground(getWindow: () => BrowserWindow | null) {
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
