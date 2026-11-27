import { BrowserWindow } from 'electron';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import type { SystemStats } from '../shared/types';

const SAMPLE_INTERVAL_MS = 2000;
const GPU_SAMPLE_INTERVAL_MS = 5000;
const COUNTER_REQUEST_TIMEOUT_MS = 8000;
const COUNTER_FAILURE_COOLDOWN_MS = 60_000;

function cpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const { times } of os.cpus()) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

// 常驻 PowerShell：每收到一行请求就回一行「接收字节 发送字节 网卡名集合」。
// 只统计状态为 Up 的物理网卡：`netstat -e` 会把 VPN / 代理的虚拟网卡与本机转发重复计入，
// 实测下载 57 MB 时汇总读到 335 MB，而物理网卡只增加 67 MB。物理网卡列表每 30 秒刷新一次，
// 单次读取约 24 毫秒；一次性启动 PowerShell 要 1 秒以上，不适合每 2 秒调用。
const NET_SCRIPT = `
$sw = [Diagnostics.Stopwatch]::StartNew(); $names = @(); $refreshedAt = -60000
while ($null -ne [Console]::In.ReadLine()) {
  if ($names.Count -eq 0 -or ($sw.ElapsedMilliseconds - $refreshedAt) -gt 30000) {
    $names = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up' | ForEach-Object Name)
    $refreshedAt = $sw.ElapsedMilliseconds
  }
  if ($names.Count -eq 0) { [Console]::Out.WriteLine('none'); continue }
  $s = Get-NetAdapterStatistics -Name $names -ErrorAction SilentlyContinue
  [Console]::Out.WriteLine(('{0} {1} {2}' -f [int64]($s | Measure-Object ReceivedBytes -Sum).Sum, [int64]($s | Measure-Object SentBytes -Sum).Sum, ($names -join '|')))
}`;

// 计数器实例按进程分列。先将运行时间增量按物理引擎汇总，再取最忙引擎。
// CIM 类名不受 Windows 显示语言影响。仅回传最终百分比，避免跨进程传输全部实例。
const GPU_SCRIPT = `
$previous = @{}
while ($null -ne ($request = [Console]::In.ReadLine())) {
  if ($request -eq 'reset') { $previous = @{} }
  try {
    $rows = Get-CimInstance -ClassName Win32_PerfRawData_GPUPerformanceCounters_GPUEngine -Property Name,RunningTime,Timestamp_Sys100NS -ErrorAction Stop
    $current = @{}
    $usage = @{}
    foreach ($row in $rows) {
      if ($row.Name -notmatch '^pid_[0-9]+_(luid_.*_phys_[0-9]+_eng_[0-9]+)_engtype_') { continue }
      $engine = $Matches[1]
      $current[$row.Name] = $row
      $old = $previous[$row.Name]
      if ($null -eq $old -or $row.Timestamp_Sys100NS -le $old.Timestamp_Sys100NS -or $row.RunningTime -lt $old.RunningTime) { continue }
      $elapsed = $row.Timestamp_Sys100NS - $old.Timestamp_Sys100NS
      $running = $row.RunningTime - $old.RunningTime
      $usage[$engine] += 100 * ($running / $elapsed)
    }
    $previous = $current
    if ($usage.Count -eq 0) { [Console]::Out.WriteLine('none'); continue }
    $peak = ($usage.Values | Measure-Object -Maximum).Maximum
    [Console]::Out.WriteLine([int][Math]::Min(100, [Math]::Round($peak)))
  } catch {
    $previous = @{}
    [Console]::Out.WriteLine('error')
  }
}`;

interface NetCounters { rx: number; tx: number; adapters: string }

/**
 * PowerShell 常驻进程放在 worker 线程里创建和读写：Windows 上 spawn 是同步的 CreateProcess，
 * 偶尔会被系统（如杀毒扫描）拖慢到 2 秒，放在主线程会让界面与 IPC 一起卡住。
 * worker 只负责转发：start 启动进程，write 写 stdin，kill 结束；stdout 按行回传，进程退出时回传 exit。
 */
