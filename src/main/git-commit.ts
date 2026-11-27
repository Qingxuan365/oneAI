import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ipcMain } from 'electron';
import type {
  GitChangeDiffResult,
  GitChangeStatus,
  GitCommitResult,
  GitStatusEntry,
  GitStatusResult,
} from '../shared/types';
import { readGitBranch } from './git-branch';
import { t } from './i18n';

const runGitFile = promisify(execFile);
const MAX_STATUS_ENTRIES = 1000;
const MAX_UNTRACKED_DIFF_BYTES = 512 * 1024;
const GIT_READ_OPTS = { windowsHide: true, timeout: 10_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' as const };
const GIT_COMMIT_TIMEOUT_MS = 60_000;

function gitErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : '';
    if (stderr) return stderr;
    const stdout = 'stdout' in error && typeof error.stdout === 'string' ? error.stdout.trim() : '';
    if (stdout) return stdout;
    return error.message;
  }
  return String(error);
}

function classifyStatus(indexStatus: string, worktreeStatus: string): GitChangeStatus {
  if (
    indexStatus === 'U'
    || worktreeStatus === 'U'
    || (indexStatus === 'A' && worktreeStatus === 'A')
    || (indexStatus === 'D' && worktreeStatus === 'D')
  ) {
    return 'conflicted';
  }
  if (indexStatus === '?' && worktreeStatus === '?') return 'untracked';
  if (indexStatus === 'R' || worktreeStatus === 'R') return 'renamed';
  if (indexStatus === 'D' || worktreeStatus === 'D') return 'deleted';
  if (indexStatus === 'A' || worktreeStatus === 'A' || indexStatus === 'C' || worktreeStatus === 'C') return 'added';
  return 'modified';
}

export function parseGitStatusPorcelain(stdout: string): { entries: GitStatusEntry[]; hasConflicts: boolean } {
  const tokens = stdout.split('\0');
  const entries: GitStatusEntry[] = [];
  let hasConflicts = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.length < 4 || token[2] !== ' ') continue;
    const indexStatus = token[0];
    const worktreeStatus = token[1];
    if (indexStatus === '!' && worktreeStatus === '!') continue;

    const filePath = token.slice(3);
    let originalPath: string | undefined;
    if (indexStatus === 'R' || indexStatus === 'C' || worktreeStatus === 'R' || worktreeStatus === 'C') {
      const next = tokens[i + 1];
      if (next) {
        originalPath = next;
        i++;
      }
    }

    const status = classifyStatus(indexStatus, worktreeStatus);
    if (status === 'conflicted') hasConflicts = true;
    entries.push({
      path: filePath,
      ...(originalPath ? { originalPath } : {}),
      indexStatus,
      worktreeStatus,
      status,
    });
  }

  // Conflicts first, then natural path order for predictable review
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  entries.sort((a, b) => {
    if (a.status === 'conflicted' && b.status !== 'conflicted') return -1;
    if (a.status !== 'conflicted' && b.status === 'conflicted') return 1;
    return collator.compare(a.path, b.path);
  });

  return { entries, hasConflicts };
}

async function resolveRepoRoot(dir: string): Promise<string> {
  const { stdout } = await runGitFile('git', ['-C', dir, 'rev-parse', '--show-toplevel'], GIT_READ_OPTS);
  const top = stdout.trim();
  if (!top) throw new Error(t('当前目录不是 Git 仓库'));
  return path.resolve(top);
}

async function repoHasHead(repoRoot: string): Promise<boolean> {
  try {
    await runGitFile('git', ['-C', repoRoot, 'rev-parse', '--verify', '--quiet', 'HEAD'], GIT_READ_OPTS);
    return true;
  } catch {
    return false;
  }
}

function runGitWithStdin(args: string[], stdinText: string, timeoutMs = GIT_COMMIT_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      reject(new Error(t('Git 操作超时，请检查是否有等待输入的钩子或凭据提示')));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err = new Error(stderr.trim() || stdout.trim() || `git exited with code ${code ?? 'unknown'}`) as Error & { stdout?: string; stderr?: string };
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });

    child.stdin.on('error', () => {});
    child.stdin.end(stdinText, 'utf8');
  });
}

async function buildUntrackedDiff(repoRoot: string, relPath: string): Promise<string> {
  const fullPath = path.join(repoRoot, relPath);
  const stat = await fs.promises.lstat(fullPath);
  if (stat.isSymbolicLink()) {
    const target = await fs.promises.readlink(fullPath);
    return `--- /dev/null\n+++ b/${relPath}\n@@ -0,0 +1,1 @@\n+${target}\n`;
  }
  if (!stat.isFile() || stat.size > MAX_UNTRACKED_DIFF_BYTES) return '';
  const buf = await fs.promises.readFile(fullPath);
  const probeLen = Math.min(buf.length, 8192);
  for (let i = 0; i < probeLen; i++) {
    if (buf[i] === 0) return '';
  }
  if (buf.length === 0) return `--- /dev/null\n+++ b/${relPath}\n`;
  const text = buf.toString('utf8').replace(/\r\n/g, '\n');
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  const header = `--- /dev/null\n+++ b/${relPath}\n@@ -0,0 +1,${lines.length} @@\n`;
  return header + lines.map((line) => `+${line}`).join('\n') + '\n';
}

