import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { QuotaData } from '../types';
import { t } from '../i18n';

interface InlineQuotaTextProps {
  quota: QuotaData | null;
  /** 状态栏的两行：limits 为额度进度条与模型，usage 为会话 Tokens / Cache / Cost / Ctx */
  row: 'limits' | 'usage';
  onRefresh: () => Promise<void>;
  /** 传入当前语言，使 React.memo 在切换语言时同步重绘 */
  language?: string;
}

type Tone = 'warn' | 'bad' | 'plain';
const TONE_TEXT: Record<Tone, string> = { warn: 'text-warning', bad: 'text-danger', plain: 'text-fg' };
const TONE_FILL: Record<Tone, string> = { warn: 'bg-warning', bad: 'bg-danger', plain: 'bg-fg-muted' };
const FIVE_HOUR_LABEL = '5h limit:';
const WEEKLY_LABEL = 'Weekly limit:';
const resetTimeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const resetDateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

function formatQuotaReset(resetAt: number | undefined, weekly: boolean): string | undefined {
  if (resetAt === undefined || resetAt <= Date.now()) return undefined;
  const reset = new Date(resetAt);
  if (!Number.isFinite(reset.getTime())) return undefined;
  const time = resetTimeFormatter.format(reset);
  return weekly
    ? t('resets {time} on {day}', { time, day: resetDateFormatter.format(reset) })
    : t('resets {time}', { time });
}

// 上下文占用百分比配色：>= 85 红色，65-84 黄色，< 65 正文色
function ctxTone(pct?: number): Tone {
  if (pct === undefined) return 'plain';
  if (pct >= 85) return 'bad';
  if (pct >= 65) return 'warn';
  return 'plain';
}

