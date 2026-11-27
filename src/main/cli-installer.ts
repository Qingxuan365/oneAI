import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { BrowserWindow, ipcMain } from 'electron';
import type {
  CliEnvironmentInfo,
  CliInstallBatchResult,
  CliInstallEvent,
  CliInstallOutcome,
  KnownCliInfo,
} from '../shared/types';
import { detectGitInstalled, detectInstalledClis, detectNodeInstalled, listKnownClis, refreshProcessPath } from './cli-detect';
import { t } from './i18n';

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

/** 从已知 CLI 清单里按请求顺序筛选可自动安装的项，并去重；拒绝任何未登记的 id */
export function selectInstallableClis(
  cliIds: unknown,
  knownClis: readonly KnownCliInfo[] = listKnownClis(),
): Array<KnownCliInfo & { installer: NonNullable<KnownCliInfo['installer']> }> {
  if (!Array.isArray(cliIds)) return [];
  const byId = new Map<string, KnownCliInfo & { installer: NonNullable<KnownCliInfo['installer']> }>();
  for (const cli of knownClis) {
    if (cli.installer?.powershellCommand) {
      byId.set(cli.id, cli as KnownCliInfo & { installer: NonNullable<KnownCliInfo['installer']> });
    }
  }
  const seen = new Set<string>();
  const selected: Array<KnownCliInfo & { installer: NonNullable<KnownCliInfo['installer']> }> = [];
  for (const rawId of cliIds) {
    if (typeof rawId !== 'string' || seen.has(rawId)) continue;
    const match = byId.get(rawId);
    if (!match) continue;
    seen.add(rawId);
    selected.push(match);
  }
  return selected;
}

/** 清理 PowerShell 进度/转义控制序列，保证前端纯文本安装日志可读 */
export function cleanInstallLogChunk(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function killChildTree(child: ChildProcess | null): void {
  if (!child || child.killed) return;
  const pid = child.pid;
  try {
    child.kill();
  } catch {}
  if (process.platform === 'win32' && typeof pid === 'number' && pid > 0) {
    execFile('taskkill.exe', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, timeout: 4000 }, () => {});
  }
}

class CliInstallerService {
  private running = false;
  private canceled = false;
  private activeChild: ChildProcess | null = null;
  private getWindow: () => BrowserWindow | null = () => null;

  public setWindowGetter(getWindow: () => BrowserWindow | null): void {
    this.getWindow = getWindow;
  }

