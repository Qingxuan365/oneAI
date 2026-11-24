import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import type { IPty, IWindowsPtyForkOptions } from 'node-pty';

// One shared worker owns native PTYs, so ConPTY startup never blocks Electron's event loop.
const source = `
const { parentPort, workerData } = require('node:worker_threads');
const pty = require(workerData.modulePath);
const sessions = new Map();
const outstanding = new Map();
parentPort.on('message', ({ key, op, args }) => {
  try {
    if (op === 'shutdown') {
      for (const p of sessions.values()) {
        try { p.kill(); } catch {}
        if (process.platform === 'win32') {
          try { require('node:child_process').execFileSync('taskkill.exe', ['/T', '/F', '/PID', String(p.pid)], { windowsHide: true, timeout: 2000, stdio: 'ignore' }); } catch {}
        }
      }
      // node-pty drains its nested conout worker for 1000 ms after kill.
      // Terminating this owner before that cleanup deadlocks Electron shutdown.
      setTimeout(() => {
        parentPort.close();
        Atomics.store(new Int32Array(args[0]), 0, 1);
        Atomics.notify(new Int32Array(args[0]), 0);
      }, 1500);
      return;
    }
    if (op === 'spawn') {
      const p = pty.spawn(...args);
      sessions.set(key, p);
      parentPort.postMessage({ key, event: 'ready', value: p.pid });
      p.onData(value => {
        const size = (outstanding.get(key) || 0) + value.length;
        outstanding.set(key, size);
        if (size >= 1048576) p.pause();
        parentPort.postMessage({ key, event: 'data', value });
      });
      p.onExit(value => {
        sessions.delete(key);
        outstanding.delete(key);
        parentPort.postMessage({ key, event: 'exit', value });
      });
    } else {
      const p = sessions.get(key);
      if (p && op === 'acknowledge') {
        const size = Math.max(0, (outstanding.get(key) || 0) - args[0]);
        outstanding.set(key, size);
        if (size < 262144) p.resume();
      } else if (p) p[op](...args);
    }
  } catch (error) {
    parentPort.postMessage({ key, event: op === 'spawn' ? 'failure' : 'warning', value: error.message });
  }
});
`;

export type PtyProcess = Pick<IPty, 'pid' | 'onData' | 'onExit' | 'write' | 'resize' | 'pause' | 'resume' | 'kill'> & { acknowledge?: (size: number) => void };

let worker: Worker | undefined;
let nextKey = 0;
const clients = new Map<number, EventEmitter>();

export function shutdownPtyWorker(): void {
  if (!worker) return;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  worker.postMessage({ op: 'shutdown', args: [signal.buffer] });
  Atomics.wait(signal, 0, 0, 10_000);
  void worker.terminate();
  worker = undefined;
  clients.clear();
}

export async function spawnPty(file: string, args: string[], options: IWindowsPtyForkOptions): Promise<PtyProcess> {
  if (!worker) {
    const current = new Worker(source, {
      eval: true,
      workerData: { modulePath: createRequire(import.meta.url).resolve('node-pty') },
    });
    worker = current;
    current.unref();
    current.on('message', ({ key, event, value }) => clients.get(key)?.emit(event, value));
    const fail = (error: Error) => {
      if (worker !== current) return;
      worker = undefined;
      for (const client of clients.values()) client.emit('failure', error.message);
      clients.clear();
    };
    current.on('error', fail);
    current.on('exit', (code) => fail(new Error(`PTY worker exited (${code})`)));
  }
  const current = worker;
  const key = ++nextKey;
  const events = new EventEmitter();
  events.on('warning', (message) => console.warn('[PTY worker]', message));
  clients.set(key, events);
  const send = (op: string, ...args: unknown[]) => current.postMessage({ key, op, args });
  return new Promise((resolve, reject) => {
    let ready = false;
    events.on('failure', (message: string) => {
      if (!ready) reject(new Error(message));
      else events.emit('exit', { exitCode: 1 });
      clients.delete(key);
    });
    events.once('ready', (pid: number) => {
      ready = true;
      const listen = (event: string, callback: (...args: any[]) => void) => {
        events.on(event, callback);
        return { dispose: () => events.off(event, callback) };
      };
      resolve({
        pid,
        acknowledge: (size) => send('acknowledge', size),
        onData: (callback) => listen('data', callback),
        onExit: (callback) => listen('exit', callback),
        write: (data) => send('write', data),
        resize: (cols, rows) => send('resize', cols, rows),
        pause: () => send('pause'),
        resume: () => send('resume'),
        kill: () => send('kill'),
      } as PtyProcess);
    });
    events.once('exit', () => clients.delete(key));
    send('spawn', file, args, options);
  });
}