export async function readGitStatus(dir: unknown): Promise<GitStatusResult> {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
    return { ok: false, error: t('无法读取 Git 状态') };
  }
  try {
    const repoRoot = await resolveRepoRoot(dir);
    const [{ stdout }, branch] = await Promise.all([
      runGitFile('git', ['-C', repoRoot, 'status', '--porcelain=v1', '-z', '-uall'], GIT_READ_OPTS),
      readGitBranch(repoRoot),
    ]);
    const { entries, hasConflicts } = parseGitStatusPorcelain(stdout);
    const truncated = entries.length > MAX_STATUS_ENTRIES;
    return {
      ok: true,
      branch,
      entries: truncated ? entries.slice(0, MAX_STATUS_ENTRIES) : entries,
      hasConflicts,
      ...(truncated ? { truncated: true, totalCount: entries.length } : {}),
    };
  } catch (error) {
    return { ok: false, error: gitErrorMessage(error) };
  }
}

export async function readGitChangeDiff(dir: unknown, file: unknown): Promise<GitChangeDiffResult> {
  if (typeof dir !== 'string' || !path.isAbsolute(dir) || typeof file !== 'string' || !file) {
    return { ok: false, error: t('无法读取 Git 差异') };
  }
  const status = await readGitStatus(dir);
  if (!status.ok) return status;
  const entry = status.entries.find((item) => item.path === file);
  if (!entry) return { ok: false, error: t('该文件已不在变更列表中') };

  try {
    const repoRoot = await resolveRepoRoot(dir);
    if (entry.status === 'untracked') {
      const diff = await buildUntrackedDiff(repoRoot, entry.path);
      return { ok: true, diff };
    }

    const pathspecs = entry.originalPath ? [entry.originalPath, entry.path] : [entry.path];
    if (entry.status === 'conflicted') {
      const { stdout } = await runGitFile('git', [
        '-C', repoRoot, '-c', 'core.quotepath=false', '--no-pager', '--literal-pathspecs',
        'diff', '--cc', '--no-ext-diff', '--no-textconv', '--no-color', '--', ...pathspecs,
      ], GIT_READ_OPTS);
      return { ok: true, diff: stdout };
    }

    const hasHead = await repoHasHead(repoRoot);
    if (hasHead) {
      const { stdout } = await runGitFile('git', [
        '-C', repoRoot, '-c', 'core.quotepath=false', '--no-pager', '--literal-pathspecs',
        'diff', 'HEAD', '--no-ext-diff', '--no-textconv', '--no-color', '--', ...pathspecs,
      ], GIT_READ_OPTS);
      return { ok: true, diff: stdout };
    }

    // Initial commit (unborn HEAD): show staged diff and fall back to worktree file if needed
    const { stdout: cached } = await runGitFile('git', [
      '-C', repoRoot, '-c', 'core.quotepath=false', '--no-pager', '--literal-pathspecs',
      'diff', '--cached', '--no-ext-diff', '--no-textconv', '--no-color', '--', ...pathspecs,
    ], GIT_READ_OPTS);
    if (cached) {
      if (entry.worktreeStatus !== ' ') {
        const { stdout: unstaged } = await runGitFile('git', [
          '-C', repoRoot, '-c', 'core.quotepath=false', '--no-pager', '--literal-pathspecs',
          'diff', '--no-ext-diff', '--no-textconv', '--no-color', '--', ...pathspecs,
        ], GIT_READ_OPTS);
        if (unstaged) return { ok: true, diff: `${cached}\n${unstaged}` };
      }
      return { ok: true, diff: cached };
    }
    const fallback = await buildUntrackedDiff(repoRoot, entry.path);
    return { ok: true, diff: fallback };
  } catch (error) {
    return { ok: false, error: gitErrorMessage(error) };
  }
}

