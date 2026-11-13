import { BrowserWindow } from 'electron';
import os from 'node:os';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';

export interface SystemStats {
  cpuPercent: number;            // 0-100，两次采样之间的整机 CPU 占用
  memUsedBytes: number;
  memTotalBytes: number;
  netUpBytesPerSec: number | null;   // 取不到网络计数（非 Windows、没有处于 Up 状态的物理网卡、读取失败）时为 null
  netDownBytesPerSec: number | null;
}

const SAMPLE_INTERVAL_MS = 2000;
const NET_REQUEST_TIMEOUT_MS = 8000;

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

interface NetCounters { rx: number; tx: number; adapters: string }

class NetCounterReader {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private waiter: ((line: string | null) => void) | null = null;
  private failures = 0;

  private start(): ChildProcessWithoutNullStreams {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-NoLogo', '-EncodedCommand', Buffer.from(NET_SCRIPT, 'utf16le').toString('base64'),
    ], { windowsHide: true });
    child.stderr.resume(); // 丢弃错误输出，避免管道写满后阻塞 PowerShell
    child.stdout.setEncoding('latin1');
    child.stdout.on('data', (chunk: string) => {
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

  /** 一次只允许一个请求在途；超时或子进程退出算一次失败，连续两次后本次运行不再尝试，网速显示为「--」。 */
  async read(): Promise<NetCounters | null> {
    if (process.platform !== 'win32' || this.failures >= 2) return null;
    const child = this.child ?? this.start();
    const line = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        resolve(null);
        this.dispose();
      }, NET_REQUEST_TIMEOUT_MS);
      this.waiter = (reply) => {
        clearTimeout(timer);
        resolve(reply);
      };
      child.stdin.write('\n');
    });
    if (line === null) {
      this.failures++;
      return null;
    }
    this.failures = 0;
    const match = line.match(/^(\d+) (\d+) (.*)$/); // 没有处于 Up 状态的物理网卡时回复 none
    return match ? { rx: Number(match[1]), tx: Number(match[2]), adapters: match[3] } : null;
  }

  dispose(): void {
    const child = this.child;
    this.child = null;
    this.buffer = '';
    child?.kill();
  }
}

class SystemSampler {
  private lastCpu = cpuTimes();
  private lastNet: NetCounters | null = null;
  private lastAt = Date.now();
  private warmed = false;
  private readonly netReader = new NetCounterReader();

  /** 窗口隐藏期间不采样，恢复后丢弃旧基线，避免把长时间间隔平均进第一个读数 */
  reset(): void {
    this.warmed = false;
  }

  dispose(): void {
    this.netReader.dispose();
  }

  async sample(): Promise<SystemStats | null> {
    const cpu = cpuTimes();
    const net = await this.netReader.read();
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

/** 每 2 秒向渲染进程推送一次整机 CPU / 内存 / 网速；窗口最小化或隐藏时暂停采样。返回停止函数。 */
export function startSystemStats(win: BrowserWindow): () => void {
  const sampler = new SystemSampler();
  let busy = false;
  void sampler.sample();
  const timer = setInterval(async () => {
    if (busy || win.isDestroyed()) return;
    if (!win.isVisible() || win.isMinimized()) {
      sampler.reset();
      return;
    }
    busy = true;
    try {
      const stats = await sampler.sample();
      if (stats && !win.isDestroyed()) win.webContents.send('system:stats', stats);
    } finally {
      busy = false;
    }
  }, SAMPLE_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    sampler.dispose();
  };
}
