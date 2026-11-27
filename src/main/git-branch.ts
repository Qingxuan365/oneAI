import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ipcMain } from 'electron';
import type { GitBranchSwitchResult, GitLocalBranchesResult } from '../shared/types';
import { t } from './i18n';

const MAX_PATHS = 64;
const MAX_DEPTH = 30;
const runGit = promisify(execFile);

/**
 * 读取目录所在 Git 仓库的当前分支：从该目录向上找 `.git`，只读 HEAD，不执行 git 命令，使用异步 I/O 避免慢盘或网络路径阻塞主进程。
 * 兼容 worktree / 子模块（`.git` 是指向 gitdir 的文件）；游离 HEAD 返回 7 位提交号；不在仓库内返回 null。
 */
export async function readGitBranch(dir: string): Promise<string | null> {
  let current = path.resolve(dir);
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const dotGit = path.join(current, '.git');
    let stat: fs.Stats | null = null;
    try { stat = await fs.promises.stat(dotGit); } catch {}
    if (stat) {
      try {
        let gitDir = dotGit;
        if (stat.isFile()) {
          const match = (await fs.promises.readFile(dotGit, 'utf8')).match(/^gitdir:\s*(.+)$/m);
          if (!match) return null;
          gitDir = path.resolve(current, match[1].trim());
        }
        const head = (await fs.promises.readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim();
        const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
        if (ref) return ref[1];
        if (/^[0-9a-f]{40,64}$/i.test(head)) return head.slice(0, 7);
        return null;
      } catch {
        return null;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

export async function readGitBranches(paths: unknown): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  if (!Array.isArray(paths)) return result;
  const targets = paths.slice(0, MAX_PATHS).filter((item): item is string => typeof item === 'string' && path.isAbsolute(item));
  const branches = await Promise.all(targets.map((item) => readGitBranch(item)));
  targets.forEach((item, index) => { result[item] = branches[index]; });
  return result;
}

function gitErrorText(error: unknown): string {
  if (error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.trim()) {
    return error.stderr.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

export async function listLocalGitBranches(dir: unknown): Promise<GitLocalBranchesResult> {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) return { ok: false, error: t('无法读取本地 Git 分支') };
  try {
    const { stdout } = await runGit('git', [
      '-C', dir, 'for-each-ref', '--format=%(HEAD)%09%(refname:lstrip=2)', 'refs/heads/',
    ], { windowsHide: true, timeout: 8000 });
    const branches: string[] = [];
    let currentBranch: string | null = null;
    for (const line of stdout.split(/\r?\n/)) {
      const [head, branch] = line.split('\t');
      if (!branch) continue;
      branches.push(branch);
      if (head === '*') currentBranch = branch;
    }
    return { ok: true, branches, currentBranch };
  } catch (error) {
    return { ok: false, error: gitErrorText(error) };
  }
}

export async function switchLocalGitBranch(dir: string, branch: unknown): Promise<GitBranchSwitchResult> {
  const local = await listLocalGitBranches(dir);
  if (!local.ok) return local;
  if (typeof branch !== 'string' || !local.branches.includes(branch)) return { ok: false, error: t('本地 Git 分支不存在') };
  if (branch === local.currentBranch) return { ok: true };
  try {
    await runGit('git', [
      '-C', dir, 'switch', '--quiet', '--no-guess', '--no-overwrite-ignore', '--no-recurse-submodules', '--', branch,
    ], { windowsHide: true });
    return { ok: true };
  } catch (error) {
    // A failed post-checkout hook can leave the requested branch checked out.
    const currentBranch = await readGitBranch(dir);
    return { ok: false, error: gitErrorText(error), ...(currentBranch === branch ? { currentBranch } : {}) };
  }
}

export function setupGitBranch(): void {
  ipcMain.handle('git:branches', (_event, paths: unknown) => readGitBranches(paths));
  ipcMain.handle('git:list-local-branches', (_event, dir: unknown) => listLocalGitBranches(dir));
  ipcMain.handle('git:switch-local-branch', (_event, dir: string, branch: unknown) => switchLocalGitBranch(dir, branch));
}
