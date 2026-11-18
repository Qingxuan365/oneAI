import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isPathInside, isSamePath, normalizePathKey } from './fs-utils';
import type { FilePreviewResult } from '../shared/types';
import { t } from './i18n';

export type { FilePreviewResult };

const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** 用户亲手拖进或粘贴进终端的图片：本次运行内允许预览（只记图片的真实路径归一化键，不开放其所在目录） */
const allowedImages = new Set<string>();

export function isImageExtension(filePath: string): boolean {
  return Boolean(IMAGE_MIME[path.extname(filePath).toLowerCase()]);
}

export async function allowPreviewFilePaths(paths: unknown): Promise<boolean> {
  await Promise.all((Array.isArray(paths) ? paths.slice(0, 50) : []).map(async (item) => {
    try {
      const real = await fs.promises.realpath(path.resolve(String(item)));
      if ((await fs.promises.stat(real)).isFile() && isImageExtension(real)) {
        allowedImages.add(normalizePathKey(real));
      }
    } catch { /* 不存在或无权限的路径忽略 */ }
  }));
  return true;
}

async function safeRealpath(target: string): Promise<string | null> {
  try { return await fs.promises.realpath(target); } catch { return null; }
}

function isInsideOrSame(root: string, target: string): boolean {
  return isSamePath(root, target) || isPathInside(root, target);
}

async function resolveWithRoots(
  root: string | null,
  pasteDir: string | null,
  candidate: string,
): Promise<string | null> {
  if (!root) return null;
  try {
    const target = await fs.promises.realpath(path.resolve(root, String(candidate || '')));
    const stat = await fs.promises.stat(target);
    if (!stat.isFile()) return null;
    if (isInsideOrSame(root, target)) return target;
    if (allowedImages.has(normalizePathKey(target))) return target;
    return pasteDir && isInsideOrSame(pasteDir, target) && isImageExtension(target) ? target : null;
  } catch {
    return null;
  }
}

/**
 * 把候选路径解析为 cwd 内真实存在的文件；越界、不存在或不是文件时返回 null。
 * 例外：OneAI 自己写入的粘贴截图目录（%TEMP%/OneAI_Images）里的图片，或用户拖入 / 粘贴的图片文件也允许预览，其他位置一律拒绝。
 */
export async function resolveInside(cwd: string, candidate: string): Promise<string | null> {
  const [root, pasteDir] = await Promise.all([
    safeRealpath(path.resolve(String(cwd || ''))),
    safeRealpath(path.join(app.getPath('temp'), 'OneAI_Images')),
  ]);
  return resolveWithRoots(root, pasteDir, candidate);
}

export async function readPreview(cwd: string, candidate: string): Promise<FilePreviewResult> {
  const target = await resolveInside(cwd, candidate);
  if (!target) return { kind: 'error', path: String(candidate), message: t('文件不存在，或不在当前任务工作目录内') };
  try {
    const { size } = await fs.promises.stat(target);
    const mime = IMAGE_MIME[path.extname(target).toLowerCase()];
    if (mime) {
      if (size > MAX_IMAGE_BYTES) return { kind: 'too-large', path: target, size };
      const bytes = await fs.promises.readFile(target);
      return { kind: 'image', path: target, size, dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
    }
    if (size > MAX_TEXT_BYTES) return { kind: 'too-large', path: target, size };
    const buffer = await fs.promises.readFile(target);
    if (buffer.subarray(0, 8192).includes(0)) return { kind: 'binary', path: target, size };
    return { kind: 'text', path: target, size, content: buffer.toString('utf8') };
  } catch (error) {
    return { kind: 'error', path: target, message: error instanceof Error ? error.message : String(error) };
  }
}

export function setupFilePreview() {
  ipcMain.handle('preview:resolve', async (_event, cwd: string, candidates: unknown) => {
    const list = Array.isArray(candidates) ? candidates.slice(0, 20) : [];
    if (list.length === 0) return [];
    const [root, pasteDir] = await Promise.all([
      safeRealpath(path.resolve(String(cwd || ''))),
      safeRealpath(path.join(app.getPath('temp'), 'OneAI_Images')),
    ]);
    return Promise.all(list.map((item) => resolveWithRoots(root, pasteDir, String(item))));
  });
  ipcMain.handle('preview:allow-dropped', (_event, paths: unknown) => allowPreviewFilePaths(paths));
  ipcMain.handle('preview:read', (_event, cwd: string, filePath: string) => readPreview(cwd, filePath));
}
