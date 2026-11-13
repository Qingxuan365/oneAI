import fs from 'node:fs';
import path from 'node:path';
import { ipcMain } from 'electron';

const MAX_PATHS = 64;
const MAX_DEPTH = 30;

/**
 * 读取目录所在 Git 仓库的当前分支：从该目录向上找 `.git`，只读 HEAD，不执行 git 命令。
 * 兼容 worktree / 子模块（`.git` 是指向 gitdir 的文件）；游离 HEAD 返回 7 位提交号；不在仓库内返回 null。
 */
export function readGitBranch(dir: string): string | null {
  let current = path.resolve(dir);
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const dotGit = path.join(current, '.git');
    let stat: fs.Stats | null = null;
    try { stat = fs.statSync(dotGit); } catch {}
    if (stat) {
      try {
        let gitDir = dotGit;
        if (stat.isFile()) {
          const match = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m);
          if (!match) return null;
          gitDir = path.resolve(current, match[1].trim());
        }
        const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
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

export function readGitBranches(paths: unknown): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  if (!Array.isArray(paths)) return result;
  for (const item of paths.slice(0, MAX_PATHS)) {
    if (typeof item === 'string' && path.isAbsolute(item)) result[item] = readGitBranch(item);
  }
  return result;
}

export function setupGitBranch(): void {
  ipcMain.handle('git:branches', (_event, paths: unknown) => readGitBranches(paths));
}
