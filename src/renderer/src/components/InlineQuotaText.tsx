import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { QuotaData } from '../types';
import { t } from '../i18n';

interface InlineQuotaTextProps {
  quota: QuotaData | null;
  onRefresh: () => Promise<void>;
  /** 传入当前语言，使 React.memo 在切换语言时同步重绘 */
  language?: string;
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
  <span className={`shrink-0 text-fg-faint ${className}`} aria-hidden="true">•</span>
);

function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

/** 顶栏单行纯文字额度。空间不足时 .quota-detail 与 .quota-model 由顶栏容器查询收起，完整信息保留在 title 中。 */
export const InlineQuotaText: React.FC<InlineQuotaTextProps> = React.memo(({ quota, onRefresh }) => {
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
        {refreshButton(t('刷新额度'))}
      </div>
    );
  }

  // 离线/未配置状态
  if (quota.status === 'offline') {
    return (
      <div className="flex items-center gap-2 text-ui text-fg-faint">
        <span className="rounded border border-line-strong bg-muted px-1.5 py-0.5 text-xs text-fg-muted">{quota.cliName}</span>
        <span className="quota-detail">{quota.message || t('未检测到本地 CLI 或配置')}</span>
        {refreshButton(t('刷新 {name} 状态', { name: quota.cliName }))}
      </div>
    );
  }

  // 系统终端是本地 Shell，没有额度窗口，只显示 Shell 名称与状态
  const windows = quota.cliId === 'terminal' ? [] : [
    { label: '5h', percent: quota.fiveHourPercent, reset: quota.fiveHourResetsIn },
    { label: '7d', percent: quota.sevenDayPercent, reset: quota.sevenDayResetsOn },
  ];

  return (
    <div className="flex items-center gap-2 font-mono text-ui text-fg-muted" title={quota.model ? (quota.effort ? t('{model} · 推理思考等级: {effort}', { model: quota.model, effort: quota.effort }) : quota.model) : undefined}>
      {/* 最近活跃会话的累计用量；没有数据的 CLI 不显示。空间不足时整段由 .quota-usage 收起 */}
      {(quota.tokens !== undefined || quota.costUsd !== undefined) && (
        <span className="quota-usage flex items-center gap-2 whitespace-nowrap">
          {quota.tokens !== undefined && (
            <span title={t('最近活跃会话累计 token（输入 + 输出 + 缓存读写）：{tokens}', { tokens: quota.tokens.toLocaleString('en-US') })}>
              <span className="text-fg-subtle">Tokens: </span>
              <span className="font-semibold text-fg">{formatTokens(quota.tokens)}</span>
            </span>
          )}
          {quota.tokens !== undefined && quota.costUsd !== undefined && <Divider />}
          {quota.costUsd !== undefined && (
            <span title={t('最近活跃会话累计费用（美元）')}>
              <span className="text-fg-subtle">Cost: </span>
              <span className="font-semibold text-fg">${quota.costUsd.toFixed(2)}</span>
            </span>
          )}
          <Divider />
        </span>
      )}

      {windows.map(({ label, percent, reset }, index) => (
        <React.Fragment key={label}>
          {index > 0 && <Divider />}
          <span className="whitespace-nowrap" title={t('{label} 额度剩余 {percent}{reset}', { label, percent: percent < 0 ? t('未知') : `${percent}%`, reset: reset !== '--' ? t('，{reset}', { reset }) : '' })}>
            <span className="text-fg-subtle">{label}: </span>
            <span className={`font-semibold ${percentColor(percent)}`}>{percent < 0 ? '--' : `${percent}%`}</span>
            {reset !== '--' && <span className="quota-detail text-xs text-fg-subtle"> ({reset})</span>}
          </span>
        </React.Fragment>
      ))}

      {/* 模型与推理等级放在额度之后；窗口继续变窄时先收起模型名，再整体收起 */}
      {quota.model && (
        <>
          {windows.length > 0 && <Divider className="quota-model-divider" />}
          <span className="quota-model-info flex items-center gap-1.5 text-xs">
            <span className="quota-model">
              <span className="text-fg-subtle">Model: </span>
              <span className="font-semibold text-fg">{quota.model}</span>
            </span>
            {quota.effort && (
              <span className={`rounded border px-1.5 py-px text-2xs font-semibold lowercase tracking-wider ${effortColor(quota.effort)}`}>
                {quota.effort}
              </span>
            )}
          </span>
        </>
      )}

      {/* 额外辅助消息（如 Ctx 上下文用量） */}
      {quota.message && (
        <>
          <Divider className="quota-detail" />
          <span className="quota-detail text-xs text-fg-subtle">{quota.message}</span>
        </>
      )}

      {refreshButton(t('立即刷新 {name} 额度', { name: quota.cliName }))}
    </div>
  );
});

InlineQuotaText.displayName = 'InlineQuotaText';
