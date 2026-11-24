import { spawnPty, shutdownPtyWorker, PtyProcess } from './pty-worker';
import { BrowserWindow } from 'electron';
import * as os from 'node:os';
import fs from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { buildAccountEnv, SessionAccount } from './account-env';
import { setBoundedMap } from './fs-utils';
import { SessionCreateResult, SessionSnapshot } from '../shared/types';
import { t } from './i18n';

export interface CreateSessionOptions {
  id: string;
  command?: string;
  cwd?: string;
  shell?: boolean; // 自定义 CLI：整条命令交给 PowerShell 解析，兼容 .cmd / .ps1 启动器与带参数的命令
  account?: SessionAccount; // 多账号：按账号的配置目录注入 CODEX_HOME / CLAUDE_CONFIG_DIR / KIMI_CODE_HOME；重启时同步最新配置
  cols?: number;
  rows?: number;
}

interface SessionBuffer {
  chunks: string[];
  length: number;
}

const MAX_SESSION_BUFFER_LENGTH = 2 * 1024 * 1024;
const TARGET_BUFFER_CHUNK_LENGTH = 8 * 1024;
const MAX_EXITED_RECORDS = 200;

const BATCH_WINDOW_MS = 8;
const BACKGROUND_BATCH_WINDOW_MS = 120;

/**
 * Windows 下终止 PTY 会话及其整棵子进程树：
 * 1. node-pty 在收到首个输出字节前 _isReady 为 false，直接调用 session.kill() 会被挂入延迟队列而不生效；
 * 2. useConptyDll（Pi 会话）及 CLI 以 windowsHide 拉起的后台子进程（如 MCP Server）不在控制台进程枚举内；
 * 因此通过 taskkill /T /F 按根 PID 兜底清理整棵进程树。退出阶段使用同步短超时确保子进程不残留。
 */
function killProcessTree(session: PtyProcess, sync = false): void {
  const pid = session.pid;
  try {
    session.kill();
  } catch {
    // ignore
  }
  if (os.platform() === 'win32' && typeof pid === 'number' && pid > 0) {
    if (sync) {
      try {
        execFileSync('taskkill.exe', ['/T', '/F', '/PID', String(pid)], {
          windowsHide: true,
          stdio: 'ignore',
          timeout: 3000,
        });
      } catch {
        // 进程已自然退出时忽略
      }
    } else {
      execFile('taskkill.exe', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, timeout: 5000 }, () => {});
    }
  }
}

/**
 * 按会话合并 PTY 输出再发 IPC。先发一次再合并：前台活动会话距上次发送已超过合并窗口的数据立即发出，
 * 打字回显不额外等待；后台隐藏会话放宽合并窗口以大幅减少高频刷屏时的跨进程拷贝次数。
 * 每次发送附带该批次末尾的单调递增序号 seq，供渲染进程与快照缓冲去重对齐。
 */
export class PtyOutputBatcher {
  private pending = new Map<string, { chunks: string[]; bytes: number; seq: number; timer: NodeJS.Timeout }>();
  private lastSent = new Map<string, number>();
  private activeId: string | null = null;
  private activeKnown = false;

  constructor(private send: (id: string, data: string, seq: number) => void) {}

  public setActive(id: string | null): void {
    this.activeKnown = true;
    this.activeId = id;
    if (id) this.flush(id);
  }

