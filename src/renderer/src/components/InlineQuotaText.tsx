import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { QuotaData } from '../types';

interface InlineQuotaTextProps {
  quota: QuotaData | null;
  onRefresh: () => Promise<void>;
}

// 剩余百分比配色：>= 50 绿色，20-49 黄色，< 20 红色，未知为灰色
function percentColor(pct: number): string {
  if (pct < 0) return 'text-fg-faint';
  if (pct >= 50) return 'text-success';
  if (pct >= 20) return 'text-warning';
  return 'text-danger';
}

// 推理思考等级（low | medium | high | xhigh | max）配色
function effortColor(effort: string): string {
  const eff = effort.toLowerCase();
  if (eff === 'low') return 'text-accent bg-accent/10 border-accent/30';
  if (eff === 'medium') return 'text-success bg-success/10 border-success/30';
  if (eff === 'high') return 'text-warning bg-warning/10 border-warning/30';
  if (eff === 'xhigh' || eff === 'max') return 'text-violet bg-violet/10 border-violet/30';
  return 'text-fg-muted bg-fg-faint/10 border-line-strong';
}

const Divider = ({ className = '' }: { className?: string }) => (
  <span className={`h-3 w-px shrink-0 bg-line-strong ${className}`} aria-hidden="true" />
);

/** 顶栏单行纯文字额度。空间不足时 .quota-detail 与 .quota-model 由顶栏容器查询收起，完整信息保留在 title 中。 */
export const InlineQuotaText: React.FC<InlineQuotaTextProps> = ({ quota, onRefresh }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshClick = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      // 保持轻微动画反馈
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const refreshButton = (title: string) => (
    <button type="button" onClick={handleRefreshClick} className="icon-btn" title={title} aria-label={title}>
      <RotateCw size={14} className={isRefreshing ? 'animate-spin text-success' : ''} />
    </button>
  );

  if (!quota) {
    return (
      <div className="flex items-center gap-2 font-mono text-ui text-fg-faint">
        <span>5h --</span>
        <Divider />
        <span>7d --</span>
        {refreshButton('刷新额度')}
      </div>
    );
  }

  // 离线/未配置状态
  if (quota.status === 'offline') {
    return (
      <div className="flex items-center gap-2 text-ui text-fg-faint">
        <span className="rounded border border-line-strong bg-muted px-1.5 py-0.5 text-xs text-fg-muted">{quota.cliName}</span>
        <span className="quota-detail">{quota.message || '未检测到本地 CLI 或配置'}</span>
        {refreshButton(`刷新 ${quota.cliName} 状态`)}
      </div>
    );
  }

  // 系统终端是本地 Shell，没有额度窗口，只显示 Shell 名称与状态
  const windows = quota.cliId === 'terminal' ? [] : [
    { label: '5h', percent: quota.fiveHourPercent, reset: quota.fiveHourResetsIn },
    { label: '7d', percent: quota.sevenDayPercent, reset: quota.sevenDayResetsOn },
  ];

  return (
    <div className="flex items-center gap-2 font-mono text-ui text-fg-muted" title={quota.model ? (quota.effort ? `${quota.model} · 推理思考等级: ${quota.effort}` : quota.model) : undefined}>
      {/* 模型与推理等级 */}
      {quota.model && (
        <span className="quota-model-info flex items-center gap-1.5 text-xs">
          <span className="quota-model font-semibold text-fg">{quota.model}</span>
          {quota.effort && (
            <span className={`rounded border px-1.5 py-px text-2xs font-semibold lowercase tracking-wider ${effortColor(quota.effort)}`}>
              {quota.effort}
            </span>
          )}
        </span>
      )}

      {windows.map(({ label, percent, reset }, index) => (
        <React.Fragment key={label}>
          {(index > 0 || quota.model) && <Divider className={index === 0 ? 'quota-model-divider' : ''} />}
          <span className="whitespace-nowrap" title={`${label} 额度剩余 ${percent < 0 ? '未知' : `${percent}%`}${reset !== '--' ? `，${reset}` : ''}`}>
            <span className="text-fg-subtle">{label} </span>
            <span className={`font-semibold ${percentColor(percent)}`}>{percent < 0 ? '--' : `${percent}%`}</span>
            {reset !== '--' && <span className="quota-detail text-xs text-fg-subtle"> ({reset})</span>}
          </span>
        </React.Fragment>
      ))}

      {/* 额外辅助消息（如 Ctx 上下文用量） */}
      {quota.message && (
        <>
          <Divider className="quota-detail" />
          <span className="quota-detail text-xs text-fg-subtle">{quota.message}</span>
        </>
      )}

      {refreshButton(`立即刷新 ${quota.cliName} 额度`)}
    </div>
  );
};