  private emit(event: CliInstallEvent): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send('cli:install-event', event);
  }

  public cancel(): boolean {
    if (!this.running) return false;
    this.canceled = true;
    killChildTree(this.activeChild);
    return true;
  }

  public async getEnvironmentInfo(): Promise<CliEnvironmentInfo> {
    const [hasGit, node] = await Promise.all([detectGitInstalled(), detectNodeInstalled()]);
    return {
      hasGit,
      hasNode: node.hasNode,
      ...(node.nodeVersion ? { nodeVersion: node.nodeVersion } : {}),
      platform: process.platform,
    };
  }

  public async installBatch(cliIds: unknown): Promise<CliInstallBatchResult> {
    if (this.running) {
      return { ok: false, error: t('已有 CLI 安装任务正在进行，请等待完成或先停止当前安装。') };
    }
    if (process.platform !== 'win32') {
      return { ok: false, error: t('当前仅支持在 Windows 上自动安装 CLI。') };
    }
    const queue = selectInstallableClis(cliIds);
    if (queue.length === 0) {
      return { ok: false, error: t('未选择可自动安装的 CLI。') };
    }

    this.running = true;
    this.canceled = false;
    const results: Record<string, CliInstallOutcome> = {};

    try {
      for (const cli of queue) {
        this.emit({ type: 'status', cliId: cli.id, status: 'queued' });
      }

      // 先刷新一次最新系统 PATH，避免误把用户刚在外部装好的 CLI 重装一遍
      let installedNow = new Set((await detectInstalledClis([], { refreshPath: true })).map((item) => item.id));

      for (const cli of queue) {
        if (this.canceled) {
          results[cli.id] = { ok: false, canceled: true };
          this.emit({ type: 'status', cliId: cli.id, status: 'canceled' });
          continue;
        }
        if (installedNow.has(cli.id)) {
          results[cli.id] = { ok: true, alreadyInstalled: true, detectedAfterInstall: true };
          this.emit({ type: 'status', cliId: cli.id, status: 'done', detectedAfterInstall: true });
          continue;
        }

        this.emit({ type: 'status', cliId: cli.id, status: 'installing' });
        this.emit({ type: 'log', cliId: cli.id, chunk: `> ${cli.installer.powershellCommand}\n` });

        const outcome = await this.runWindowsInstaller(cli.id, cli.installer.powershellCommand);
        if (this.canceled) {
          results[cli.id] = { ok: false, canceled: true };
          this.emit({ type: 'status', cliId: cli.id, status: 'canceled' });
          continue;
        }

        await refreshProcessPath();
        installedNow = new Set((await detectInstalledClis()).map((item) => item.id));
        const detectedAfterInstall = installedNow.has(cli.id);

        if (outcome.ok) {
          results[cli.id] = { ok: true, detectedAfterInstall };
          this.emit({ type: 'status', cliId: cli.id, status: 'done', detectedAfterInstall });
        } else {
          const message = outcome.error || t('安装脚本执行失败（退出码 {code}）', { code: outcome.exitCode ?? -1 });
          results[cli.id] = { ok: false, detectedAfterInstall, error: message };
          this.emit({ type: 'status', cliId: cli.id, status: 'error', error: message, detectedAfterInstall });
        }
      }

      const installedIds = [...installedNow];
      this.emit({ type: 'complete', results, installedIds });
      return { ok: true, results, installedIds };
    } finally {
      this.activeChild = null;
      this.running = false;
      this.canceled = false;
    }
  }

  private runWindowsInstaller(cliId: string, powershellCommand: string): Promise<{ ok: boolean; exitCode: number | null; error?: string }> {
    return new Promise((resolve) => {
      // 串行执行官方 PowerShell 脚本：启用 TLS 1.2、强制 UTF-8 输出、隐藏进度条杂讯，并把失败退出码原样传回
      const wrapped = [
        '$ProgressPreference = "SilentlyContinue"',
        '$ErrorActionPreference = "Stop"',
        '[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '$OutputEncoding = [System.Text.Encoding]::UTF8',
        '$global:LASTEXITCODE = $null',
        powershellCommand,
        'if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
      ].join('\n');

      let settled = false;
      let timedOut = false;
      const finish = (value: { ok: boolean; exitCode: number | null; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.activeChild === child) this.activeChild = null;
        resolve(value);
      };

      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', wrapped],
        {
          windowsHide: true,
          env: { ...process.env },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      this.activeChild = child;

      const timer = setTimeout(() => {
        timedOut = true;
        killChildTree(child);
        finish({ ok: false, exitCode: null, error: t('安装超时，请检查网络连接或代理设置后重试。') });
      }, INSTALL_TIMEOUT_MS);

      const handleChunk = (buf: Buffer) => {
        const cleaned = cleanInstallLogChunk(buf.toString('utf8'));
        if (cleaned) this.emit({ type: 'log', cliId, chunk: cleaned });
      };

      child.stdout?.on('data', handleChunk);
      child.stderr?.on('data', handleChunk);
      child.on('error', (error) => {
        finish({ ok: false, exitCode: null, error: error.message });
      });
      child.on('close', (code) => {
        if (timedOut) return;
        if (this.canceled) {
          finish({ ok: false, exitCode: code, error: t('安装已取消') });
          return;
        }
        if (code === 0) {
          finish({ ok: true, exitCode: 0 });
        } else {
          finish({ ok: false, exitCode: code });
        }
      });
    });
  }
}

export const cliInstallerService = new CliInstallerService();

export function setupCliInstaller(getWindow: () => BrowserWindow | null): void {
  cliInstallerService.setWindowGetter(getWindow);
  ipcMain.handle('cli:env-info', () => cliInstallerService.getEnvironmentInfo());
  ipcMain.handle('cli:install', (_event, cliIds: unknown) => cliInstallerService.installBatch(cliIds));
  ipcMain.handle('cli:install-cancel', () => cliInstallerService.cancel());
}
