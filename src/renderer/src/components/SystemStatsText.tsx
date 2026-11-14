import React, { useEffect, useState } from 'react';
import { SystemStats } from '../types';
import { t } from '../i18n';

function formatRate(bytesPerSec: number | null): string {
  if (bytesPerSec === null) return '--';
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)}B/s`;
  if (bytesPerSec < 1024 * 1024) return `${Math.round(bytesPerSec / 1024)}K/s`;
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)}M/s`;
}

const Dot = ({ className = '' }: { className?: string }) => (
  <span className={`shrink-0 text-fg-faint ${className}`} aria-hidden="true">•</span>
);

/**
 * 顶栏右侧整机 CPU / 内存 / 网速，纯文字单行。数值定宽并右对齐，避免每 2 秒刷新时顶栏抖动。
 * 空间不足时按「网速、内存、CPU」的顺序由顶栏容器查询依次收起；尚无数据时不占位。
 */
export const SystemStatsText: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => window.electronAPI?.onSystemStats?.(setStats), []);

  if (!stats) return null;
  const memGb = `${(stats.memUsedBytes / 1024 ** 3).toFixed(1)} GB`;
  const label = (text: string) => <span className="text-fg-subtle">{text} </span>;

  return (
    <div
      id="oneai-topbar-sys"
      className="topbar-sys flex shrink-0 items-center gap-2 whitespace-nowrap border-l border-line px-2.5 font-mono text-xs text-fg-muted"
      title={t('整机 CPU {cpu}%，内存已用 {used} / {total} GB，网络上行 {up}、下行 {down}', { cpu: stats.cpuPercent, used: memGb, total: (stats.memTotalBytes / 1024 ** 3).toFixed(1), up: formatRate(stats.netUpBytesPerSec), down: formatRate(stats.netDownBytesPerSec) })}
    >
      <span className="topbar-sys-cpu">
        {label('CPU:')}
        <span className="inline-block min-w-[3ch] text-right font-semibold text-fg tabular-nums">{stats.cpuPercent}%</span>
      </span>
      <Dot className="topbar-sys-mem" />
      <span className="topbar-sys-mem">
        {label('Mem:')}
        <span className="inline-block min-w-[7ch] text-right font-semibold text-fg tabular-nums">{memGb}</span>
      </span>
      <Dot className="topbar-sys-net" />
      <span className="topbar-sys-net">
        {label('Net:')}
        <span className="inline-block min-w-[7ch] text-right font-semibold text-fg tabular-nums">↑{formatRate(stats.netUpBytesPerSec)}</span>
        <span className="ml-1 inline-block min-w-[8ch] text-right font-semibold text-fg tabular-nums">↓{formatRate(stats.netDownBytesPerSec)}</span>
      </span>
    </div>
  );
};
