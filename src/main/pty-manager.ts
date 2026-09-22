import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import * as os from 'node:os';

interface CreateSessionOptions {
  id: string;
  command?: string;
  cwd?: string;
}

export class PtyManager {
  private sessions: Map<string, pty.IPty> = new Map();
  private mainWindow: BrowserWindow | null = null;

  constructor() {}

  public setWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  public createSession(options: CreateSessionOptions): { success: boolean; error?: string } {
    const { id, command, cwd } = options;

    // 如果该 session 已经存在，则直接返回
    if (this.sessions.has(id)) {
      return { success: true };
    }

    try {
      const isWindows = os.platform() === 'win32';
      // 默认 shell
      const defaultShell = isWindows ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
      const shellToUse = command || defaultShell;
      const workDir = cwd || process.env.USERPROFILE || process.cwd();

      const ptyProcess = pty.spawn(shellToUse, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workDir,
        env: process.env as Record<string, string>,
        useConpty: isWindows, // Windows 下启用 ConPTY 原生支持
      });

      // 监听 PTY 输出数据并发送到渲染进程
      ptyProcess.onData((data: string) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('terminal:data', { id, data });
        }
      });

      // 监听进程退出
      ptyProcess.onExit(({ exitCode }) => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('terminal:exit', { id, exitCode });
        }
        this.sessions.delete(id);
      });

      this.sessions.set(id, ptyProcess);
      return { success: true };
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
