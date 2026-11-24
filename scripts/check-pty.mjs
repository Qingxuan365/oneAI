import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, '.tmp', 'check-pty');
await fs.mkdir(dir, { recursive: true });
await build({ entryPoints: [path.join(root, 'src/main/pty-worker.ts')], bundle: true, platform: 'node', format: 'esm', outfile: path.join(dir, 'worker.mjs') });
await fs.writeFile(path.join(dir, 'suite.mjs'), `
import assert from 'node:assert/strict';
import pty from 'node-pty';
import { spawnPty, shutdownPtyWorker } from './worker.mjs';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const options = { cwd: process.cwd(), cols: 120, rows: 30, env: process.env, useConpty: true };
async function sample(spawn) {
  let last = performance.now(), lag = 0;
  const timer = setInterval(() => { const n = performance.now(); lag = Math.max(lag, n - last - 5); last = n; }, 5);
  await sleep(20);
  const started = performance.now();
  const p = await spawn('cmd.exe', ['/c', 'echo ONEAI_OK'], options);
  const createMs = performance.now() - started;
  let output = '';
  p.onData(d => { output += d; p.acknowledge?.(d.length); });
  await new Promise(r => p.onExit(r));
  clearInterval(timer);
  assert.ok(output.includes('ONEAI_OK'));
  return { createMs, eventLoopLagMs: lag };
}
try {
  const direct = [], worker = [];
  for (let i = 0; i < 3; i++) direct.push(await sample((...args) => pty.spawn(...args)));
  for (let i = 0; i < 3; i++) worker.push(await sample(spawnPty));
  for (const useConptyDll of [false, true]) {
    const interactive = await spawnPty('cmd.exe', [], { ...options, useConptyDll });
    let text = '';
    interactive.onData(d => { text += d; interactive.acknowledge(d.length); });
    const exited = new Promise(r => interactive.onExit(r));
    interactive.resize(100, 35);
    interactive.write('echo ONEAI_INTERACTIVE_OK' + String.fromCharCode(13));
    const deadline = Date.now() + 5000;
    while (!text.includes('ONEAI_INTERACTIVE_OK') && Date.now() < deadline) await sleep(25);
    assert.ok(text.includes('ONEAI_INTERACTIVE_OK'), 'write and resize work for both ConPTY implementations');
    interactive.write('exit' + String.fromCharCode(13));
    await exited;
  }
  await assert.rejects(spawnPty('oneai-nonexistent-executable.exe', [], options));
  const p = await spawnPty('powershell.exe', ['-NoProfile', '-Command', "[Console]::Write(('x' * 4194304)); [Console]::Write('ONEAI_END')"], options);
  let count = 0, released = false, tail = '';
  p.onData(d => { count += d.length; tail = (tail + d).slice(-100); if (released) p.acknowledge(d.length); });
  const done = new Promise(r => p.onExit(r));
  const deadline = Date.now() + 10000;
  while (count < 1048576 && Date.now() < deadline) await sleep(25);
  assert.ok(count >= 1048576, 'high water reached');
  await sleep(300);
  const pausedAt = count;
  await sleep(300);
  assert.equal(count, pausedAt, 'producer pauses until consumer acknowledges');
  released = true;
  p.acknowledge(count);
  await done;
  assert.ok(tail.includes('ONEAI_END'), 'tail preserved after resume');
  assert.ok(count >= 4194304);
  console.log(JSON.stringify({ direct, worker, pausedAt, consumed: count }, null, 2));
} finally { shutdownPtyWorker(); }
process.exit(0);
`);
const result = spawnSync(path.join(root, 'node_modules/electron/dist/electron.exe'), [path.join(dir, 'suite.mjs')], {
  cwd: root, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 60_000,
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
if (process.exitCode === 0) {
  await fs.writeFile(path.join(dir, 'quit.cjs'), `
const { app } = require('electron');
const path = require('node:path');
app.setPath('userData', path.join(__dirname, 'user-data'));
let shutdown;
app.on('before-quit', () => shutdown?.());
app.whenReady().then(async () => {
  const m = await import('./worker.mjs');
  shutdown = m.shutdownPtyWorker;
  const p = await m.spawnPty('cmd.exe', [], { cwd: process.cwd(), env: process.env, cols: 80, rows: 24, useConpty: true });
  p.onData(d => p.acknowledge(d.length));
  setTimeout(() => app.quit(), 200);
});
`);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  process.exitCode = await new Promise((resolve) => {
    const child = spawn(path.join(root, 'node_modules/electron/dist/electron.exe'), [path.join(dir, 'quit.cjs')], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      spawnSync('taskkill.exe', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true });
    }, 15000);
    child.on('error', () => { clearTimeout(timer); resolve(1); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      console.log('Electron quit with live PTY:', timedOut ? 'TIMEOUT' : code);
      resolve(timedOut ? 1 : code ?? 1);
    });
  });
}
