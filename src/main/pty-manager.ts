import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import * as os from 'node:os';
import fs from 'node:fs';
import { buildAccountEnv, SessionAccount } from './account-env';
import { t } from './i18n';

interface CreateSessionOptions {
  id: string;
  command?: string;
  cwd?: string;
  shell?: boolean; // 自定义 CLI：整条命令交给 PowerShell 解析，兼容 .cmd / .ps1 启动器与带参数的命令
  account?: SessionAccount; // 多账号：按账号的配置目录注入 CODEX_HOME / CLAUDE_CONFIG_DIR；重启时沿用
  cols?: number;
  rows?: number;
}

interface SessionBuffer {
  chunks: string[];
  length: number;
}

const MAX_SESSION_BUFFER_LENGTH = 2 * 1024 * 1024;
const TARGET_BUFFER_CHUNK_LENGTH = 8 * 1024;

const BATCH_WINDOW_MS = 8;
const BACKGROUND_BATCH_WINDOW_MS = 120;

/**
 * 按会话合并 PTY 输出再发 IPC。先发一次再合并：前台活动会话距上次发送已超过合并窗口的数据立即发出，
 * 打字回显不额外等待；后台隐藏会话放宽合并窗口以大幅减少高频刷屏时的跨进程拷贝次数。
 */
export class PtyOutputBatcher {
  private pending = new Map<string, { chunks: string[]; bytes: number; timer: NodeJS.Timeout }>();
  private lastSent = new Map<string, number>();
  private activeId: string | null = null;
  private activeKnown = false;

  constructor(private send: (id: string, data: string) => void) {}

  public setActive(id: string | null): void {
    this.activeKnown = true;
    this.activeId = id;
    if (id) this.flush(id);
  }

  public push(id: string, data: string): void {
    const limit = 256 * 1024;
    const isForeground = !this.activeKnown || this.activeId === id;
    const windowMs = isForeground ? BATCH_WINDOW_MS : BACKGROUND_BATCH_WINDOW_MS;
    const now = Date.now();
    if (isForeground && !this.pending.has(id) && now - (this.lastSent.get(id) ?? 0) >= BATCH_WINDOW_MS && data.length <= 64 * 1024) {
      this.lastSent.set(id, now);
      this.send(id, data);
      return;
    }
    for (let offset = 0; offset < data.length;) {
      let end = Math.min(offset + 64 * 1024, data.length);
      // Keep UTF-16 surrogate pairs intact when splitting a large PTY callback.
      if (end < data.length && /[\uD800-\uDBFF]/.test(data[end - 1])) end--;
      const chunk = data.slice(offset, end);
      offset = end;
      const bytes = Buffer.byteLength(chunk);
      let batch = this.pending.get(id);
      if (batch && batch.bytes + bytes > limit) {
        this.flush(id);
        batch = undefined;
      }
      if (!batch) {
        batch = { chunks: [], bytes: 0, timer: setTimeout(() => this.flush(id), windowMs) };
        this.pending.set(id, batch);
      }
      batch.chunks.push(chunk);
      batch.bytes += bytes;
      if (batch.bytes >= limit) this.flush(id);
    }
  }

  public flush(id: string): void {
    const batch = this.pending.get(id);
    if (!batch) return;
    clearTimeout(batch.timer);
    this.pending.delete(id);
    this.lastSent.set(id, Date.now());
    this.send(id, batch.chunks.join(''));
  }

  /** 会话结束后丢弃发送时间记录 */
  public forget(id: string): void {
    this.flush(id);
    this.lastSent.delete(id);
  }
}

