import { BrowserWindow } from 'electron';
import os from 'node:os';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
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

class CounterReader {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private waiter: ((line: string | null) => void) | null = null;
  private failures = 0;
  private cooldownUntil = 0;

  constructor(private readonly script: string) {}

  private start(): ChildProcessWithoutNullStreams {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-NoLogo', '-EncodedCommand', Buffer.from(this.script, 'utf16le').toString('base64'),
    ], { windowsHide: true });
    child.stderr.resume(); // 丢弃错误输出，避免管道写满后阻塞 PowerShell
    child.stdout.setEncoding('latin1');
    child.stdout.on('data', (chunk: string) => {
      if (this.child !== child) return;
      this.buffer += chunk;
      for (let i = this.buffer.indexOf('\n'); i >= 0; i = this.buffer.indexOf('\n')) {
        const line = this.buffer.slice(0, i).trim();
        this.buffer = this.buffer.slice(i + 1);
        const waiter = this.waiter;
        this.waiter = null;
        waiter?.(line);
      }
    });
    const drop = () => {
      if (this.child !== child) return;
      this.child = null;
      this.buffer = '';
      const waiter = this.waiter;
      this.waiter = null;
      waiter?.(null);
    };
    child.on('error', drop);
    child.on('exit', drop);
    child.stdin.on('error', () => {});
    this.child = child;
    return child;
  }

  /** 一次只允许一个请求在途；连续读取失败两次后进入 60 秒冷却期。 */
  async read(request = ''): Promise<string | null> {
    if (this.waiter || process.platform !== 'win32' || Date.now() < this.cooldownUntil) return null;
    const child = this.child ?? this.start();
    const line = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => this.dispose(), COUNTER_REQUEST_TIMEOUT_MS);
      this.waiter = (reply) => {
        clearTimeout(timer);
        resolve(reply);
      };
      child.stdin.write(request + '\n');
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
    const child = this.child;
    this.child = null;
    this.buffer = '';
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.(null);
    child?.kill();
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

/** 每 2 秒推送整机资源，GPU 独立采样。窗口最小化或隐藏时暂停采样。 */
export function startSystemStats(win: BrowserWindow): () => void {
  const sampler = new SystemSampler();
  const gpuReader = new CounterReader(GPU_SCRIPT);
  const visible = () => !win.isDestroyed() && win.isVisible() && !win.isMinimized();
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
  win.on('hide', resetGpu);
  win.on('minimize', resetGpu);
  void sampleGpu();
  const gpuTimer = process.platform === 'win32' ? setInterval(sampleGpu, GPU_SAMPLE_INTERVAL_MS) : null;
  let busy = true;
  void sampler.sample().finally(() => { busy = false; });
  const timer = setInterval(async () => {
    if (busy || win.isDestroyed()) return;
    if (!win.isVisible() || win.isMinimized()) {
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
    win.removeListener('hide', resetGpu);
    win.removeListener('minimize', resetGpu);
    gpuReader.dispose();
    sampler.dispose();
  };
}
