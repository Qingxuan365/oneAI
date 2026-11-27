import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { ipcMain } from 'electron';
import type { GitConflictDiffResult, GitConflictFilesResult } from '../shared/types';
import { t } from './i18n';

const runGit = promisify(execFile);
const options = { windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024 };

function errorMessage(error: unknown): string {
  if (error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()) return error.stderr.trim();
  return error instanceof Error ? error.message : String(error);
}

export async function listGitConflicts(dir: unknown): Promise<GitConflictFilesResult> {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) return { ok: false, error: t('无法读取 Git 冲突') };
  try {
    const { stdout } = await runGit('git', ['-C', dir, 'ls-files', '--unmerged', '-z'], options);
    const files = new Set<string>();
    for (const entry of stdout.split('\0')) {
      const tab = entry.indexOf('\t');
      if (tab !== -1) files.add(entry.slice(tab + 1));
    }
    return { ok: true, files: [...files] };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function readGitConflictDiff(dir: string, file: unknown): Promise<GitConflictDiffResult> {
  const conflicts = await listGitConflicts(dir);
  if (!conflicts.ok) return conflicts;
  if (typeof file !== 'string' || !conflicts.files.includes(file)) return { ok: false, error: t('该文件已不在冲突列表中') };
  try {
    const { stdout } = await runGit('git', [
      '-C', dir, '--no-pager', '--literal-pathspecs', 'diff', '--cc', '--no-ext-diff', '--no-textconv', '--no-color', '--relative', '--', file,
    ], options);
    return { ok: true, diff: stdout };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export function setupGitConflicts(): void {
  ipcMain.handle('git:list-conflicts', (_event, dir: unknown) => listGitConflicts(dir));
  ipcMain.handle('git:conflict-diff', (_event, dir: string, file: unknown) => readGitConflictDiff(dir, file));
}