const COUNTER_WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads');
const { spawn } = require('node:child_process');
const children = new Map();
parentPort.on('message', (msg) => {
  if (msg.type === 'start') {
    let child;
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-NoLogo', '-EncodedCommand', msg.encoded], { windowsHide: true });
    } catch {
      parentPort.postMessage({ type: 'exit', key: msg.key });
      return;
    }
    children.set(msg.key, child);
    let buffer = '';
    child.stderr.resume();
    child.stdout.setEncoding('latin1');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      for (let i = buffer.indexOf('\\n'); i >= 0; i = buffer.indexOf('\\n')) {
        parentPort.postMessage({ type: 'line', key: msg.key, line: buffer.slice(0, i).trim() });
        buffer = buffer.slice(i + 1);
      }
    });
    const drop = () => {
      if (children.get(msg.key) !== child) return;
      children.delete(msg.key);
      parentPort.postMessage({ type: 'exit', key: msg.key });
    };
    child.on('error', drop);
    child.on('exit', drop);
    child.stdin.on('error', () => {});
  } else if (msg.type === 'write') {
    children.get(msg.key)?.stdin.write(msg.data);
  } else if (msg.type === 'kill') {
    const child = children.get(msg.key);
    children.delete(msg.key);
    child?.kill();
  } else if (msg.type === 'shutdown') {
    for (const child of children.values()) child.kill();
    children.clear();
    process.exit(0);
  }
});
`;

type CounterWorkerMessage = { type: 'line'; key: number; line: string } | { type: 'exit'; key: number };

let counterWorker: Worker | null = null;
let nextCounterKey = 1;
const counterListeners = new Map<number, (msg: CounterWorkerMessage) => void>();

function getCounterWorker(): Worker {
  if (counterWorker) return counterWorker;
  const worker = new Worker(COUNTER_WORKER_SOURCE, { eval: true });
  worker.unref(); // 不因 worker 存活而阻止应用退出
  worker.on('message', (msg: CounterWorkerMessage) => counterListeners.get(msg.key)?.(msg));
  const reset = () => {
    if (counterWorker !== worker) return;
    counterWorker = null;
    for (const listener of [...counterListeners.values()]) listener({ type: 'exit', key: -1 });
  };
  worker.on('error', reset);
  worker.on('exit', reset);
  counterWorker = worker;
  return worker;
}

/**
 * 结束 worker 线程（先由它结束全部 PowerShell）。Electron 主进程里留着存活的 worker 会让应用退不出去，
 * 所以停止采样时必须调用；之后再读取会按需重新创建。
 */
function shutdownCounterWorker(): void {
  const worker = counterWorker;
  if (!worker || counterListeners.size > 0) return;
  counterWorker = null;
  worker.postMessage({ type: 'shutdown' });
}

export class CounterReader {
  /** 当前进程的编号；为 0 表示没有在运行的进程，读取时再启动 */
  private key = 0;
  private waiter: ((line: string | null) => void) | null = null;
  private failures = 0;
  private cooldownUntil = 0;

  constructor(private readonly script: string) {}

  private start(): number {
    const key = nextCounterKey++;
    counterListeners.set(key, (msg) => {
      if (this.key !== key) return;
      if (msg.type === 'line') {
        const waiter = this.waiter;
        this.waiter = null;
        waiter?.(msg.line);
      } else {
        this.release();
      }
    });
    this.key = key;
    getCounterWorker().postMessage({ type: 'start', key, encoded: Buffer.from(this.script, 'utf16le').toString('base64') });
    return key;
  }

  /** 解除与当前进程的关联，并让在途请求以失败结束 */
  private release(): number {
    const key = this.key;
    this.key = 0;
    counterListeners.delete(key);
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.(null);
    return key;
  }

  /** 一次只允许一个请求在途；连续读取失败两次后进入 60 秒冷却期。 */
  async read(request = ''): Promise<string | null> {
    if (this.waiter || process.platform !== 'win32' || Date.now() < this.cooldownUntil) return null;
    const key = this.key || this.start();
    const line = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => this.dispose(), COUNTER_REQUEST_TIMEOUT_MS);
      this.waiter = (reply) => {
        clearTimeout(timer);
        resolve(reply);
      };
      getCounterWorker().postMessage({ type: 'write', key, data: request + '\n' });
    });
    if (line === null || line === 'error') {
      this.failures++;
      if (this.failures >= 2) {
        this.failures = 0;
        this.cooldownUntil = Date.now() + COUNTER_FAILURE_COOLDOWN_MS;
      }
      return null;
    }
    this.failures = 0;
    this.cooldownUntil = 0;
    return line;
  }

  dispose(): void {
    const key = this.release();
    if (key) counterWorker?.postMessage({ type: 'kill', key });
    shutdownCounterWorker();
  }
}

class SystemSampler {
  private lastCpu = cpuTimes();
  private lastNet: NetCounters | null = null;
  private lastAt = Date.now();
  private warmed = false;
  private readonly netReader = new CounterReader(NET_SCRIPT);

  /** 窗口隐藏期间不采样，恢复后丢弃旧基线，避免把长时间间隔平均进第一个读数 */
  reset(): void {
    this.warmed = false;
  }

  dispose(): void {
    this.netReader.dispose();
  }

  async sample(): Promise<Omit<SystemStats, 'gpuPercent'> | null> {
    const cpu = cpuTimes();
    // 没有处于 Up 状态的物理网卡时回复 none。
    const match = (await this.netReader.read())?.match(/^(\d+) (\d+) (.*)$/);
    const net = match ? { rx: Number(match[1]), tx: Number(match[2]), adapters: match[3] } : null;
    const now = Date.now();
    const seconds = (now - this.lastAt) / 1000;
    const prevCpu = this.lastCpu;
    const prevNet = this.lastNet;
    const wasWarm = this.warmed;
    this.lastCpu = cpu;
    this.lastNet = net;
    this.lastAt = now;
    this.warmed = true;
    if (!wasWarm || seconds <= 0) return null;

    const totalDelta = cpu.total - prevCpu.total;
    const cpuPercent = totalDelta > 0 ? Math.round((1 - (cpu.idle - prevCpu.idle) / totalDelta) * 100) : 0;
    // 网卡集合变化（插拔、连接断开）会让累计值整体跳变，计数被重置时差值为负，这两种情况都放弃本次读数
    const netValid = net !== null && prevNet !== null && net.adapters === prevNet.adapters && net.rx >= prevNet.rx && net.tx >= prevNet.tx;
    return {
      cpuPercent: Math.max(0, Math.min(100, cpuPercent)),
      memUsedBytes: os.totalmem() - os.freemem(),
      memTotalBytes: os.totalmem(),
      netUpBytesPerSec: netValid ? (net.tx - prevNet.tx) / seconds : null,
      netDownBytesPerSec: netValid ? (net.rx - prevNet.rx) / seconds : null,
    };
  }
}

/** 状态栏关闭时由渲染进程关掉采样，同时结束常驻的 PowerShell 进程；重新打开后按需再启动 */
let statsEnabled = true;
const enabledListeners = new Set<(enabled: boolean) => void>();

export function setSystemStatsEnabled(enabled: boolean): void {
  if (statsEnabled === enabled) return;
  statsEnabled = enabled;
  for (const listener of enabledListeners) listener(enabled);
}

/** 每 2 秒推送整机资源，GPU 独立采样。窗口最小化、隐藏或状态栏关闭时暂停采样。 */
export function startSystemStats(win: BrowserWindow): () => void {
  const sampler = new SystemSampler();
  const gpuReader = new CounterReader(GPU_SCRIPT);
  const visible = () => statsEnabled && !win.isDestroyed() && win.isVisible() && !win.isMinimized();
  let stopped = false;
  let gpuPercent: number | null = null;
  let gpuNeedsBaseline = true;
  let gpuBusy = false;
  const resetGpu = () => {
    gpuPercent = null;
    gpuNeedsBaseline = true;
  };
  const sampleGpu = async () => {
    if (!visible()) { resetGpu(); return; }
    if (gpuBusy) return;
    gpuBusy = true;
    try {
      const reset = gpuNeedsBaseline;
      gpuNeedsBaseline = false;
      const line = await gpuReader.read(reset ? 'reset' : '');
      if (stopped || gpuNeedsBaseline || !visible()) return;
      gpuPercent = line && /^(?:[0-9]{1,2}|100)$/.test(line) ? Number(line) : null;
    } finally {
      gpuBusy = false;
    }
  };
  const onEnabledChange = (enabled: boolean) => {
    if (enabled) return;
    resetGpu();
    gpuReader.dispose();
    sampler.reset();
    sampler.dispose();
    shutdownCounterWorker();
  };
  enabledListeners.add(onEnabledChange);
  win.on('hide', resetGpu);
  win.on('minimize', resetGpu);
  void sampleGpu();
  const gpuTimer = process.platform === 'win32' ? setInterval(sampleGpu, GPU_SAMPLE_INTERVAL_MS) : null;
  let busy = true;
  void (statsEnabled ? sampler.sample() : Promise.resolve(null)).finally(() => { busy = false; });
  const timer = setInterval(async () => {
    if (busy || win.isDestroyed()) return;
    if (!visible()) {
      sampler.reset();
      return;
    }
    busy = true;
    try {
      const stats = await sampler.sample();
      if (stats && !stopped && visible()) win.webContents.send('system:stats', { ...stats, gpuPercent });
    } finally {
      busy = false;
    }
  }, SAMPLE_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    if (gpuTimer !== null) clearInterval(gpuTimer);
    enabledListeners.delete(onEnabledChange);
    win.removeListener('hide', resetGpu);
    win.removeListener('minimize', resetGpu);
    gpuReader.dispose();
    sampler.dispose();
    shutdownCounterWorker();
  };
}
