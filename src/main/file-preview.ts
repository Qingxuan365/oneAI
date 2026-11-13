import { ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export type FilePreviewResult =
  | { kind: 'text'; path: string; size: number; content: string }
  | { kind: 'image'; path: string; size: number; dataUrl: string }
  | { kind: 'binary' | 'too-large' | 'error'; path: string; size?: number; message?: string };

/** 把候选路径解析为 cwd 内真实存在的文件；越界、不存在或不是文件时返回 null。 */
function resolveInside(cwd: string, candidate: string): string | null {
  try {
    const root = fs.realpathSync(path.resolve(String(cwd || '')));
    const target = fs.realpathSync(path.resolve(root, String(candidate || '')));
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return fs.statSync(target).isFile() ? target : null;
  } catch {
    return null;
  }
}

function readPreview(cwd: string, candidate: string): FilePreviewResult {
  const target = resolveInside(cwd, candidate);
  if (!target) return { kind: 'error', path: String(candidate), message: '文件不存在，或不在当前任务工作目录内' };
  try {
    const { size } = fs.statSync(target);
    const mime = IMAGE_MIME[path.extname(target).toLowerCase()];
    if (mime) {
      if (size > MAX_IMAGE_BYTES) return { kind: 'too-large', path: target, size };
      return { kind: 'image', path: target, size, dataUrl: `data:${mime};base64,${fs.readFileSync(target).toString('base64')}` };
    }
    if (size > MAX_TEXT_BYTES) return { kind: 'too-large', path: target, size };
    const buffer = fs.readFileSync(target);
    if (buffer.subarray(0, 8192).includes(0)) return { kind: 'binary', path: target, size };
    return { kind: 'text', path: target, size, content: buffer.toString('utf8') };
  } catch (error) {
    return { kind: 'error', path: target, message: error instanceof Error ? error.message : String(error) };
  }
}

export function setupFilePreview() {
  ipcMain.handle('preview:resolve', (_event, cwd: string, candidates: unknown) => {
    const list = Array.isArray(candidates) ? candidates.slice(0, 20) : [];
    return list.map((item) => resolveInside(cwd, String(item)));
  });
  ipcMain.handle('preview:read', (_event, cwd: string, filePath: string) => readPreview(cwd, filePath));
}