export async function commitGitChanges(dir: unknown, files: unknown, message: unknown): Promise<GitCommitResult> {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) {
    return { ok: false, error: t('Git 提交失败') };
  }
  if (typeof message !== 'string' || !message.trim()) {
    return { ok: false, error: t('请输入提交说明') };
  }
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, error: t('请至少选择一个要提交的文件') };
  }

  const normalizedMessage = message.replace(/\r\n/g, '\n').trim();
  const status = await readGitStatus(dir);
  if (!status.ok) return status;
  if (status.hasConflicts) {
    return { ok: false, error: t('当前存在未解决的 Git 冲突，请先解决冲突后再提交') };
  }
  if (status.entries.length === 0) {
    return { ok: false, error: t('当前没有可提交的改动') };
  }

  const byPath = new Map(status.entries.map((entry) => [entry.path, entry]));
  const selectedEntries: GitStatusEntry[] = [];
  const seen = new Set<string>();
  for (const item of files) {
    if (typeof item !== 'string' || seen.has(item)) continue;
    const matched = byPath.get(item);
    if (!matched) {
      return { ok: false, error: t('选中的文件已发生变化，请刷新后再试') };
    }
    seen.add(item);
    selectedEntries.push(matched);
  }
  if (selectedEntries.length === 0) {
    return { ok: false, error: t('请至少选择一个要提交的文件') };
  }

  const selectedPathspecs = Array.from(new Set(
    selectedEntries.flatMap((entry) => entry.originalPath ? [entry.originalPath, entry.path] : [entry.path]),
  ));
  const unselectedEntries = status.entries.filter((entry) => !seen.has(entry.path));
  const allSelected = unselectedEntries.length === 0 && !status.truncated;

  try {
    const repoRoot = await resolveRepoRoot(dir);
    const hasHead = await repoHasHead(repoRoot);

    if (allSelected) {
      await runGitFile('git', [
        '-C', repoRoot, '--literal-pathspecs', 'add', '-A', '--', ...selectedPathspecs,
      ], GIT_READ_OPTS);
      await runGitWithStdin(['-C', repoRoot, 'commit', '-F', '-'], normalizedMessage);
    } else if (hasHead) {
      // Stage intent-to-add only for selected untracked files, then commit --only so pre-existing
      // staged changes on unselected files stay untouched in the index.
      const untrackedSelected = selectedEntries
        .filter((entry) => entry.status === 'untracked')
        .map((entry) => entry.path);
      if (untrackedSelected.length > 0) {
        await runGitFile('git', [
          '-C', repoRoot, '--literal-pathspecs', 'add', '--intent-to-add', '--', ...untrackedSelected,
        ], GIT_READ_OPTS);
      }
      try {
        await runGitWithStdin(
          ['-C', repoRoot, '--literal-pathspecs', 'commit', '--only', '-F', '-', '--', ...selectedPathspecs],
          normalizedMessage,
        );
      } catch (error) {
        if (untrackedSelected.length > 0) {
          await runGitFile('git', [
            '-C', repoRoot, '--literal-pathspecs', 'reset', '--', ...untrackedSelected,
          ], GIT_READ_OPTS).catch(() => {});
        }
        throw error;
      }
    } else {
      // Unborn HEAD (initial commit): git does not allow `commit --only -- <paths>`.
      // Temporarily unstage any pre-staged unselected files, commit the selection, then re-stage them.
      const unselectedStaged = Array.from(new Set(
        unselectedEntries
          .filter((entry) => entry.indexStatus !== ' ' && entry.indexStatus !== '?')
          .flatMap((entry) => entry.originalPath ? [entry.originalPath, entry.path] : [entry.path]),
      ));
      const newlyAddedSelected = selectedEntries
        .filter((entry) => entry.status === 'untracked')
        .map((entry) => entry.path);
      if (unselectedStaged.length > 0) {
        await runGitFile('git', [
          '-C', repoRoot, '--literal-pathspecs', 'rm', '--cached', '--quiet', '-r', '--', ...unselectedStaged,
        ], GIT_READ_OPTS);
      }
      try {
        await runGitFile('git', [
          '-C', repoRoot, '--literal-pathspecs', 'add', '-A', '--', ...selectedPathspecs,
        ], GIT_READ_OPTS);
        await runGitWithStdin(['-C', repoRoot, 'commit', '-F', '-'], normalizedMessage);
      } catch (error) {
        if (newlyAddedSelected.length > 0) {
          await runGitFile('git', [
            '-C', repoRoot, '--literal-pathspecs', 'rm', '--cached', '--quiet', '-r', '--', ...newlyAddedSelected,
          ], GIT_READ_OPTS).catch(() => {});
        }
        throw error;
      } finally {
        if (unselectedStaged.length > 0) {
          await runGitFile('git', [
            '-C', repoRoot, '--literal-pathspecs', 'add', '--', ...unselectedStaged,
          ], GIT_READ_OPTS).catch(() => {});
        }
      }
    }

    const { stdout } = await runGitFile('git', [
      '-C', repoRoot, 'log', '-1', '--format=%h%x09%s',
    ], GIT_READ_OPTS);
    const [hash = '', summary = ''] = stdout.trim().split('\t');
    return { ok: true, hash, summary };
  } catch (error) {
    return { ok: false, error: gitErrorMessage(error) };
  }
}

export function setupGitCommit(): void {
  ipcMain.handle('git:status', (_event, dir: unknown) => readGitStatus(dir));
  ipcMain.handle('git:change-diff', (_event, dir: unknown, file: unknown) => readGitChangeDiff(dir, file));
  ipcMain.handle('git:commit', (_event, dir: unknown, files: unknown, message: unknown) => commitGitChanges(dir, files, message));
}
