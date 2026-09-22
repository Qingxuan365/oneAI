import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import * as os from 'node:os';

interface CreateSessionOptions {
  id: string;
  command?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

export class PtyManager {
  private sessions: Map<string, pty.IPty> = new Map();
  private dataBuffers: Map<string, string> = new Map();
  private mainWindow: BrowserWindow | null = null;

  constructor() {}

  public setWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  public getSessionBuffer(id: string): string {
    return this.dataBuffers.get(id) || '';
  }

  public createSession(options: CreateSessionOptions): { success: boolean; buffer?: string; error?: string } {
    const { id, command, cwd } = options;

    // 如果该 session 已经存在，则返回当前缓冲区
    if (this.sessions.has(id)) {
      return { success: true, buffer: this.dataBuffers.get(id) || '' };
    }

    try {
      const isWindows = os.platform() === 'win32';
      const defaultShell = isWindows ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
      const rawCommand = (command || defaultShell).trim();
      const workDir = cwd || process.env.USERPROFILE || process.cwd();

      // 正确拆分可执行文件与命令行参数
      let file = defaultShell;
      let args: string[] = [];

      if (isWindows) {
        if (rawCommand.toLowerCase() === 'kimi' || rawCommand.toLowerCase() === 'kimi code') {
          file = 'powershell.exe';
          args = ['-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', 'kimi'];
        } else if (rawCommand.toLowerCase() === 'codex') {
          file = 'powershell.exe';
          args = ['-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', 'codex'];
        } else if (rawCommand.toLowerCase() === 'claude') {
          file = 'powershell.exe';
          args = ['-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', 'claude'];
        } else if (rawCommand.toLowerCase() === 'opencode') {
          file = 'powershell.exe';
          args = [
            '-NoExit',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            'if (Get-Command opencode -ErrorAction SilentlyContinue) { opencode } else { Write-Host "`n[OneDesktop 提示]: 本地尚未安装或配置 opencode 环境变量。当前已为您打开交互终端，可随时输入命令。" -ForegroundColor Yellow }',
          ];
        } else if (rawCommand.includes(' ')) {
          const parts = rawCommand.split(/\s+/);
          file = parts[0];
          args = parts.slice(1);
        } else {
          file = 'powershell.exe';
          args = ['-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', rawCommand];
        }
      } else {
        file = rawCommand;
      }

      console.log(`[PTY] Spawning session ${id}: file=${file}, args=${JSON.stringify(args)}, cwd=${workDir}`);

      const ptyProcess = pty.spawn(file, args, {
        name: 'xterm-256color',
        cols: Math.max(20, options.cols || 120),
        rows: Math.max(10, options.rows || 32),
        cwd: workDir,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        } as Record<string, string>,
        useConpty: isWindows,
      });

      this.dataBuffers.set(id, '');

      // 监听 PTY 输出数据并缓存与实时发送
      ptyProcess.onData((data: string) => {
        const currentBuf = this.dataBuffers.get(id) || '';
        // 保留最近 50KB 缓冲
        if (currentBuf.length > 50000) {
          this.dataBuffers.set(id, currentBuf.slice(-40000) + data);
        } else {
          this.dataBuffers.set(id, currentBuf + data);
        }

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('terminal:data', { id, data });
        }
      });

      // 监听进程退出
      ptyProcess.onExit(({ exitCode }) => {
        console.log(`[PTY] Session ${id} exited with code ${exitCode}`);
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('terminal:exit', { id, exitCode });
        }
        this.sessions.delete(id);
      });

      this.sessions.set(id, ptyProcess);
      return { success: true, buffer: '' };
    } catch (err: any) {
      console.error(`[PTY] Failed to spawn session ${id}:`, err);
      return { success: false, error: err.message };
    }
  }

  public writeSession(id: string, data: string) {
    const session = this.sessions.get(id);
    if (session) {
      session.write(data);
    }
  }

  public resizeSession(id: string, cols: number, rows: number) {
    const session = this.sessions.get(id);
    if (session) {
      try {
        session.resize(Math.max(1, cols), Math.max(1, rows));
      } catch (err) {
        console.warn(`[PTY] Resize failed for ${id}:`, err);
      }
    }
  }

  public killSession(id: string) {
    const session = this.sessions.get(id);
    if (session) {
      try {
        session.kill();
      } catch {
        // ignore
      }
      this.sessions.delete(id);
    }
  }

  public destroyAll() {
    for (const [id, session] of this.sessions) {
      try {
        session.kill();
      } catch {
        // ignore
      }
    }
    this.sessions.clear();
  }
}

export const ptyManager = new PtyManager();