/** 额度填剩余比例，上下文填占用比例。未知时只画轨道。 */
const UsageBar = ({ value, tone = 'plain', label }: { value: number | null; tone?: Tone; label: string }) => (
  <span
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={value ?? undefined}
    className="quota-bar quota-terminal-bar inline-flex w-20 shrink-0 items-center align-middle"
  >
    <span aria-hidden="true" className="text-fg-subtle">[</span>
    <span aria-hidden="true" className="quota-terminal-track relative h-3.5 flex-1 overflow-hidden">
      {value !== null && <span className={`absolute inset-y-0 left-0 ${TONE_FILL[tone]}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />}
    </span>
    <span aria-hidden="true" className="text-fg-subtle">]</span>
  </span>
);

// 推理思考等级（low | medium | high | xhigh | max）配色
function effortColor(effort: string): string {
  const eff = effort.toLowerCase();
  if (eff === 'low') return 'text-accent bg-accent/10 border-accent/30';
  if (eff === 'medium') return 'text-success bg-success/10 border-success/30';
  if (eff === 'high') return 'text-warning bg-warning/10 border-warning/30';
  if (eff === 'xhigh' || eff === 'max') return 'text-violet bg-violet/10 border-violet/30';
  return 'text-fg-muted bg-fg-faint/10 border-line-strong';
}

function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

/**
 * 状态栏额度与会话用量，所有 CLI 共用。额度行显示 5h / 7d 进度条与模型，
 * 用量行显示 Tokens / Cache / Cost / Ctx。窄栏由容器查询收起次要详情。
 */
export const InlineQuotaText: React.FC<InlineQuotaTextProps> = React.memo(({ quota, onRefresh, row }) => {
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
    if (row === 'usage') return null;
    return (
      <div className="flex items-center gap-3 font-mono text-ui text-fg-faint">
        <span>{t(FIVE_HOUR_LABEL)} --</span>
        <span>{t(WEEKLY_LABEL)} --</span>
        {refreshButton(t('刷新额度'))}
      </div>
    );
  }

  // 离线/未配置状态
  if (quota.status === 'offline') {
    if (row === 'usage') return null;
    return (
      <div className="flex items-center gap-2 text-ui text-fg-faint">
        <span className="rounded border border-line-strong bg-muted px-1.5 py-0.5 text-ui text-fg-muted">{quota.cliName}</span>
        <span className="quota-detail">{quota.message || t('未检测到本地 CLI 或配置')}</span>
        {refreshButton(t('刷新 {name} 状态', { name: quota.cliName }))}
      </div>
    );
  }

  const sessionLabel = quota.sessionScope === 'task' ? t('当前任务会话') : t('最近活跃会话');
  const showMissingUsage = quota.cliId === 'codex';
  const missingUsageTitle = t('暂无此任务的会话用量');

  // 当前上下文占用，放在用量行末尾；用独立 .quota-ctx 控制显示优先级
  const hasCtx = quota.ctxPercent !== undefined || quota.ctxTokens !== undefined;

  const ctxValue = quota.ctxPercent !== undefined
    ? `${quota.ctxPercent}%`
    : (quota.ctxTokens !== undefined ? formatTokens(quota.ctxTokens) : '--');
  const ctxDetail = quota.ctxPercent !== undefined && quota.ctxTokens !== undefined && quota.ctxWindow !== undefined
    ? t('当前上下文占用：{percent}%（{used} / {limit}）', { percent: quota.ctxPercent, used: formatTokens(quota.ctxTokens), limit: formatTokens(quota.ctxWindow) })
    : quota.ctxPercent !== undefined
      ? t('当前上下文占用：{percent}%', { percent: quota.ctxPercent })
      : quota.ctxTokens !== undefined
        ? t('当前上下文已用：{used} tokens', { used: formatTokens(quota.ctxTokens) })
        : undefined;
  const ctxTitle = ctxDetail ? `${sessionLabel} · ${ctxDetail}${quota.ctxEstimated ? ` · ${t('按最近请求估算')}` : ''}` : missingUsageTitle;
  const ctxNode = (hasCtx || showMissingUsage) && (
    <span className="quota-ctx flex items-center gap-1.5 whitespace-nowrap" title={ctxTitle}>
      <span className="text-fg-subtle">Ctx: </span>
      {quota.ctxPercent !== undefined && <UsageBar value={quota.ctxPercent} tone={ctxTone(quota.ctxPercent)} label={t('上下文占用')} />}
      <span className={hasCtx ? TONE_TEXT[ctxTone(quota.ctxPercent)] : 'text-fg-faint'}>{ctxValue}</span>
    </span>
  );

  if (row === 'usage') {
    const hasBreakdown = quota.tokenInput !== undefined || quota.tokenOutput !== undefined || quota.tokenCache !== undefined;
    const hasTokens = hasBreakdown || quota.tokens !== undefined;
    const totalTokens = quota.tokens ?? ((quota.tokenInput ?? 0) + (quota.tokenOutput ?? 0) + (quota.tokenCache ?? 0));
    const hasCache = quota.cacheHitPercent !== undefined;
    const hasCost = quota.costUsd !== undefined;
    if (!hasTokens && !hasCache && !hasCost && !hasCtx && !showMissingUsage) return null;
    const tokensTitle = hasBreakdown
      ? t('{session}累计 token（输入 {input} · 输出 {output} · 缓存 {cache} · 合计 {total}）', {
        session: sessionLabel,
        input: (quota.tokenInput ?? 0).toLocaleString('en-US'),
        output: (quota.tokenOutput ?? 0).toLocaleString('en-US'),
        cache: (quota.tokenCache ?? 0).toLocaleString('en-US'),
        total: totalTokens.toLocaleString('en-US'),
      })
      : hasTokens
        ? t('{session}累计 token（输入 + 输出 + 缓存读写）：{tokens}', { session: sessionLabel, tokens: totalTokens.toLocaleString('en-US') })
        : missingUsageTitle;

    // 最近活跃会话的累计用量；空间不足时先将明细折为总计，再整段由 .quota-usage 收起
    return (
      <div className="quota-usage flex items-center gap-5 whitespace-nowrap font-mono text-ui text-fg-muted">
        {/* 数据不属于当前任务时的来源标签，随整行一起收起，不单独隐藏，避免把别的会话用量误当成当前任务 */}
        {quota.sessionScope === 'latest' && <span lang="en" className="text-warning" title={sessionLabel}>{t('最近', undefined, 'en')}</span>}
        {(hasTokens || showMissingUsage) && (
          <span title={tokensTitle}>
            <span className="text-fg-subtle">Tokens: </span>
            {hasBreakdown ? (
              <>
                <span className="quota-tokens-breakdown">
                  in <span className="text-fg">{formatTokens(quota.tokenInput ?? 0)}</span>, out <span className="text-fg">{formatTokens(quota.tokenOutput ?? 0)}</span>, cache <span className="text-fg">{formatTokens(quota.tokenCache ?? 0)}</span>
                </span>
                <span className="quota-tokens-compact text-fg" aria-hidden="true">{formatTokens(totalTokens)}</span>
              </>
            ) : hasTokens ? (
              <span className="text-fg">{formatTokens(quota.tokens!)}</span>
            ) : (
              <>
                <span className="quota-tokens-breakdown text-fg-faint">in --, out --, cache --</span>
                <span className="quota-tokens-compact text-fg-faint" aria-hidden="true">--</span>
              </>
            )}
          </span>
        )}
        {(hasCache || showMissingUsage) && (
          <span title={hasCache ? t('{session}缓存命中率：{percent}%', { session: sessionLabel, percent: quota.cacheHitPercent! }) : missingUsageTitle}>
            <span className="text-fg-subtle">Cache: </span>
            <span className={hasCache ? 'text-fg' : 'text-fg-faint'}>{hasCache ? `${quota.cacheHitPercent}%` : '--'}</span>
          </span>
        )}
        {hasCost && (
          <span title={t('{session}累计费用（美元）', { session: sessionLabel })}>
            <span className="text-fg-subtle">Cost: </span>
            <span className="text-fg">${quota.costUsd!.toFixed(2)}</span>
          </span>
        )}
        {ctxNode}
      </div>
    );
  }

  // 系统终端是本地 Shell，没有额度窗口，只显示 Shell 名称与状态
  const windows = quota.cliId === 'terminal' ? [] : [
    { label: '5h', title: FIVE_HOUR_LABEL, percent: quota.fiveHourPercent, reset: quota.fiveHourResetsIn, resetAt: quota.fiveHourResetAt },
    { label: '7d', title: WEEKLY_LABEL, percent: quota.sevenDayPercent, reset: quota.sevenDayResetsOn, resetAt: quota.sevenDayResetAt },
  ];
  const modelTitle = quota.model && [
    quota.cliId === 'agy' || !quota.sessionScope || (quota.cliId === 'codex' && quota.sessionScope === 'latest') ? t('配置模型') : sessionLabel,
    quota.effort ? t('{model} · 推理思考等级: {effort}', { model: quota.model, effort: quota.effort }) : quota.model,
  ].join(' · ');

  return (
    <div className="quota-limits flex items-center gap-5 font-mono text-ui text-fg-muted" title={modelTitle}>
      {/* 空间不足时先截断模型名，给额度留出完整的显示宽度。 */}
      {quota.model && (
        <span className="quota-model-info flex min-w-0 items-center gap-1.5">
          <span className="quota-model truncate">
            <span className="text-fg-subtle">Model: </span>
            <span className="text-fg">{quota.model}</span>
          </span>
          {quota.effort && (
            <span className={`shrink-0 rounded border px-1.5 py-px text-ui lowercase tracking-wider ${effortColor(quota.effort)}`}>
              {quota.effort}
            </span>
          )}
        </span>
      )}
      {windows.map(({ label, title, percent, reset, resetAt }) => {
        const remaining = percent >= 0 && Number.isFinite(percent) ? Math.min(100, percent) : null;
        const resetLabel = remaining === null ? undefined : formatQuotaReset(resetAt, label === '7d');
        const resetTooltip = resetLabel ?? (reset !== '--' ? reset : undefined);
        return (
          <span key={label} className="quota-window flex shrink-0 items-center gap-1.5 whitespace-nowrap" title={t('{label} 额度剩余 {percent}{reset}', { label, percent: remaining === null ? t('未知') : `${remaining}%`, reset: resetTooltip ? t('，{reset}', { reset: resetTooltip }) : '' })}>
            <span className="text-fg-subtle">
              <span className="quota-window-label">{t(title)}</span>
              <span className="quota-window-short">{label}:</span>
            </span>
            <UsageBar value={remaining} label={t(title)} />
            <span className={remaining === null ? 'text-fg-faint' : 'text-fg'}>{remaining === null ? '--' : t('{percent}% left', { percent: remaining })}</span>
            {resetLabel && <span className="quota-reset text-fg-subtle">({resetLabel})</span>}
          </span>
        );
      })}

      {/* 额外辅助消息 */}
      {quota.message && (
        <span className="quota-detail text-fg-subtle">{quota.message}</span>
      )}

      {refreshButton(t('立即刷新 {name} 额度', { name: quota.cliName }))}
    </div>
  );
});

InlineQuotaText.displayName = 'InlineQuotaText';
