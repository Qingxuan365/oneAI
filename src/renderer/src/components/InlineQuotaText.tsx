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

// 上下文占用百分比配色：>= 85 红色，65-84 黄色，< 65 正文色
function ctxColor(pct?: number): string {
  if (pct === undefined) return 'text-fg';
  if (pct >= 85) return 'text-danger';
  if (pct >= 65) return 'text-warning';
  return 'text-fg';
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

  const hasBreakdown = quota.tokenInput !== undefined || quota.tokenOutput !== undefined || quota.tokenCache !== undefined;
  const hasTokens = hasBreakdown || quota.tokens !== undefined;
  const totalTokens = quota.tokens ?? ((quota.tokenInput ?? 0) + (quota.tokenOutput ?? 0) + (quota.tokenCache ?? 0));
  const hasCache = quota.cacheHitPercent !== undefined;
  const hasCost = quota.costUsd !== undefined;
  const hasUsage = hasTokens || hasCache || hasCost;
  const hasCtx = quota.ctxPercent !== undefined || quota.ctxTokens !== undefined;

  const tokensTitle = hasBreakdown
    ? t('最近活跃会话累计 token（输入 {input} · 输出 {output} · 缓存 {cache} · 合计 {total}）', {
      input: (quota.tokenInput ?? 0).toLocaleString('en-US'),
      output: (quota.tokenOutput ?? 0).toLocaleString('en-US'),
      cache: (quota.tokenCache ?? 0).toLocaleString('en-US'),
      total: totalTokens.toLocaleString('en-US'),
    })
    : (quota.tokens !== undefined
      ? t('最近活跃会话累计 token（输入 + 输出 + 缓存读写）：{tokens}', { tokens: quota.tokens.toLocaleString('en-US') })
      : undefined);

  const ctxValue = quota.ctxPercent !== undefined
    ? `${quota.ctxPercent}%`
    : (quota.ctxTokens !== undefined ? formatTokens(quota.ctxTokens) : '');
  const ctxTitle = quota.ctxPercent !== undefined && quota.ctxTokens !== undefined && quota.ctxWindow !== undefined
    ? t('当前上下文占用：{percent}%（{used} / {limit}）', { percent: quota.ctxPercent, used: formatTokens(quota.ctxTokens), limit: formatTokens(quota.ctxWindow) })
    : quota.ctxPercent !== undefined
      ? t('当前上下文占用：{percent}%', { percent: quota.ctxPercent })
      : quota.ctxTokens !== undefined
        ? t('当前上下文已用：{used} tokens', { used: formatTokens(quota.ctxTokens) })
        : undefined;

  return (
    <div className="flex items-center gap-1 font-mono text-ui text-fg-muted" title={quota.model ? (quota.effort ? t('{model} · 推理思考等级: {effort}', { model: quota.model, effort: quota.effort }) : quota.model) : undefined}>
      {/* 最近活跃会话的累计用量；没有数据的 CLI 不显示。空间不足时先将明细折为总计，再整段由 .quota-usage 收起 */}
      {hasUsage && (
        <span className="quota-usage flex items-center gap-1 whitespace-nowrap text-xs">
          {hasTokens && (
            <span title={tokensTitle}>
              <span className="text-fg-subtle">Tokens: </span>
              {hasBreakdown ? (
                <>
                  <span className="quota-tokens-breakdown">
                    in <span className="font-semibold text-fg">{formatTokens(quota.tokenInput ?? 0)}</span>, out <span className="font-semibold text-fg">{formatTokens(quota.tokenOutput ?? 0)}</span>, cache <span className="font-semibold text-fg">{formatTokens(quota.tokenCache ?? 0)}</span>
                  </span>
                  <span className="quota-tokens-compact font-semibold text-fg" aria-hidden="true">{formatTokens(totalTokens)}</span>
                </>
              ) : (
                <span className="font-semibold text-fg">{formatTokens(quota.tokens!)}</span>
              )}
            </span>
          )}
          {hasTokens && hasCache && <Divider />}
          {hasCache && (
            <span title={t('最近活跃会话缓存命中率：{percent}%', { percent: quota.cacheHitPercent! })}>
              <span className="text-fg-subtle">Cache: </span>
              <span className="font-semibold text-fg">{quota.cacheHitPercent}%</span>
            </span>
          )}
          {(hasTokens || hasCache) && hasCost && <Divider />}
          {hasCost && (
            <span title={t('最近活跃会话累计费用（美元）')}>
              <span className="text-fg-subtle">Cost: </span>
              <span className="font-semibold text-fg">${quota.costUsd!.toFixed(2)}</span>
            </span>
          )}
          {(windows.length > 0 || quota.model || hasCtx) && <Divider />}
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

      {/* 当前上下文占用；用独立 .quota-ctx 控制显示优先级，窄窗口下仍尽量保留 */}
      {hasCtx && (
        <>
          {(windows.length > 0 || quota.model) && <Divider className="quota-ctx" />}
          <span className="quota-ctx whitespace-nowrap text-xs" title={ctxTitle}>
            <span className="text-fg-subtle">Ctx: </span>
            <span className={`font-semibold ${ctxColor(quota.ctxPercent)}`}>{ctxValue}</span>
          </span>
        </>
      )}

      {/* 额外辅助消息 */}
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