export class PtyManager {
  private sessions: Map<string, pty.IPty> = new Map();
  private sessionOptions: Map<string, CreateSessionOptions> = new Map();
  private dataBuffers: Map<string, SessionBuffer> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private output = new PtyOutputBatcher((id, data) => {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('terminal:data', { id, data });
    }
  });

  constructor() {}

  public setWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  public setActiveSession(id: string | null) {
    this.output.setActive(id);
  }

  /** 仍在运行的终端进程数量 */
  public aliveCount(): number {
    return this.sessions.size;
  }

  public getSessionBuffer(id: string): string {
    return this.dataBuffers.get(id)?.chunks.join('') || '';
  }

  public clearSessionBuffer(id: string) {
    this.output.flush(id);
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

  public createSession(options: CreateSessionOptions): { success: boolean; buffer?: string; error?: string } {
    const remembered = this.sessionOptions.get(options.id);
    const resolvedOptions: CreateSessionOptions = {
      ...remembered,
      ...options,
      cols: options.cols ?? remembered?.cols,
      rows: options.rows ?? remembered?.rows,
    };
    const { id, command, cwd } = resolvedOptions;
    this.sessionOptions.set(id, resolvedOptions);

    // 如果该 session 已经存在，则返回当前缓冲区
    if (this.sessions.has(id)) {
      return { success: true, buffer: this.getSessionBuffer(id) };
    }

    try {
      const isWindows = os.platform() === 'win32';
      const defaultShell = isWindows ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
      const rawCommand = (command || defaultShell).trim();
      let workDir = cwd || process.env.USERPROFILE || process.cwd();
      if (!fs.existsSync(workDir) || !fs.statSync(workDir).isDirectory()) {
        return { success: false, error: t('工作目录不存在或不是文件夹：{dir}', { dir: workDir }) };
      }

      let accountEnv: Record<string, string> = {};
      if (resolvedOptions.account) {
        const built = buildAccountEnv(resolvedOptions.account);
        if ('error' in built) return { success: false, error: built.error };
        accountEnv = built.env;
      }

      // 正确拆分可执行文件与命令行参数
      let file = defaultShell;
      let args: string[] = [];

      if (isWindows) {
        const runAndExit = (cmd: string) => `$global:LASTEXITCODE = $null; ${cmd}; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }`;
        if (rawCommand.toLowerCase() === 'kimi' || rawCommand.toLowerCase() === 'kimi code') {
          file = 'powershell.exe';
          args = ['-ExecutionPolicy', 'Bypass', '-Command', runAndExit('kimi')];
        } else if (rawCommand.toLowerCase() === 'codex') {
          file = 'powershell.exe';
          args = ['-ExecutionPolicy', 'Bypass', '-Command', runAndExit('codex')];
        } else if (rawCommand.toLowerCase() === 'claude') {
          file = 'powershell.exe';
          args = ['-ExecutionPolicy', 'Bypass', '-Command', runAndExit('claude')];
        } else if (rawCommand.toLowerCase() === 'opencode') {
          file = 'powershell.exe';
          args = [
            '-NoExit',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            'if (Get-Command opencode -ErrorAction SilentlyContinue) { $global:LASTEXITCODE = $null; opencode; exit $(if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }) } else { Write-Host "`n' + t('[OneAI 提示]: 本地尚未安装或配置 opencode 环境变量。当前已为您打开交互终端，可随时输入命令。') + '" -ForegroundColor Yellow }',
          ];
        } else if (rawCommand.toLowerCase() === 'grok') {
          file = 'powershell.exe';
          args = [
            '-NoExit',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            'if (Get-Command grok -ErrorAction SilentlyContinue) { $global:LASTEXITCODE = $null; grok; exit $(if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }) } else { Write-Host "`n' + t('[OneAI 提示]: 本地尚未安装或配置 grok CLI 环境变量。当前已为您打开交互终端，可随时输入命令。') + '" -ForegroundColor Yellow }',
          ];
        } else if (rawCommand.toLowerCase() === 'powershell' || rawCommand.toLowerCase() === 'powershell.exe') {
          file = 'powershell.exe';
          args = ['-NoExit', '-ExecutionPolicy', 'Bypass'];
        } else if (rawCommand.toLowerCase() === 'cmd' || rawCommand.toLowerCase() === 'cmd.exe') {
          file = 'cmd.exe';
          args = [];
        } else if (resolvedOptions.shell || /^(kimi|codex|claude)\s/i.test(rawCommand)) {
          // 自定义 CLI 或恢复历史会话：带参数的 CLI 命令交给 PowerShell 解析，兼容 .cmd/.ps1 启动器；命令退出后结束会话以触发状态更新
          file = 'powershell.exe';
          args = ['-ExecutionPolicy', 'Bypass', '-Command', runAndExit(rawCommand)];
        } else if (rawCommand.includes(' ')) {
          // 按空格拆分，但保留引号内的空格（如 "C:\Program Files\x\tool.exe" --flag）
          const parts = (rawCommand.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((part) => part.replace(/^(["'])(.*)\1$/, '$2'));
          file = parts[0];
          args = parts.slice(1);
        } else {
          file = 'powershell.exe';
          args = ['-ExecutionPolicy', 'Bypass', '-Command', runAndExit(rawCommand)];
        }
      } else {
        file = rawCommand;
      }

      console.log(`[PTY] Spawning session ${id}: file=${file}, args=${JSON.stringify(args)}, cwd=${workDir}`);

      const ptyProcess = pty.spawn(file, args, {
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

      this.clearSessionBuffer(id);
      this.sessions.set(id, ptyProcess);

      // 监听 PTY 输出数据并缓存与实时发送
      ptyProcess.onData((data: string) => {
        if (this.sessions.get(id) !== ptyProcess) return;
        this.appendSessionBuffer(id, data);
        this.output.push(id, data);
      });

      // 监听进程退出
      ptyProcess.onExit(({ exitCode }) => {
        if (this.sessions.get(id) !== ptyProcess) return;
        this.output.forget(id);
        console.log(`[PTY] Session ${id} exited with code ${exitCode}`);
        this.sessions.delete(id);
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
    this.output.flush(id);
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    if (session) {
      try {
        session.kill();
      } catch {
        // ignore
      }
    }
    this.sessionOptions.delete(id);
    this.dataBuffers.delete(id);
  }

  public restartSession(id: string): { success: boolean; buffer?: string; error?: string } {
    this.output.flush(id);
    const options = this.sessionOptions.get(id);
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    if (session) {
      try {
        session.kill();
      } catch {
        // ignore
      }
    }
    this.dataBuffers.delete(id);
    if (options) {
      return this.createSession(options);
    }
    return this.createSession({ id });
  }

  public destroyAll() {
    for (const [id, session] of this.sessions) {
      this.output.flush(id);
      try {
        session.kill();
      } catch {
        // ignore
      }
    }
    this.sessions.clear();
    this.sessionOptions.clear();
    this.dataBuffers.clear();
  }
}

export const ptyManager = new PtyManager();
