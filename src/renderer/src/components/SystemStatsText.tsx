import React, { useEffect, useState } from 'react';
import { SystemStats } from '../types';
import { t } from '../i18n';

function formatRate(bytesPerSec: number | null): string {
  if (bytesPerSec === null) return '--';
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)}B/s`;
  if (bytesPerSec < 1024 * 1024) return `${Math.round(bytesPerSec / 1024)}KiB/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)}MiB/s`;
}

function isSameDisplayedStats(a: SystemStats | null, b: SystemStats): boolean {
  if (!a) return false;
  return a.cpuPercent === b.cpuPercent
    && a.gpuPercent === b.gpuPercent
    && (a.memUsedBytes / 1024 ** 3).toFixed(1) === (b.memUsedBytes / 1024 ** 3).toFixed(1)
    && (a.memTotalBytes / 1024 ** 3).toFixed(1) === (b.memTotalBytes / 1024 ** 3).toFixed(1)
    && formatRate(a.netUpBytesPerSec) === formatRate(b.netUpBytesPerSec)
    && formatRate(a.netDownBytesPerSec) === formatRate(b.netDownBytesPerSec);
}

interface SystemStatsTextProps {
  /** 传入当前语言，使 React.memo 在切换语言时同步重绘 */
  language?: string;
}

/**
 * 状态栏下行右侧整机 CPU / GPU / 内存 / 网速，纯文字单行。数值定宽并右对齐，避免刷新时状态栏抖动。
 * 空间不足时按「网速、内存、GPU、CPU」的顺序收起；尚无数据时不占位。
 */
export const SystemStatsText: React.FC<SystemStatsTextProps> = React.memo(() => {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => window.electronAPI?.onSystemStats?.((next) => {
    setStats((prev) => (isSameDisplayedStats(prev, next) ? prev : next));
  }), []);

  if (!stats) return null;
  const memGiB = (stats.memUsedBytes / 1024 ** 3).toFixed(1);
  const gpu = stats.gpuPercent === null ? '--' : `${stats.gpuPercent}%`;
  const label = (text: string) => <span className="text-fg-subtle">{text} </span>;

  return (
    <div
      id="oneai-statusbar-sys"
      className="statusbar-sys flex shrink-0 items-center gap-5 whitespace-nowrap font-mono text-ui text-fg-muted"
      title={t('整机 CPU {cpu}%，GPU {gpu}，内存已用 {used} / {total} GiB，网络上行 {up}、下行 {down}', { cpu: stats.cpuPercent, gpu, used: memGiB, total: (stats.memTotalBytes / 1024 ** 3).toFixed(1), up: formatRate(stats.netUpBytesPerSec), down: formatRate(stats.netDownBytesPerSec) })}
    >
      <span className="statusbar-sys-cpu">
        {label('CPU:')}
        <span className="inline-block min-w-[3ch] text-right text-fg tabular-nums">{stats.cpuPercent}%</span>
      </span>
      <span className="statusbar-sys-gpu">
        {label('GPU:')}
        <span className="inline-block min-w-[4ch] text-right text-fg tabular-nums">{gpu}</span>
      </span>
      <span className="statusbar-sys-mem">
        {label('Memory:')}
        <span className="inline-block min-w-[8ch] text-right text-fg tabular-nums">{memGiB} GiB</span>
      </span>
      <span className="statusbar-sys-net">
        {label('Net:')}
        <span className="inline-block min-w-[7ch] text-right text-accent tabular-nums">↑{formatRate(stats.netUpBytesPerSec)}</span>
        <span className="ml-1.5 inline-block min-w-[7ch] text-right text-violet tabular-nums">↓{formatRate(stats.netDownBytesPerSec)}</span>
      </span>
    </div>
  );
});

SystemStatsText.displayName = 'SystemStatsText';
