import { ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { isPathInside, isSamePath } from './fs-utils';
import type { DirectoryListResult, DirectoryTreeEntry } from '../shared/types';
import { t } from './i18n';

export const MAX_DIR_ENTRIES = 500;

const DIMMED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  'build',
  'out',
  'release',
  'target',
  '.next',
  '.nuxt',
  '.vite',
  '.cache',
  '.turbo',
  '.tmp',
  '__pycache__',
  '.venv',
  'venv',
  'coverage',
  '.idea',
  '.vscode',
]);

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

async function safeRealpath(target: string): Promise<string | null> {
  try {
    return await fs.promises.realpath(target);
  } catch {
    return null;
  }
}

/**
 * 懒加载读取项目内指定子目录的直接子项：
 * 1. 严格限制在 rootPath 的 realpath 范围内，阻止路径穿越与指向项目外的符号链接；
 * 2. 跳过指向自身或祖先目录的符号链接，避免目录循环；
 * 3. 文件夹在前、文件在后并按自然序排序后再截断上限。
 */
export async function listProjectDirectory(
  rootPath: string,
  relDir = '',
  maxEntries = MAX_DIR_ENTRIES,
): Promise<DirectoryListResult> {
  const rawRoot = typeof rootPath === 'string' ? rootPath.trim() : '';
  if (!rawRoot) {
    return { ok: false, rootPath: '', dirPath: '', entries: [], error: t('目录不存在或无法访问') };
  }

  const realRoot = await safeRealpath(path.resolve(rawRoot));
  if (!realRoot) {
    return { ok: false, rootPath: rawRoot, dirPath: '', entries: [], error: t('目录不存在或无法访问') };
  }

  try {
    const rootStat = await fs.promises.stat(realRoot);
    if (!rootStat.isDirectory()) {
      return { ok: false, rootPath: realRoot, dirPath: realRoot, entries: [], error: t('目标不是文件夹') };
    }
  } catch {
    return { ok: false, rootPath: realRoot, dirPath: realRoot, entries: [], error: t('目录不存在或无法访问') };
  }

  const cleanRel = typeof relDir === 'string' ? relDir.replace(/^[\\/]+/, '') : '';
  const candidateDir = cleanRel ? path.resolve(realRoot, cleanRel) : realRoot;
  const realTarget = await safeRealpath(candidateDir);
  if (!realTarget || (!isSamePath(realRoot, realTarget) && !isPathInside(realRoot, realTarget))) {
    return { ok: false, rootPath: realRoot, dirPath: candidateDir, entries: [], error: t('目标目录超出当前项目范围') };
  }

  try {
    const targetStat = await fs.promises.stat(realTarget);
    if (!targetStat.isDirectory()) {
      return { ok: false, rootPath: realRoot, dirPath: realTarget, entries: [], error: t('目标不是文件夹') };
    }
  } catch {
    return { ok: false, rootPath: realRoot, dirPath: realTarget, entries: [], error: t('目录不存在或无法访问') };
  }

  let dirents: fs.Dirent[];
  try {
    dirents = await fs.promises.readdir(realTarget, { withFileTypes: true });
  } catch (error) {
    return {
      ok: false,
      rootPath: realRoot,
      dirPath: realTarget,
      entries: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const items: DirectoryTreeEntry[] = [];
  for (const dirent of dirents) {
    const entryFull = path.join(realTarget, dirent.name);
    let isDir = false;
    if (dirent.isDirectory()) {
      isDir = true;
    } else if (dirent.isFile()) {
      isDir = false;
    } else if (dirent.isSymbolicLink()) {
      const realEntry = await safeRealpath(entryFull);
      if (!realEntry) continue;
      if (!isPathInside(realRoot, realEntry)) continue;
      if (isSamePath(realEntry, realTarget) || isPathInside(realEntry, realTarget)) continue;
      try {
        const stat = await fs.promises.stat(realEntry);
        if (stat.isDirectory()) isDir = true;
        else if (!stat.isFile()) continue;
      } catch {
        continue;
      }
    } else {
      continue;
    }

    const relPath = path.relative(realRoot, entryFull).replace(/\\/g, '/');
    const dimmed = dirent.name.startsWith('.') || (isDir && DIMMED_DIR_NAMES.has(dirent.name.toLowerCase()));
    items.push({
      name: dirent.name,
      relPath,
      fullPath: entryFull,
      isDir,
      ...(dimmed ? { dimmed: true } : {}),
    });
  }

  items.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return naturalCollator.compare(a.name, b.name);
  });

  const limit = Math.max(1, Math.trunc(maxEntries));
  const totalCount = items.length;
  const truncated = totalCount > limit;
  const entries = truncated ? items.slice(0, limit) : items;

  return {
    ok: true,
    rootPath: realRoot,
    dirPath: realTarget,
    entries,
    ...(truncated ? { truncated: true, totalCount } : {}),
  };
}

export function setupProjectTree() {
  ipcMain.handle('fs:list-dir', (_event, rootPath: string, relDir?: string) => listProjectDirectory(rootPath, relDir));
}
