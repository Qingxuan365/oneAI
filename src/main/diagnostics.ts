import { app, ipcMain, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

/**
 * 卡顿诊断日志：记录主进程事件循环阻塞、耗时过长的 IPC 处理（同步部分）以及渲染进程无响应 / 崩溃，
 * 写入 userData/logs/oneai-diag.log（超过 1 MB 时轮转为 .old），用于定位偶现的整窗「未响应」。
 */
const MAX_LOG_BYTES = 1024 * 1024;
const SLOW_IPC_MS = 100;
const LAG_CHECK_MS = 250;
const LAG_REPORT_MS = 500;

let logFile = '';
const recentIpc: string[] = [];

function getLogFile(): string {
  if (!logFile) {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'oneai-diag.log');
  }
  return logFile;
}

function write(message: string): void {
  try {
    getLogFile();
    try {
      if (fs.statSync(logFile).size > MAX_LOG_BYTES) fs.renameSync(logFile, `${logFile}.old`);
    } catch {}
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
  } catch {}
}

function track(channel: string, startedAt: number): void {
  const ms = Date.now() - startedAt;
  recentIpc.push(`${channel}@${new Date(startedAt).toISOString().slice(11, 23)}(${ms}ms)`);
  if (recentIpc.length > 20) recentIpc.shift();
  if (ms >= SLOW_IPC_MS) write(`[slow-ipc] ${channel} blocked main thread ${ms}ms`);
}

/** 必须在注册任何 IPC 之前调用 */
export function startDiagnostics(): void {
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
    handle(channel, (...args) => {
      const startedAt = Date.now();
      try { return listener(...args); } finally { track(channel, startedAt); }
    });
  const on = ipcMain.on.bind(ipcMain);
  ipcMain.on = ((channel: string, listener: (...args: any[]) => void) =>
    on(channel, (...args: any[]) => {
      const startedAt = Date.now();
      try { listener(...args); } finally { track(channel, startedAt); }
    })) as typeof ipcMain.on;

  let expected = Date.now() + LAG_CHECK_MS;
  setInterval(() => {
    const now = Date.now();
    const lag = now - expected;
    expected = now + LAG_CHECK_MS;
    if (lag >= LAG_REPORT_MS) write(`[event-loop] main thread blocked ~${lag}ms; recent ipc: ${recentIpc.join(' ')}`);
  }, LAG_CHECK_MS).unref();

  write(`[start] OneAI ${app.getVersion()} pid=${process.pid}`);
  startWatchdog();
}

/**
 * 主线程彻底卡死时上面的定时器无法执行，由独立 worker 线程看门狗：主线程每 500 ms 写一次心跳，
 * worker 发现心跳停了 3 秒以上就直接写日志（附最近 IPC），恢复后再记总时长
 */
function startWatchdog(): void {
  const heartbeat = new Float64Array(new SharedArrayBuffer(8));
  const recent = new Int32Array(new SharedArrayBuffer(4 + 4096));
  const syncRecent = () => {
    const bytes = Buffer.from(recentIpc.slice(-8).join(' ')).subarray(0, 4096);
    new Uint8Array(recent.buffer, 4, 4096).set(bytes);
    Atomics.store(recent, 0, bytes.length);
  };
  heartbeat[0] = Date.now();
  setInterval(() => { heartbeat[0] = Date.now(); syncRecent(); }, 500).unref();
  const code = `
    const { workerData } = require('node:worker_threads');
    const fs = require('node:fs');
    const { heartbeat, recent, logFile } = workerData;
    const log = (m) => { try { fs.appendFileSync(logFile, new Date().toISOString() + ' ' + m + '\\n'); } catch {} };
    let stuckSince = 0;
    setInterval(() => {
      const gap = Date.now() - heartbeat[0];
      if (gap >= 3000 && !stuckSince) {
        stuckSince = heartbeat[0];
        const len = Atomics.load(recent, 0);
        const ipc = Buffer.from(new Uint8Array(recent.buffer, 4, len)).toString();
        log('[watchdog] main thread stuck ' + gap + 'ms; recent ipc: ' + ipc);
      } else if (gap < 3000 && stuckSince) {
        log('[watchdog] main thread recovered after ~' + (Date.now() - stuckSince) + 'ms');
        stuckSince = 0;
      }
    }, 1000);
  `;
  try {
    const worker = new Worker(code, { eval: true, workerData: { heartbeat, recent, logFile: getLogFile() } });
    worker.unref();
  } catch (err) {
    write(`[watchdog] failed to start: ${(err as Error).message}`);
  }
}

/** 记录启动期后台任务的同步耗时，超过 100 ms 写日志 */
export function timed<T>(label: string, fn: () => T): T {
  const startedAt = Date.now();
  try { return fn(); } finally {
    const ms = Date.now() - startedAt;
    if (ms >= SLOW_IPC_MS) write(`[slow-task] ${label} blocked main thread ${ms}ms`);
  }
}

export function watchWindow(win: BrowserWindow): void {
  win.on('unresponsive', () => write(`[renderer] unresponsive; recent ipc: ${recentIpc.join(' ')}`));
  win.on('responsive', () => write('[renderer] responsive again'));
  win.webContents.on('render-process-gone', (_e, details) => write(`[renderer] gone: ${details.reason} code=${details.exitCode}`));
}
