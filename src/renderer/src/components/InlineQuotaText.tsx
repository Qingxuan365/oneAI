import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { QuotaData } from '../types';
import { t } from '../i18n';

interface InlineQuotaTextProps {
  quota: QuotaData | null;
  /** 状态栏的两行：limits 为额度进度条、模型与上下文，usage 为会话 Tokens / Cache / Cost */
  row: 'limits' | 'usage';
  onRefresh: () => Promise<void>;
  /** 传入当前语言，使 React.memo 在切换语言时同步重绘 */
  language?: string;
}

type Tone = 'ok' | 'warn' | 'bad' | 'plain';
const TONE_TEXT: Record<Tone, string> = { ok: 'text-success', warn: 'text-warning', bad: 'text-danger', plain: 'text-fg' };
const TONE_FILL: Record<Tone, string> = { ok: 'bg-success', warn: 'bg-warning', bad: 'bg-danger', plain: 'bg-accent' };

// 额度已用比例配色：已用 <= 50 绿色，51-80 黄色，> 80 红色（即剩余 >= 50 / 20-49 / < 20）
function quotaTone(used: number): Tone {
  if (used <= 50) return 'ok';
  if (used <= 80) return 'warn';
  return 'bad';
}

// 上下文占用百分比配色：>= 85 红色，65-84 黄色，< 65 正文色
function ctxTone(pct?: number): Tone {
  if (pct === undefined) return 'plain';
  if (pct >= 85) return 'bad';
  if (pct >= 65) return 'warn';
  return 'plain';
}