  public push(id: string, data: string, baseSeq = 0): void {
    const limit = 256 * 1024;
    const isForeground = !this.activeKnown || this.activeId === id;
    const windowMs = isForeground ? BATCH_WINDOW_MS : BACKGROUND_BATCH_WINDOW_MS;
    const now = Date.now();
    if (isForeground && !this.pending.has(id) && now - (this.lastSent.get(id) ?? 0) >= BATCH_WINDOW_MS && data.length <= 64 * 1024) {
      this.lastSent.set(id, now);
      this.send(id, data, baseSeq + data.length);
      return;
    }
    for (let offset = 0; offset < data.length;) {
      let end = Math.min(offset + 64 * 1024, data.length);
      // Keep UTF-16 surrogate pairs intact when splitting a large PTY callback.
      if (end < data.length && /[\uD800-\uDBFF]/.test(data[end - 1])) end--;
      const chunk = data.slice(offset, end);
      const chunkEndSeq = baseSeq + end;
      offset = end;
      const bytes = Buffer.byteLength(chunk);
      let batch = this.pending.get(id);
      if (batch && batch.bytes + bytes > limit) {
        this.flush(id);
        batch = undefined;
      }
      if (!batch) {
        batch = { chunks: [], bytes: 0, seq: chunkEndSeq, timer: setTimeout(() => this.flush(id), windowMs) };
        this.pending.set(id, batch);
      }
      batch.chunks.push(chunk);
      batch.bytes += bytes;
      batch.seq = chunkEndSeq;
      if (batch.bytes >= limit) this.flush(id);
    }
  }

  public flush(id: string): void {
    const batch = this.pending.get(id);
    if (!batch) return;
    clearTimeout(batch.timer);
    this.pending.delete(id);
    this.lastSent.set(id, Date.now());
    this.send(id, batch.chunks.join(''), batch.seq);
  }

  /** 丢弃尚未发出的缓冲数据（用于清屏、重启或主动终止会话，避免旧进程残余输出冲掉新终端屏幕） */
  public discard(id: string): void {
    const batch = this.pending.get(id);
    if (batch) {
      clearTimeout(batch.timer);
      this.pending.delete(id);
    }
    this.lastSent.delete(id);
  }

  /** 会话自然退出后刷出末尾缓冲并丢弃发送时间记录 */
  public forget(id: string): void {
    this.flush(id);
    this.lastSent.delete(id);
  }
}

export class PtyManager {
  private sessions: Map<string, PtyProcess> = new Map();
  private sessionOptions: Map<string, CreateSessionOptions> = new Map();
  private dataBuffers: Map<string, SessionBuffer> = new Map();
  private sessionSeq: Map<string, number> = new Map();
  private exitedCodes: Map<string, number> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private output = new PtyOutputBatcher((id, data, seq) => {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('terminal:data', { id, data, seq });
    }
  });

  private consumers = new Set<string>();
  private acknowledged = new Map<string, number>();

  public acknowledge(id: string, seq: number) {
    const end = this.sessionSeq.get(id) ?? 0;
    const previous = this.acknowledged.get(id) ?? 0;
    if (!Number.isSafeInteger(seq) || seq <= previous || seq > end) return;
    this.acknowledged.set(id, seq);
    this.sessions.get(id)?.acknowledge?.(seq - previous);
  }

  private starting = new Map<string, Promise<SessionCreateResult>>();
  private generations = new Map<string, object>();

  constructor(private spawn = spawnPty) {}

  public setWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  public setActiveSession(id: string | null) {
    this.output.setActive(id);
  }

  /** 仍在运行的终端进程数量 */
  public aliveCount(): number {
    return new Set([...this.sessions.keys(), ...this.starting.keys()]).size;
  }

  public getSessionBuffer(id: string): string {
    return this.dataBuffers.get(id)?.chunks.join('') || '';
  }

  /** 原子读取会话当前缓冲、输出序号及存活/退出状态，消除挂载回放与实时输出竞态 */
  public getSessionSnapshot(id: string): SessionSnapshot {
    this.consumers.add(id);
    const alive = this.sessions.has(id);
    return {
      buffer: this.getSessionBuffer(id),
      seq: this.sessionSeq.get(id) ?? 0,
      alive,
      exitCode: alive ? undefined : this.exitedCodes.get(id),
    };
  }

  public clearSessionBuffer(id: string) {
    this.output.discard(id);
    this.acknowledge(id, this.sessionSeq.get(id) ?? 0);
    this.dataBuffers.set(id, { chunks: [], length: 0 });
  }

  private appendSessionBuffer(id: string, data: string) {
    if (!data) return;

    const buffer = this.dataBuffers.get(id) || { chunks: [], length: 0 };
    const chunk = data.length > MAX_SESSION_BUFFER_LENGTH
      ? data.slice(-MAX_SESSION_BUFFER_LENGTH)
      : data;
    const lastIndex = buffer.chunks.length - 1;
    if (lastIndex >= 0 && buffer.chunks[lastIndex].length < TARGET_BUFFER_CHUNK_LENGTH) {
      buffer.chunks[lastIndex] += chunk;
    } else {
      buffer.chunks.push(chunk);
    }
    buffer.length += chunk.length;

    while (buffer.length > MAX_SESSION_BUFFER_LENGTH && buffer.chunks.length > 0) {
      const overflow = buffer.length - MAX_SESSION_BUFFER_LENGTH;
      const first = buffer.chunks[0];
      if (first.length <= overflow) {
        buffer.chunks.shift();
        buffer.length -= first.length;
      } else {
        // 从行首开始保留：避免回放时开头是被截断的转义序列或半个代理对而显示乱码
        let cut = overflow;
        const nl = first.indexOf('\n', overflow);
        if (nl >= 0 && nl - overflow < 4096) cut = nl + 1;
        buffer.chunks[0] = first.slice(cut);
        buffer.length -= cut;
      }
    }

    this.dataBuffers.set(id, buffer);
  }

  public createSession(options: CreateSessionOptions): Promise<SessionCreateResult> {
    const pending = this.starting.get(options.id);
    if (pending) return pending;
    const generation = {};
    this.generations.set(options.id, generation);
    const result = this.createSessionAsync(options, generation).finally(() => {
      if (this.starting.get(options.id) === result) this.starting.delete(options.id);
    });
    this.starting.set(options.id, result);
    return result;
  }

  private async createSessionAsync(options: CreateSessionOptions, generation: object): Promise<SessionCreateResult> {
    const remembered = this.sessionOptions.get(options.id);
    const resolvedOptions: CreateSessionOptions = {
      ...remembered,
      ...options,
      account: 'account' in options ? options.account : remembered?.account,
      cols: options.cols ?? remembered?.cols,
      rows: options.rows ?? remembered?.rows,
    };
    const { id, command, cwd } = resolvedOptions;
    this.sessionOptions.set(id, resolvedOptions);

    // 如果该 session 已经存在，则返回当前缓冲区
    if (this.sessions.has(id)) {
      return { success: true, reused: true, buffer: this.getSessionBuffer(id) };
    }

    try {
      const isWindows = os.platform() === 'win32';
      const defaultShell = isWindows ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
      const rawCommand = (command || defaultShell).trim();
      const workDir = cwd || process.env.USERPROFILE || process.cwd();
      if (!(await fs.promises.stat(workDir).catch(() => null))?.isDirectory()) {
        return { success: false, error: t('工作目录不存在或不是文件夹：{dir}', { dir: workDir }) };
      }

      let accountEnv: Record<string, string> = {};
      if (resolvedOptions.account) {
        const built = buildAccountEnv(resolvedOptions.account);
        if ('error' in built) return { success: false, error: built.error };
        accountEnv = built.env;
      }

      let file = defaultShell;
      let args: string[] = [];

      if (isWindows) {
        const runAndExit = (cmd: string) => {
          // 带引号开头的完整路径在 PowerShell -Command 中需前置调用运算符 & 才会被当作可执行文件调用；用换行分隔防止命令末尾 # 注释吞掉退出分支
          const invoke = /^["']/.test(cmd) ? `& ${cmd}` : cmd;
          return `$global:LASTEXITCODE = $null\n${invoke}\nif ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE } elseif (-not $?) { exit 1 }`;
        };
        const lower = rawCommand.toLowerCase();
        if (lower === 'kimi' || lower === 'kimi code') {
          file = 'powershell.exe';
          args = ['-ExecutionPolicy', 'Bypass', '-Command', runAndExit('kimi')];
        } else if (lower === 'codex') {
          file = 'powershell.exe';
          args = ['-ExecutionPolicy', 'Bypass', '-Command', runAndExit('codex')];
        } else if (lower === 'claude') {
          file = 'powershell.exe';
          args = ['-ExecutionPolicy', 'Bypass', '-Command', runAndExit('claude')];
        } else if (lower === 'opencode') {
          file = 'powershell.exe';
          args = [
            '-NoExit',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            'if (Get-Command opencode -ErrorAction SilentlyContinue) { $global:LASTEXITCODE = $null; opencode; exit $(if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }) } else { Write-Host "`n' + t('[OneAI 提示]: 本地尚未安装或配置 opencode 环境变量。当前已为您打开交互终端，可随时输入命令。') + '" -ForegroundColor Yellow }',
          ];
        } else if (lower === 'grok') {
          file = 'powershell.exe';
          args = [
            '-NoExit',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            'if (Get-Command grok -ErrorAction SilentlyContinue) { $global:LASTEXITCODE = $null; grok; exit $(if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }) } else { Write-Host "`n' + t('[OneAI 提示]: 本地尚未安装或配置 grok CLI 环境变量。当前已为您打开交互终端，可随时输入命令。') + '" -ForegroundColor Yellow }',
          ];
        } else if (lower === 'powershell' || lower === 'powershell.exe') {
          file = 'powershell.exe';
          args = ['-NoExit', '-ExecutionPolicy', 'Bypass'];
        } else if (lower === 'pwsh' || lower === 'pwsh.exe') {
          file = 'pwsh.exe';
          args = ['-NoExit', '-ExecutionPolicy', 'Bypass'];
        } else if (lower === 'cmd' || lower === 'cmd.exe') {
          file = 'cmd.exe';
          args = [];
        } else if (lower === 'wsl' || lower === 'wsl.exe') {
          file = 'wsl.exe';
          args = [];
        } else {
          // 其余带参或无参的 CLI 命令（兼容 .cmd / .ps1 垫片、带引号完整路径与自定义 CLI）统一交由 PowerShell 解析，退出后结束会话
          file = 'powershell.exe';
          args = ['-ExecutionPolicy', 'Bypass', '-Command', runAndExit(rawCommand)];
        }
      } else {
        file = rawCommand;
      }

      console.log(`[PTY] Spawning session ${id}: file=${file}, args=${JSON.stringify(args)}, cwd=${workDir}`);

      if (this.generations.get(id) !== generation) return { success: false, error: t('终端创建已取消') };
      const ptyProcess = await this.spawn(file, args, {
        name: 'xterm-256color',
        cols: Math.max(20, resolvedOptions.cols || 120),
        rows: Math.max(10, resolvedOptions.rows || 32),
        cwd: workDir,
        env: {
          ...process.env,
          ...accountEnv,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        } as Record<string, string>,
        useConpty: isWindows,
        // Pi 在开启原始输入前就写入鼠标追踪序列，系统自带 ConPTY 会吞掉这类序列，导致滚轮无法滚动 Pi 的全屏视窗；
        // node-pty 自带的 conpty.dll（OpenConsole）会原样透传，因此仅 Pi 会话使用它。
        useConptyDll: isWindows && /^pi(\s|$)/i.test(rawCommand),
      });

      if (this.generations.get(id) !== generation) {
        killProcessTree(ptyProcess);
        return { success: false, error: t('终端创建已取消') };
      }
      const latestSize = this.sessionOptions.get(id);
      if (latestSize?.cols && latestSize?.rows) ptyProcess.resize(latestSize.cols, latestSize.rows);
      this.exitedCodes.delete(id);
      this.clearSessionBuffer(id);
      this.sessions.set(id, ptyProcess);

      // 监听 PTY 输出数据并缓存与实时发送（seq 在会话生命周期内单调递增，跨重启不回退）
      ptyProcess.onData((data: string) => {
        if (this.sessions.get(id) !== ptyProcess) return;
        const baseSeq = this.sessionSeq.get(id) ?? 0;
        this.sessionSeq.set(id, baseSeq + data.length);
        this.appendSessionBuffer(id, data);
        this.output.push(id, data, baseSeq);
        if (!this.consumers.has(id)) this.acknowledge(id, baseSeq + data.length);
      });

      // 监听进程退出
      ptyProcess.onExit(({ exitCode }) => {
        if (this.sessions.get(id) !== ptyProcess) return;
        this.output.forget(id);
        console.log(`[PTY] Session ${id} exited with code ${exitCode}`);
        this.sessions.delete(id);
        setBoundedMap(this.exitedCodes, id, exitCode, MAX_EXITED_RECORDS);
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('terminal:exit', { id, exitCode });
        }
      });

      return { success: true, buffer: '' };
    } catch (err: any) {
      console.error(`[PTY] Failed to spawn session ${id}:`, err);
      return { success: false, error: err.message };
    }
  }

  /** 返回是否写入成功；会话不存在（已退出或尚未启动）时返回 false，由界面提示用户 */
  public writeSession(id: string, data: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.write(data);
    return true;
  }

  public resizeSession(id: string, cols: number, rows: number) {
    const safeCols = Math.max(1, cols);
    const safeRows = Math.max(1, rows);
    const previous = this.sessionOptions.get(id) || { id };
    this.sessionOptions.set(id, { ...previous, cols: safeCols, rows: safeRows });

    const session = this.sessions.get(id);
    if (session) {
      try {
        session.resize(safeCols, safeRows);
      } catch (err) {
        console.warn(`[PTY] Resize failed for ${id}:`, err);
      }
    }
  }

  public killSession(id: string) {
    this.generations.delete(id);
    this.starting.delete(id);
    this.output.discard(id);
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    if (session) {
      killProcessTree(session, false);
    }
    this.sessionOptions.delete(id);
    this.dataBuffers.delete(id);
    this.exitedCodes.delete(id);
    this.sessionSeq.delete(id);
    this.acknowledged.delete(id);
    this.consumers.delete(id);
  }

  public async restartSession(id: string, freshOptions?: Partial<CreateSessionOptions>): Promise<SessionCreateResult> {
    this.generations.delete(id);
    this.starting.delete(id);
    this.output.discard(id);
    const remembered = this.sessionOptions.get(id);
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    if (session) {
      killProcessTree(session, false);
    }
    this.dataBuffers.delete(id);
    this.exitedCodes.delete(id);

    const hasFresh = Boolean(
      freshOptions
      && (freshOptions.command !== undefined || freshOptions.cwd !== undefined || 'account' in freshOptions || freshOptions.shell !== undefined),
    );
    if (!remembered && !hasFresh) {
      return { success: false, error: t('未找到该终端会话的启动配置') };
    }

    const merged: CreateSessionOptions = {
      ...remembered,
      ...freshOptions,
      id,
      account: freshOptions && 'account' in freshOptions ? freshOptions.account : remembered?.account,
      cols: freshOptions?.cols ?? remembered?.cols,
      rows: freshOptions?.rows ?? remembered?.rows,
    };
    this.sessionOptions.set(id, merged);
    return this.createSession(merged);
  }

  public destroyAll() {
    this.generations.clear();
    this.starting.clear();
    for (const [id, session] of this.sessions) {
      this.output.discard(id);
      if (this.spawn !== spawnPty) killProcessTree(session, true);
    }
    this.sessions.clear();
    this.sessionOptions.clear();
    this.dataBuffers.clear();
    this.exitedCodes.clear();
    this.sessionSeq.clear();
    this.acknowledged.clear();
    this.consumers.clear();
    shutdownPtyWorker();
  }
}

export const ptyManager = new PtyManager();