/** 细进度条，填充宽度为「已用」比例；未知时只画空轨道 */
const UsageBar = ({ used, tone, label }: { used: number | null; tone: Tone; label: string }) => (
  <span
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={used ?? undefined}
    className="quota-bar relative inline-block h-2 w-16 shrink-0 overflow-hidden rounded-full bg-line-strong/60 align-middle"
  >
    {used !== null && <span className={`absolute inset-y-0 left-0 rounded-full ${TONE_FILL[tone]}`} style={{ width: `${Math.max(0, Math.min(100, used))}%` }} />}
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
 * 状态栏额度与会话用量，所有 CLI 共用。额度行：5h / 7d / Ctx 为进度条加百分数，空间不足时
 * .quota-detail 与 .quota-model 由状态栏容器查询收起，完整信息保留在 title 中；用量行：Tokens / Cache / Cost。
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
        <span>5h --</span>
        <span>7d --</span>
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

  // 当前上下文占用，放在用量行末尾；用独立 .quota-ctx 控制显示优先级
  const hasCtx = quota.ctxPercent !== undefined || quota.ctxTokens !== undefined;

  const ctxValue = quota.ctxPercent !== undefined
    ? `${quota.ctxPercent}%`
    : (quota.ctxTokens !== undefined ? formatTokens(quota.ctxTokens) : '');
  const ctxDetail = quota.ctxPercent !== undefined && quota.ctxTokens !== undefined && quota.ctxWindow !== undefined
    ? t('当前上下文占用：{percent}%（{used} / {limit}）', { percent: quota.ctxPercent, used: formatTokens(quota.ctxTokens), limit: formatTokens(quota.ctxWindow) })
    : quota.ctxPercent !== undefined
      ? t('当前上下文占用：{percent}%', { percent: quota.ctxPercent })
      : quota.ctxTokens !== undefined
        ? t('当前上下文已用：{used} tokens', { used: formatTokens(quota.ctxTokens) })
        : undefined;
  const ctxTitle = ctxDetail && `${sessionLabel} · ${ctxDetail}${quota.ctxEstimated ? ` · ${t('按最近请求估算')}` : ''}`;
  const ctxNode = hasCtx && (
    <span className="quota-ctx flex items-center gap-1.5 whitespace-nowrap" title={ctxTitle}>
      <span className="text-fg-subtle">Ctx: </span>
      {quota.ctxPercent !== undefined && <UsageBar used={quota.ctxPercent} tone={ctxTone(quota.ctxPercent)} label={t('上下文占用')} />}
      <span className={`${TONE_TEXT[ctxTone(quota.ctxPercent)]}`}>{ctxValue}</span>
    </span>
  );

  if (row === 'usage') {
    const hasBreakdown = quota.tokenInput !== undefined || quota.tokenOutput !== undefined || quota.tokenCache !== undefined;
    const hasTokens = hasBreakdown || quota.tokens !== undefined;
    const totalTokens = quota.tokens ?? ((quota.tokenInput ?? 0) + (quota.tokenOutput ?? 0) + (quota.tokenCache ?? 0));
    const hasCache = quota.cacheHitPercent !== undefined;
    const hasCost = quota.costUsd !== undefined;
    if (!hasTokens && !hasCache && !hasCost && !hasCtx) return null;
    const tokensTitle = hasBreakdown
      ? t('{session}累计 token（输入 {input} · 输出 {output} · 缓存 {cache} · 合计 {total}）', {
        session: sessionLabel,
        input: (quota.tokenInput ?? 0).toLocaleString('en-US'),
        output: (quota.tokenOutput ?? 0).toLocaleString('en-US'),
        cache: (quota.tokenCache ?? 0).toLocaleString('en-US'),
        total: totalTokens.toLocaleString('en-US'),
      })
      : t('{session}累计 token（输入 + 输出 + 缓存读写）：{tokens}', { session: sessionLabel, tokens: totalTokens.toLocaleString('en-US') });

    // 最近活跃会话的累计用量；空间不足时先将明细折为总计，再整段由 .quota-usage 收起
    return (
      <div className="quota-usage flex items-center gap-5 whitespace-nowrap font-mono text-ui text-fg-muted">
        {/* 数据不属于当前任务时的来源标签，随整行一起收起，不单独隐藏，避免把别的会话用量误当成当前任务 */}
        {quota.sessionScope === 'latest' && <span className="text-warning" title={sessionLabel}>{t('最近')}</span>}
        {hasTokens && (
          <span title={tokensTitle}>
            <span className="text-fg-subtle">Tokens: </span>
            {hasBreakdown ? (
              <>
                <span className="quota-tokens-breakdown">
                  in <span className="text-fg">{formatTokens(quota.tokenInput ?? 0)}</span>, out <span className="text-fg">{formatTokens(quota.tokenOutput ?? 0)}</span>, cache <span className="text-fg">{formatTokens(quota.tokenCache ?? 0)}</span>
                </span>
                <span className="quota-tokens-compact text-fg" aria-hidden="true">{formatTokens(totalTokens)}</span>
              </>
            ) : (
              <span className="text-fg">{formatTokens(quota.tokens!)}</span>
            )}
          </span>
        )}
        {hasCache && (
          <span title={t('{session}缓存命中率：{percent}%', { session: sessionLabel, percent: quota.cacheHitPercent! })}>
            <span className="text-fg-subtle">Cache: </span>
            <span className="text-fg">{quota.cacheHitPercent}%</span>
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
    { label: '5h', percent: quota.fiveHourPercent, reset: quota.fiveHourResetsIn },
    { label: '7d', percent: quota.sevenDayPercent, reset: quota.sevenDayResetsOn },
  ];
  const modelTitle = quota.model && [
    quota.cliId === 'agy' || !quota.sessionScope ? t('配置模型') : sessionLabel,
    quota.effort ? t('{model} · 推理思考等级: {effort}', { model: quota.model, effort: quota.effort }) : quota.model,
  ].join(' · ');

  return (
    <div className="flex items-center gap-5 font-mono text-ui text-fg-muted" title={modelTitle}>
      {/* 模型与推理等级放在额度之前，一眼可知当前模型；窗口变窄时先收起模型名，再整体收起 */}
      {quota.model && (
        <span className="quota-model-info flex items-center gap-1.5">
          <span className="quota-model">
            <span className="text-fg-subtle">Model: </span>
            <span className="text-fg">{quota.model}</span>
          </span>
          {quota.effort && (
            <span className={`rounded border px-1.5 py-px text-ui lowercase tracking-wider ${effortColor(quota.effort)}`}>
              {quota.effort}
            </span>
          )}
        </span>
      )}
      {windows.map(({ label, percent, reset }) => {
        const used = percent < 0 ? null : Math.max(0, Math.min(100, 100 - percent));
        const tone: Tone = used === null ? 'plain' : quotaTone(used);
        return (
          <React.Fragment key={label}>
            <span className="flex items-center gap-1.5 whitespace-nowrap" title={t('{label} 额度剩余 {percent}{reset}', { label, percent: percent < 0 ? t('未知') : `${percent}%`, reset: reset !== '--' ? t('，{reset}', { reset }) : '' })}>
              <span className="text-fg-subtle">{label}: </span>
              <UsageBar used={used} tone={tone} label={t('{label} 额度已用', { label })} />
              <span className={`${used === null ? 'text-fg-faint' : TONE_TEXT[tone]}`}>{used === null ? '--' : `${used}%`}</span>
              {used !== null && <span className="quota-detail text-fg-subtle">{t('已用')}</span>}
              {reset !== '--' && <span className="quota-detail text-fg-subtle">({reset})</span>}
            </span>
          </React.Fragment>
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
