import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Check,
  Coins,
  Cpu,
  FilterX,
  Info,
  Layers,
  RotateCw,
  Terminal,
} from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import {
  Account,
  CliDef,
  DashboardStats,
  QuotaData,
  TaskSession,
  UsageCli,
} from '../types';
import {
  BreakdownDimension,
  CLI_ORDER,
  computeDashboardView,
  DashboardFilter,
  DashboardRange,
  formatCompactTokens,
  formatPercent,
  formatUsd,
  HeatmapCell,
  ModelSortKey,
  TrendGrouping,
  TrendMetric,
} from '../dashboardMetrics';
import { TASK_STATUS_META } from '../taskStatus';
import { folderName } from '../workspaceState';
import { T, t } from '../i18n';

interface DashboardViewProps {
  isActive: boolean;
  accounts: Account[];
  quotas: Record<string, QuotaData>;
  visibleClis: CliDef[];
  tasks: TaskSession[];
  onRefreshQuotas: () => Promise<void>;
  onSelectTask: (taskId: string) => void;
  onBackToTerminal?: () => void;
  /** 传入当前语言，使 React.memo 在切换语言时同步重绘 */
  language?: string;
}

const CLI_LABELS: Record<UsageCli, string> = {
  codex: 'Codex',
  agy: 'Antigravity',
  claude: 'Claude Code',
  pi: 'Pi',
};

const CLI_BAR_CLASSES: Record<UsageCli, string> = {
  codex: 'bg-accent',
  agy: 'bg-warning',
  claude: 'bg-violet',
  pi: 'bg-success',
};

const CLI_DOT_CLASSES: Record<UsageCli, string> = {
  codex: 'bg-accent',
  agy: 'bg-warning',
  claude: 'bg-violet',
  pi: 'bg-success',
};

const RANGE_OPTIONS: Array<{ id: DashboardRange; label: string }> = [
  { id: 'overview', label: T('概览') },
  { id: 'today', label: T('今天') },
  { id: '7d', label: T('7 天') },
  { id: '30d', label: T('近 30 天') },
  { id: 'all', label: T('全部') },
];

const HEATMAP_LEVEL_CLASSES = [
  'bg-control/75',
  'bg-success/25',
  'bg-success/50',
  'bg-success/75',
  'bg-success',
] as const;

const COMP_COLORS: Record<'input' | 'cacheRead' | 'cacheWrite' | 'output', { label: string; dot: string; stroke: string }> = {
  input: { label: T('输入'), dot: 'bg-accent', stroke: 'rgb(var(--color-accent))' },
  cacheRead: { label: T('缓存读取'), dot: 'bg-violet', stroke: 'rgb(var(--color-violet))' },
  cacheWrite: { label: T('缓存写入'), dot: 'bg-warning', stroke: 'rgb(var(--color-warning))' },
  output: { label: T('输出'), dot: 'bg-success', stroke: 'rgb(var(--color-success))' },
};

const weekdays = () => [t('一'), t('二'), t('三'), t('四'), t('五'), t('六'), t('日')];

function quotaBarColor(usedPct: number): string {
  if (usedPct >= 85) return 'bg-danger';
  if (usedPct >= 60) return 'bg-warning';
  return 'bg-success';
}

function resetDisplay(reset: string): string {
  if (!reset || reset === '--') return '--';
  if (reset === t('已就绪') || reset === t('已重置') || reset === t('近期重置')) return reset;
  return t('{reset} 后重置', { reset });
}

interface QuotaRowItem {
  id: string;
  cliId: string;
  title: string;
  subtitle?: string;
  windows: Array<{ label: string; remainingPct: number; reset: string }>;
  message?: string;
}

export const DashboardView: React.FC<DashboardViewProps> = React.memo(({
  isActive,
  accounts,
  quotas,
  visibleClis,
  tasks,
  onRefreshQuotas,
  onSelectTask,
  onBackToTerminal,
  language,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [quotaRefreshing, setQuotaRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [refreshSeq, setRefreshSeq] = useState(0);

  const [filter, setFilter] = useState<DashboardFilter>({
    range: 'overview',
    cliId: 'all',
    projectKey: 'all',
    accountKey: 'all',
  });
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('tokens');
  const [trendGrouping, setTrendGrouping] = useState<TrendGrouping>('stacked');
  const [breakdownDim, setBreakdownDim] = useState<BreakdownDimension>('agent');
  const [modelSort, setModelSort] = useState<ModelSortKey>('tokens');
  const [showAllModels, setShowAllModels] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);
  const [hoveredBucketKey, setHoveredBucketKey] = useState<string | null>(null);

  const accountsKey = useMemo(
    () => accounts.map((a) => `${a.id}\u0000${a.cliId}\u0000${a.name}\u0000${a.configDir}`).join('\u0001'),
    [accounts],
  );

  useEffect(() => {
    if (!isActive) return;
    let disposed = false;
    const load = window.electronAPI?.getDashboardStats;
    if (!load) {
      setError(t('当前版本不支持 Dashboard 统计'));
      return;
    }
    setLoading(true);
    setError('');
    load(accounts.map(({ id, name, cliId, configDir }) => ({ id, name, cliId, configDir })))
      .then((result) => {
        if (!disposed) setStats(result);
      })
      .catch((err) => {
        if (!disposed) setError(err instanceof Error ? err.message : t('读取 Dashboard 数据失败'));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => { disposed = true; };
  }, [isActive, refreshSeq, accountsKey, language]);

  const handleRefreshAll = useCallback(() => {
    setRefreshSeq((n) => n + 1);
    setQuotaRefreshing(true);
    void onRefreshQuotas().finally(() => {
      setTimeout(() => setQuotaRefreshing(false), 400);
    });
  }, [onRefreshQuotas]);

  const handleRefreshQuotaOnly = useCallback(() => {
    if (quotaRefreshing) return;
    setQuotaRefreshing(true);
    void onRefreshQuotas().finally(() => {
      setTimeout(() => setQuotaRefreshing(false), 400);
    });
  }, [onRefreshQuotas, quotaRefreshing]);

  const unknownProjectLabel = t('未记录项目');
  const view = useMemo(
    () => (stats ? computeDashboardView(stats, filter, Date.now(), unknownProjectLabel) : null),
    [stats, filter, unknownProjectLabel],
  );

  const hasActiveFilters = filter.cliId !== 'all' || filter.projectKey !== 'all' || filter.accountKey !== 'all' || Boolean(filter.modelKey);
  const clearFilters = () => setFilter((prev) => ({ ...prev, cliId: 'all', projectKey: 'all', accountKey: 'all', modelKey: undefined }));

  const toggleFilter = (patch?: Partial<Pick<DashboardFilter, 'cliId' | 'projectKey' | 'accountKey' | 'modelKey'>>) => {
    if (!patch) return;
    setFilter((prev) => ({
      ...prev,
      ...(patch.cliId !== undefined ? { cliId: prev.cliId === patch.cliId ? 'all' : patch.cliId } : {}),
      ...(patch.projectKey !== undefined ? { projectKey: prev.projectKey === patch.projectKey ? 'all' : patch.projectKey } : {}),
      ...(patch.accountKey !== undefined ? { accountKey: prev.accountKey === patch.accountKey ? 'all' : patch.accountKey } : {}),
      ...(patch.modelKey !== undefined ? { modelKey: prev.modelKey === patch.modelKey ? undefined : patch.modelKey } : {}),
    }));
  };

  const sortedModels = useMemo(() => {
    if (!view) return [];
    const list = [...view.modelRows];
    if (modelSort === 'cost') list.sort((a, b) => (Number(b.costPriced) - Number(a.costPriced)) || (b.costUsd - a.costUsd) || (b.tokens - a.tokens));
    else if (modelSort === 'requests') list.sort((a, b) => (b.requests - a.requests) || (b.tokens - a.tokens));
    else list.sort((a, b) => (b.tokens - a.tokens) || (b.requests - a.requests));
    return list;
  }, [view, modelSort]);

  const visibleModelRows = showAllModels ? sortedModels : sortedModels.slice(0, 10);

  const quotaCards = useMemo<QuotaRowItem[]>(() => {
    const items: QuotaRowItem[] = [];
    const installedIds = new Set(visibleClis.map((c) => c.id));
    const pushQuota = (id: string, cliId: string, title: string, subtitle: string | undefined, q?: QuotaData) => {
      if (!q) return;
      if (cliId === 'agy' && q.quotaGroups && q.quotaGroups.length > 0) {
        for (const g of q.quotaGroups) {
          const windows: QuotaRowItem['windows'] = [];
          if (g.fiveHourPercent >= 0) windows.push({ label: t('5 小时窗口'), remainingPct: g.fiveHourPercent, reset: g.fiveHourResetsIn });
          if (g.sevenDayPercent >= 0) windows.push({ label: t('7 天窗口'), remainingPct: g.sevenDayPercent, reset: g.sevenDayResetsOn });
          items.push({ id: `${id}:${g.group}`, cliId, title, subtitle: g.group, windows });
        }
        return;
      }
      const windows: QuotaRowItem['windows'] = [];
      if (q.fiveHourPercent >= 0) windows.push({ label: t('5 小时窗口'), remainingPct: q.fiveHourPercent, reset: q.fiveHourResetsIn });
      if (q.sevenDayPercent >= 0) windows.push({ label: t('7 天窗口'), remainingPct: q.sevenDayPercent, reset: q.sevenDayResetsOn });
      items.push({ id, cliId, title, subtitle, windows, message: windows.length === 0 ? q.message : undefined });
    };

    for (const cliId of ['agy', 'codex', 'claude', 'kimi'] as const) {
      if (!installedIds.has(cliId) && !quotas[cliId]) continue;
      const q = quotas[cliId];
      const title = q?.cliName ?? (cliId === 'kimi' ? 'Kimi Code' : CLI_LABELS[cliId]);
      const cliAccounts = accounts.filter((a) => a.cliId === cliId);
      pushQuota(cliId, cliId, title, cliAccounts.length > 0 ? t('默认账号') : (q?.model || undefined), q);
      for (const acc of cliAccounts) {
        pushQuota(acc.id, cliId, title, acc.name, quotas[acc.id]);
      }
    }
    return items;
  }, [quotas, visibleClis, accounts, language]);

  const tokenKpiLabel = filter.range === 'today'
    ? t('今日 Token')
    : filter.range === '7d'
      ? t('近 7 天 Token')
      : filter.range === '30d'
        ? t('近 30 天 Token')
        : filter.range === 'all'
          ? t('全部 Token')
          : t('年度 Token');

  const trendTitle = view?.trend.monthly ? t('月度趋势') : t('每日趋势');
  const trendSubtitle = trendMetric === 'cost'
    ? (view?.trend.monthly ? t('按自然月查看估算成本，首尾月份按所选范围统计') : t('按日查看估算成本趋势'))
    : trendMetric === 'sessions'
      ? (view?.trend.monthly ? t('按自然月查看活跃 Session，首尾月份按所选范围统计') : t('按日查看活跃 Session 趋势'))
      : (view?.trend.monthly ? t('按自然月查看 Token 消耗，首尾月份按所选范围统计') : t('按日查看 Token 消耗趋势'));

  const trendMetricValue = (bucket: { tokens: number; cost: number; sessions: number }) =>
    trendMetric === 'cost' ? bucket.cost : trendMetric === 'sessions' ? bucket.sessions : bucket.tokens;

  const formatTrendValue = (val: number) =>
    trendMetric === 'cost' ? formatUsd(val) : trendMetric === 'sessions' ? String(Math.round(val)) : formatCompactTokens(val);

  const maxTrendVal = useMemo(() => {
    if (!view) return 0;
    return Math.max(0, ...view.trend.buckets.map((b) => {
      if (trendGrouping === 'total') return trendMetricValue(b);
      return CLI_ORDER.reduce((sum, cliId) => sum + trendMetricValue(b.byCli[cliId] ?? { tokens: 0, cost: 0, sessions: 0 }), 0);
    }));
  }, [view, trendMetric, trendGrouping]);

  const hoveredBucket = view?.trend.buckets.find((b) => b.key === hoveredBucketKey) ?? null;

  const accountOptions = useMemo(() => {
    if (!stats) return [];
    return stats.accounts.map((a) => ({
      value: `${a.cliId}:${a.accountId}`,
      label: `${CLI_LABELS[a.cliId]} · ${a.name}`,
    }));
  }, [stats]);

  const donutSegments = useMemo(() => {
    if (!view || view.totalTokens <= 0) return [];
    const r = 42;
    const c = 2 * Math.PI * r;
    let offset = 0;
    return view.composition.map((item) => {
      const len = (item.pct / 100) * c;
      const seg = { ...item, dasharray: `${len} ${c}`, dashoffset: -offset };
      offset += len;
      return seg;
    });
  }, [view]);

  const cacheReadShare = view && view.totalTokens > 0 ? (view.cacheReadTokens / view.totalTokens) * 100 : 0;

  const selectClass = 'h-8 rounded-lg border border-line bg-surface px-2.5 text-xs text-fg outline-none transition-colors hover:border-line-strong focus:border-accent';
  const cardClass = 'rounded-xl border border-line bg-surface/70 p-4 transition-colors hover:border-line-strong';

  const scrollToModels = () => {
    document.getElementById('dashboard-model-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  return (
    <div id="oneai-dashboard-view" className="h-full w-full overflow-y-auto bg-canvas text-fg">
      <div className="mx-auto max-w-[82rem] space-y-5 px-6 py-6">
        {/* 顶部标题与操作栏 */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-fg-faint">{t('使用足迹')}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-fg">Dashboard.</h1>
            <p className="mt-1 text-ui text-fg-subtle">{t('从每日使用，到每一次投入。')}</p>
          </div>
          <div className="flex items-center gap-2">
            {onBackToTerminal && (
              <button type="button" onClick={onBackToTerminal} className="btn-secondary h-8 px-3 text-xs">
                <ArrowLeft size={14} aria-hidden="true" />
                <span>{t('返回终端')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={loading}
              aria-label={t('刷新 Dashboard 数据')}
              className="btn-secondary h-8 px-3 text-xs"
            >
              <RotateCw size={13} className={loading ? 'animate-spin text-accent' : ''} aria-hidden="true" />
              <span>{t('刷新')}</span>
            </button>
          </div>
        </header>

        {/* 数据覆盖状态条 */}
        {view && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface/55 px-3.5 py-2 text-xs text-fg-subtle">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <span>
                {t('区间记录已整理 · {active} 天有记录 · {missing} 天无日志 · 价格覆盖 {pct}%', {
                  active: view.rangeActiveDays,
                  missing: view.rangeMissingDays,
                  pct: view.priceCoveragePct.toFixed(1),
                })}
              </span>
            </div>
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-1.5">
                {filter.cliId !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setFilter((p) => ({ ...p, cliId: 'all' }))}
                    className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-2xs text-accent hover:bg-accent/20"
                  >
                    {CLI_LABELS[filter.cliId]} ×
                  </button>
                )}
                {filter.projectKey !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setFilter((p) => ({ ...p, projectKey: 'all' }))}
                    className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-2xs text-accent hover:bg-accent/20"
                  >
                    {stats?.projects.find((p) => p.key === filter.projectKey)?.name ?? filter.projectKey} ×
                  </button>
                )}
                {filter.accountKey !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setFilter((p) => ({ ...p, accountKey: 'all' }))}
                    className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-2xs text-accent hover:bg-accent/20"
                  >
                    {accountOptions.find((a) => a.value === filter.accountKey)?.label ?? filter.accountKey} ×
                  </button>
                )}
                {filter.modelKey && (
                  <button
                    type="button"
                    onClick={() => setFilter((p) => ({ ...p, modelKey: undefined }))}
                    className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-2xs text-accent hover:bg-accent/20"
                  >
                    {view.breakdowns.model[0]?.label ?? filter.modelKey.slice(filter.modelKey.indexOf(':') + 1)} ×
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-fg-muted hover:bg-hover hover:text-fg"
                >
                  <FilterX size={12} aria-hidden="true" />
                  <span>{t('清除筛选')}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 时间选项卡 + 三维过滤下拉 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={t('时间范围')}>
              {RANGE_OPTIONS.map((opt) => {
                const active = filter.range === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-dashboard-range={opt.id}
                    onClick={() => setFilter((prev) => ({ ...prev, range: opt.id }))}
                    className={`relative rounded-md px-3 py-1.5 text-ui transition-colors ${
                      active ? 'font-semibold text-fg' : 'text-fg-subtle hover:bg-hover/60 hover:text-fg-muted'
                    }`}
                  >
                    {t(opt.label)}
                    {active && <span className="absolute inset-x-2 -bottom-2 h-0.5 rounded-full bg-accent" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            {stats && view && (
              <p className="px-1 font-mono text-2xs text-fg-faint" data-dashboard-range-dates>
                {view.startDate} -- {view.endDate} · {stats.timezone}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t('按 Agent 筛选')}
              data-dashboard-filter="agent"
              value={filter.cliId}
              onChange={(e) => setFilter((prev) => ({ ...prev, cliId: e.target.value as DashboardFilter['cliId'] }))}
              className={selectClass}
            >
              <option value="all">{t('全部 Agent')}</option>
              {CLI_ORDER.map((id) => (
                <option key={id} value={id}>{CLI_LABELS[id]}</option>
              ))}
            </select>

            <select
              aria-label={t('按项目筛选')}
              data-dashboard-filter="project"
              value={filter.projectKey}
              onChange={(e) => setFilter((prev) => ({ ...prev, projectKey: e.target.value }))}
              className={`${selectClass} max-w-[13rem]`}
            >
              <option value="all">{t('全部项目')}</option>
              {(stats?.projects ?? []).map((p) => (
                <option key={p.key} value={p.key} title={p.path}>{p.name}</option>
              ))}
            </select>

            <select
              aria-label={t('按账号筛选')}
              data-dashboard-filter="account"
              value={filter.accountKey}
              onChange={(e) => setFilter((prev) => ({ ...prev, accountKey: e.target.value }))}
              className={`${selectClass} max-w-[13rem]`}
            >
              <option value="all">{t('全部账号')}</option>
              {accountOptions.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading && !stats && (
          <div className="rounded-xl border border-line bg-surface/60 p-12 text-center text-sm text-fg-subtle">
            {t('正在整理本机各 CLI 会话与用量记录…')}
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {stats && view && (
          <>
            {/* 第 1 行：4 张核心 KPI 卡片 */}
            <section aria-label={t('核心指标')} data-dashboard-kpis className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className={cardClass} data-kpi="tokens">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-fg-subtle">{tokenKpiLabel}</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <Layers size={14} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums text-fg">
                  {formatCompactTokens(view.totalTokens)}
                </p>
                <p className={`mt-1.5 text-2xs ${
                  view.comparison.comparable && view.comparison.deltaPct !== null
                    ? (view.comparison.deltaPct >= 0 ? 'text-success' : 'text-danger')
                    : 'text-fg-faint'
                }`}>
                  {view.comparison.comparable && view.comparison.deltaPct !== null
                    ? `${view.comparison.deltaPct >= 0 ? '+' : ''}${view.comparison.deltaPct.toFixed(1)}% ${t('较上一周期')}`
                    : t('暂不比较 · 两期覆盖尚不可比')}
                </p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <span className="truncate text-2xs tabular-nums text-fg-faint">
                    {t('{n} 条用量记录 · 仅计已知总量', { n: view.recordCount.toLocaleString() })}
                  </span>
                  <span className="flex h-4 shrink-0 items-end gap-0.5" aria-hidden="true">
                    {view.sparkline.map((ratio, idx) => (
                      <span
                        key={idx}
                        className="w-1 rounded-t-sm bg-accent/75"
                        style={{ height: `${Math.max(12, Math.round(ratio * 100))}%` }}
                      />
                    ))}
                  </span>
                </div>
              </div>

              <div className={cardClass} data-kpi="sessions">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-fg-subtle">{t('活跃 Session')}</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet/15 text-violet">
                    <Activity size={14} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums text-violet">
                  {view.activeSessions.toLocaleString()}
                </p>
                <p className="mt-1.5 text-2xs text-fg-faint">{t('区间内有用量的原生会话')}</p>
                <p className="mt-2 truncate text-2xs tabular-nums text-fg-faint">
                  {t('来自 {agents} 个 Agent、{projects} 个项目', { agents: view.activeAgents, projects: view.activeProjects })}
                </p>
              </div>

              <div className={cardClass} data-kpi="cost">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-fg-subtle">{t('API 等值估算')}</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/15 text-warning">
                    <Coins size={14} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums text-warning">
                  {view.pricedTokens > 0 ? `≈ ${formatUsd(view.estimatedCostUsd)}` : '--'}
                </p>
                <p className="mt-1.5 text-2xs text-fg-faint">{t('已知金额小计 · 非订阅账单')}</p>
                <p className="mt-2 truncate text-2xs tabular-nums text-fg-faint">
                  {t('价格覆盖 {pct}% Token', { pct: view.priceCoveragePct.toFixed(1) })}
                </p>
              </div>

              <div className={cardClass} data-kpi="cache">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-fg-subtle">{t('输入缓存命中率')}</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/15 text-success">
                    <Check size={14} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums text-success">
                  {view.cacheHitPct !== null ? formatPercent(view.cacheHitPct) : '--'}
                </p>
                <p className="mt-1.5 text-2xs text-fg-faint">{t('缓存读取 / 可核对的输入总量')}</p>
                <div className="mt-2 space-y-1">
                  <p className="truncate text-2xs tabular-nums text-fg-faint">
                    {t('有效样本覆盖 {pct}% Token', { pct: view.cacheSampleCoveragePct.toFixed(1) })}
                  </p>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-control">
                    <div
                      className="h-full rounded-full bg-success transition-all"
                      style={{ width: `${Math.min(100, Math.round(view.cacheSampleCoveragePct))}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 第 2 行：全宽 12 个月每日记录热力图 */}
            <section aria-label={t('每日记录')} data-dashboard-heatmap-card className={cardClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-2xs font-medium text-fg-faint">{t('每日记录')}</p>
                  <h2 className="mt-0.5 text-base font-semibold text-fg">{t('每一天，都有记录。')}</h2>
                  <p className="mt-0.5 font-mono text-2xs text-fg-faint">
                    {view.heatmap.startDate.replace(/-/g, '/')} -- {view.heatmap.endDate.replace(/-/g, '/')} · {t('每个方格代表一天')}
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xl font-semibold tabular-nums text-fg">{view.heatmap.activeDays}</span>
                  <span className="text-xs text-fg-subtle">{t('个活跃日')}</span>
                  <span className="rounded-md border border-line bg-canvas/50 px-2 py-1 text-2xs text-fg-subtle">
                    {t('最近 12 个月')}
                  </span>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto pb-1" onMouseLeave={() => setHoveredCell(null)}>
                <div
                  className="grid w-full min-w-[42rem] gap-1"
                  style={{
                    gridTemplateColumns: `auto repeat(${Math.max(1, view.heatmap.weeks.length)}, minmax(0, 1fr))`,
                    gridTemplateRows: '1rem repeat(7, auto)',
                  }}
                  role="group"
                  aria-label={t('每日 Token 活跃度方块图')}
                  data-dashboard-heatmap
                >
                  <div className="row-span-full grid grid-rows-subgrid items-center pr-1.5 text-2xs leading-none text-fg-faint" aria-hidden="true">
                    <span />
                    {weekdays().map((name, idx) => <span key={name}>{idx % 2 === 0 ? name : ''}</span>)}
                  </div>
                  {view.heatmap.weeks.map((week, column) => {
                    const month = Number(week[0].date.slice(5, 7));
                    const nextMonth = column + 1 < view.heatmap.weeks.length ? Number(view.heatmap.weeks[column + 1][0].date.slice(5, 7)) : month;
                    const showMonth = column === 0 ? nextMonth === month : month !== Number(view.heatmap.weeks[column - 1][0].date.slice(5, 7));
                    const isLast = column === view.heatmap.weeks.length - 1;
                    return (
                      <div key={week[0].date} className="row-span-full grid grid-rows-subgrid">
                        <span className="relative text-2xs leading-4 text-fg-faint" aria-hidden="true">
                          {showMonth && (
                            <span className={`absolute top-0 whitespace-nowrap ${isLast ? 'right-0' : 'left-0'}`}>
                              {t(`${month}月`)}
                            </span>
                          )}
                        </span>
                        {week.map((cell) => {
                          const visual = cell.status === 'future'
                            ? 'bg-control/25 opacity-35'
                            : cell.status === 'missing'
                              ? 'heatmap-cell-missing'
                              : HEATMAP_LEVEL_CLASSES[cell.level];
                          const dimOut = filter.range !== 'overview' && filter.range !== 'all' && !cell.inActiveRange && cell.status !== 'future'
                            ? 'opacity-45'
                            : '';
                          const title = cell.status === 'future'
                            ? undefined
                            : cell.status === 'missing'
                              ? t('{date}：无日志覆盖', { date: cell.date })
                              : cell.tokens > 0
                                ? t('{date}：{tokens} Token · {requests} 次请求 · {sessions} 个会话', {
                                  date: cell.date,
                                  tokens: formatCompactTokens(cell.tokens),
                                  requests: cell.requests,
                                  sessions: cell.sessions,
                                })
                                : t('{date}：无请求', { date: cell.date });
                          return (
                            <span
                              key={cell.date}
                              title={title}
                              onMouseEnter={cell.status === 'future' ? undefined : () => setHoveredCell(cell)}
                              data-dashboard-cell
                              data-date={cell.date}
                              data-status={cell.status}
                              data-level={cell.level}
                              className={`aspect-square w-full rounded-[3px] transition-opacity ${visual} ${dimOut} ${cell.date === todayStr ? 'ring-1 ring-accent' : ''}`}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-2xs text-fg-faint">
                <span className="truncate tabular-nums">
                  {hoveredCell
                    ? (hoveredCell.status === 'missing'
                      ? t('{date}：无日志覆盖', { date: hoveredCell.date })
                      : t('{date}：{tokens} Token · {requests} 次请求 · {sessions} 个会话', {
                        date: hoveredCell.date,
                        tokens: formatCompactTokens(hoveredCell.tokens),
                        requests: hoveredCell.requests,
                        sessions: hoveredCell.sessions,
                      }))
                    : view.heatmap.peakDay
                      ? `${t('峰值日 {date} · {tokens} Token', {
                        date: view.heatmap.peakDay.date.slice(5).replace('-', '/'),
                        tokens: formatCompactTokens(view.heatmap.peakDay.tokens),
                      })} · ${t('{n} 天无日志', { n: view.heatmap.missingDays })}`
                      : t('当前筛选条件下暂无活跃记录')}
                </span>
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  <span>{t('少')}</span>
                  {HEATMAP_LEVEL_CLASSES.map((cls) => <span key={cls} className={`h-3 w-3 rounded-[3px] ${cls}`} />)}
                  <span>{t('多')}</span>
                  <span className="mx-1">·</span>
                  <span className="heatmap-cell-missing inline-block h-3 w-3 rounded-[3px]" />
                  <span>{t('斜线缺失')}</span>
                </div>
              </div>
            </section>

            {/* 第 3 行：趋势柱状图 + Top 5 用量分布 */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <section aria-label={trendTitle} data-dashboard-trend className={`${cardClass} min-w-0 xl:col-span-7`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-fg">{trendTitle}</h2>
                    <p className="mt-0.5 text-2xs text-fg-faint">{trendSubtitle}</p>
                  </div>
                  <div className="inline-flex rounded-lg border border-line bg-canvas/50 p-0.5 text-2xs">
                    {([
                      ['tokens', 'Token'],
                      ['cost', T('成本')],
                      ['sessions', 'Session'],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        data-trend-metric={id}
                        aria-pressed={trendMetric === id}
                        onClick={() => setTrendMetric(id)}
                        className={`rounded-md px-2.5 py-1 transition-colors ${
                          trendMetric === id ? 'bg-selected font-medium text-fg' : 'text-fg-subtle hover:text-fg'
                        }`}
                      >
                        {t(label)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      aria-label={t('趋势展示方式')}
                      value={trendGrouping}
                      onChange={(e) => setTrendGrouping(e.target.value as TrendGrouping)}
                      className="h-7 rounded-md border border-line bg-canvas/60 px-2 text-2xs text-fg outline-none focus:border-accent"
                    >
                      <option value="stacked">{t('按分类')}</option>
                      <option value="total">{t('汇总')}</option>
                    </select>
                    {trendGrouping === 'stacked' && (
                      <div className="flex flex-wrap items-center gap-2.5 text-2xs text-fg-subtle">
                        {CLI_ORDER.map((cliId) => (
                          <span key={cliId} className="inline-flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${CLI_DOT_CLASSES[cliId]}`} aria-hidden="true" />
                            <span>{CLI_LABELS[cliId]}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-2xs tabular-nums text-fg-subtle">
                    {hoveredBucket
                      ? `${hoveredBucket.label}: ${formatTrendValue(trendMetricValue(hoveredBucket))}`
                      : (view.trend.monthly ? t('月度汇总') : t('每日汇总'))}
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  {/* Y 轴刻度 */}
                  <div className="flex h-44 w-12 shrink-0 flex-col justify-between pb-5 text-right font-mono text-2xs tabular-nums text-fg-faint" aria-hidden="true">
                    <span>{formatTrendValue(maxTrendVal)}</span>
                    <span>{formatTrendValue(maxTrendVal * (2 / 3))}</span>
                    <span>{formatTrendValue(maxTrendVal * (1 / 3))}</span>
                    <span>0</span>
                  </div>

                  {/* 柱状图区 */}
                  <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto" onMouseLeave={() => setHoveredBucketKey(null)}>
                    {view.trend.buckets.map((bucket, idx) => {
                      const val = trendMetricValue(bucket);
                      const stackSum = CLI_ORDER.reduce((sum, cliId) => sum + trendMetricValue(bucket.byCli[cliId] ?? { tokens: 0, cost: 0, sessions: 0 }), 0);
                      const displayVal = trendGrouping === 'total' ? val : stackSum;
                      const heightPct = maxTrendVal > 0 && displayVal > 0 ? Math.max(3, (displayVal / maxTrendVal) * 100) : 0;
                      const labelStep = Math.max(1, Math.ceil(view.trend.buckets.length / 7));
                      const showLabel = idx === view.trend.buckets.length - 1 || idx % labelStep === 0;
                      const tipParts = CLI_ORDER
                        .map((id) => {
                          const v = trendMetricValue(bucket.byCli[id] ?? { tokens: 0, cost: 0, sessions: 0 });
                          return v > 0 ? `${CLI_LABELS[id]} ${formatTrendValue(v)}` : '';
                        })
                        .filter(Boolean);

                      return (
                        <div
                          key={bucket.key}
                          onMouseEnter={() => setHoveredBucketKey(bucket.key)}
                          title={`${bucket.key}: ${formatTrendValue(displayVal)}${tipParts.length ? ` (${tipParts.join(' · ')})` : ''}`}
                          className={`group flex flex-1 flex-col items-center ${filter.range === 'all' ? 'min-w-2' : 'min-w-0'}`}
                        >
                          <div className="flex h-[9.75rem] w-full items-end justify-center rounded-sm px-px transition-colors group-hover:bg-hover/40">
                            {trendGrouping === 'total' ? (
                              <div
                                className="w-full max-w-[1.5rem] rounded-t-sm bg-accent transition-all"
                                style={{ height: `${heightPct}%` }}
                              />
                            ) : (
                              <div
                                className="flex w-full max-w-[1.5rem] flex-col-reverse overflow-hidden rounded-t-sm"
                                style={{ height: `${heightPct}%` }}
                              >
                                {CLI_ORDER.map((cliId) => {
                                  const segVal = trendMetricValue(bucket.byCli[cliId] ?? { tokens: 0, cost: 0, sessions: 0 });
                                  if (segVal <= 0 || displayVal <= 0) return null;
                                  return (
                                    <div
                                      key={cliId}
                                      className={`w-full ${CLI_BAR_CLASSES[cliId]}`}
                                      style={{ height: `${(segVal / displayVal) * 100}%` }}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <span className="mt-1 h-4 truncate font-mono text-2xs text-fg-faint">
                            {showLabel ? bucket.label : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <p className="mt-2 text-center text-2xs text-fg-faint">
                  {trendMetric === 'sessions'
                    ? t('同一会话可在多天活跃，不能直接按日相加')
                    : t('按本地日期统计区间内已记录用量')}
                </p>
              </section>

              <section aria-label={t('用量分布')} data-dashboard-breakdown className={`${cardClass} flex flex-col justify-between xl:col-span-5`}>
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-fg">{t('用量分布')}</h2>
                      <p className="mt-0.5 text-2xs text-fg-faint">{t('区间用量 Top 5 · 点击筛选')}</p>
                    </div>
                    <select
                      aria-label={t('选择分布维度')}
                      value={breakdownDim}
                      onChange={(e) => setBreakdownDim(e.target.value as BreakdownDimension)}
                      className="h-7 rounded-md border border-line bg-canvas/60 px-2 text-2xs text-fg outline-none focus:border-accent"
                    >
                      <option value="agent">{t('按 Agent')}</option>
                      <option value="model">{t('按模型')}</option>
                      <option value="project">{t('按项目')}</option>
                      <option value="account">{t('按账号')}</option>
                    </select>
                  </div>

                  <div className="mt-4 space-y-3">
                    {view.breakdowns[breakdownDim].length === 0 ? (
                      <p className="py-10 text-center text-xs text-fg-faint">{t('暂无分布数据')}</p>
                    ) : view.breakdowns[breakdownDim].map((item) => {
                      const titleText = breakdownDim === 'agent' && item.cliId ? CLI_LABELS[item.cliId] : item.label;
                      const isFiltered = Boolean(
                        (item.filterPatch?.cliId && filter.cliId === item.filterPatch.cliId)
                        || (item.filterPatch?.projectKey && filter.projectKey === item.filterPatch.projectKey)
                        || (item.filterPatch?.accountKey && filter.accountKey === item.filterPatch.accountKey)
                        || (item.filterPatch?.modelKey && filter.modelKey === item.filterPatch.modelKey),
                      );
                      const barCls = item.cliId ? CLI_BAR_CLASSES[item.cliId] : 'bg-accent';
                      return (
                        <button
                          key={item.key}
                          type="button"
                          data-breakdown-item={item.key}
                          disabled={!item.filterPatch}
                          onClick={() => toggleFilter(item.filterPatch)}
                          title={item.sublabel || titleText}
                          className={`block w-full rounded-lg p-1.5 text-left transition-colors ${
                            isFiltered ? 'bg-selected/70 ring-1 ring-accent/50' : item.filterPatch ? 'hover:bg-hover/50' : 'cursor-default'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 items-center gap-2 font-medium text-fg">
                              {item.cliId ? (
                                <BrandIcon icon={item.cliId} size={14} />
                              ) : (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                              )}
                              <span className="truncate">{titleText}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2 font-mono text-2xs tabular-nums">
                              <span className="font-semibold text-fg">{formatCompactTokens(item.tokens)}</span>
                              <span className="w-11 text-right text-fg-faint">{item.sharePct.toFixed(1)}%</span>
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-control/80">
                            <div
                              className={`h-full rounded-full ${barCls}`}
                              style={{ width: `${item.tokens > 0 ? Math.max(2, item.sharePct) : 0}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-2xs text-fg-faint">
                  <span>{t('占区间 Token 总量的比例')}</span>
                  <button
                    type="button"
                    onClick={scrollToModels}
                    className="font-medium text-accent hover:underline"
                  >
                    {t('查看模型明细')} →
                  </button>
                </div>
              </section>
            </div>

            {/* 第 4 行：Token 构成环形图 + 账号配额实时快照 */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <section aria-label={t('Token 构成')} data-dashboard-composition className={cardClass}>
                <h2 className="text-base font-semibold text-fg">{t('Token 构成')}</h2>
                <p className="mt-0.5 text-2xs text-fg-faint">{t('输入、缓存与输出的消耗分布')}</p>

                <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
                  <div className="relative h-36 w-36 shrink-0">
                    <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
                      <circle cx="60" cy="60" r="42" fill="none" stroke="rgb(var(--color-control))" strokeWidth="13" />
                      {donutSegments.map((seg) => (
                        <circle
                          key={seg.id}
                          cx="60"
                          cy="60"
                          r="42"
                          fill="none"
                          stroke={COMP_COLORS[seg.id].stroke}
                          strokeWidth="13"
                          strokeDasharray={seg.dasharray}
                          strokeDashoffset={seg.dashoffset}
                        />
                      ))}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="font-mono text-lg font-bold tabular-nums text-fg">
                        {formatPercent(cacheReadShare)}
                      </span>
                      <span className="text-2xs text-fg-faint">{t('缓存读取占总量')}</span>
                    </div>
                  </div>

                  <div className="w-full min-w-0 flex-1 space-y-2.5">
                    {view.composition.map((item) => {
                      const meta = COMP_COLORS[item.id];
                      return (
                        <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-2 text-fg-muted">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
                            <span>{t(meta.label)}</span>
                          </span>
                          <span className="flex items-center gap-3 font-mono tabular-nums">
                            <span className="font-semibold text-fg">{formatCompactTokens(item.tokens)}</span>
                            <span className="w-12 text-right text-2xs text-fg-faint">{item.pct.toFixed(1)}%</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section aria-label={t('账号配额')} data-dashboard-quotas className={cardClass}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-fg">{t('账号配额')}</h2>
                    <p className="mt-0.5 text-2xs text-fg-faint">{t('当前快照，与上方历史日期独立')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefreshQuotaOnly}
                    disabled={quotaRefreshing}
                    aria-label={t('刷新配额')}
                    title={t('刷新配额')}
                    className="icon-btn h-7 w-7 border border-line bg-canvas/50"
                  >
                    <RotateCw size={13} className={quotaRefreshing ? 'animate-spin text-accent' : ''} aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-4 space-y-3.5">
                  {quotaCards.length === 0 ? (
                    <p className="py-8 text-center text-xs text-fg-faint">{t('暂未检测到支持实时额度的 CLI')}</p>
                  ) : quotaCards.map((item) => (
                    <div key={item.id} data-dashboard-quota-item={item.id} className="rounded-lg border border-line/70 bg-canvas/40 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2 text-xs">
                          <BrandIcon icon={item.cliId} size={14} />
                          <span className="font-semibold text-fg">{item.title}</span>
                          {item.subtitle && <span className="truncate text-fg-faint">{item.subtitle}</span>}
                        </span>
                        {item.message && <span className="truncate text-2xs text-fg-faint">{item.message}</span>}
                      </div>

                      {item.windows.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {item.windows.map((w) => {
                            const usedPct = Math.max(0, Math.min(100, 100 - w.remainingPct));
                            return (
                              <div key={w.label}>
                                <div className="flex items-center justify-between gap-2 text-2xs">
                                  <span className="text-fg-subtle">{w.label}</span>
                                  <span className="flex items-center gap-2 font-mono tabular-nums">
                                    <span className="font-semibold text-fg">{t('{pct}% 已用', { pct: usedPct })}</span>
                                    <span className="text-fg-faint">{resetDisplay(w.reset)}</span>
                                  </span>
                                </div>
                                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-control">
                                  <div
                                    className={`h-full rounded-full transition-all ${quotaBarColor(usedPct)}`}
                                    style={{ width: `${usedPct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* 第 5 行：模型明细表 */}
            <section id="dashboard-model-details" aria-label={t('模型明细')} className={cardClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BarChart3 size={15} className="text-accent" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-fg">{t('模型明细')}</h2>
                  <span className="rounded-full border border-line bg-canvas/60 px-2 py-px text-2xs tabular-nums text-fg-subtle">
                    {t('{n} 项', { n: sortedModels.length })}
                  </span>
                </div>
                <div className="inline-flex rounded-lg border border-line bg-canvas/50 p-0.5 text-2xs">
                  {([
                    ['tokens', 'Token'],
                    ['cost', T('成本')],
                    ['requests', T('请求')],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      data-model-sort={id}
                      aria-pressed={modelSort === id}
                      onClick={() => setModelSort(id)}
                      className={`rounded-md px-2.5 py-1 transition-colors ${
                        modelSort === id ? 'bg-selected font-medium text-fg' : 'text-fg-subtle hover:text-fg'
                      }`}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
              </div>

              {sortedModels.length === 0 ? (
                <p className="py-8 text-center text-xs text-fg-faint">{t('当前区间暂无模型用量记录')}</p>
              ) : (
                <>
                  <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-canvas/35">
                    <table className="w-full min-w-[44rem] border-collapse text-xs">
                      <thead className="bg-panel/80 text-fg-faint">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">{t('CLI / 模型')}</th>
                          <th className="px-2.5 py-2 text-right font-medium">{t('请求')}</th>
                          <th className="px-2.5 py-2 text-right font-medium">{t('会话')}</th>
                          <th className="px-2.5 py-2 text-right font-medium">{t('输入')}</th>
                          <th className="px-2.5 py-2 text-right font-medium">{t('输出')}</th>
                          <th className="px-2.5 py-2 text-right font-medium">{t('缓存')}</th>
                          <th className="px-2.5 py-2 text-right font-medium">{t('命中率')}</th>
                          <th className="px-2.5 py-2 text-right font-medium">{t('合计 Token')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('估算成本')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleModelRows.map((row) => {
                          const cacheTotal = row.cacheRead + row.cacheWrite;
                          const pct = view.maxModelTokens > 0 ? Math.max(2, (row.tokens / view.maxModelTokens) * 100) : 0;
                          return (
                            <tr key={`${row.cliId}:${row.accountId}:${row.model}`} data-dashboard-model-row className="border-t border-line/70 hover:bg-hover/40">
                              <td className="px-3 py-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <BrandIcon icon={row.cliId} size={14} />
                                  <span className="truncate font-medium text-fg">{row.model}</span>
                                  {row.accountId !== 'default' && (
                                    <span className="shrink-0 rounded border border-line px-1 text-2xs text-fg-subtle">{row.accountName}</span>
                                  )}
                                  {row.subagent && (
                                    <span className="shrink-0 rounded-full border border-line-strong bg-surface px-1.5 text-2xs text-fg-subtle">{t('子会话')}</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2.5 py-2 text-right font-mono tabular-nums text-fg">{row.requests.toLocaleString()}</td>
                              <td className="px-2.5 py-2 text-right font-mono tabular-nums text-fg-muted">{row.sessions}</td>
                              <td className="px-2.5 py-2 text-right font-mono tabular-nums text-fg-subtle">{formatCompactTokens(row.input)}</td>
                              <td className="px-2.5 py-2 text-right font-mono tabular-nums text-fg-subtle">{formatCompactTokens(row.output)}</td>
                              <td className="px-2.5 py-2 text-right font-mono tabular-nums text-fg-subtle">{formatCompactTokens(cacheTotal)}</td>
                              <td className="px-2.5 py-2 text-right font-mono tabular-nums text-fg-subtle">
                                {row.cacheHitPct !== null ? formatPercent(row.cacheHitPct) : '--'}
                              </td>
                              <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                                <span className="font-semibold text-fg">{formatCompactTokens(row.tokens)}</span>
                                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-control">
                                  <span className={`block h-full rounded-full ${CLI_BAR_CLASSES[row.cliId]}`} style={{ width: `${pct}%` }} />
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums text-fg-muted">
                                {row.costPriced ? formatUsd(row.costUsd) : t('未定价')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {sortedModels.length > 10 && (
                    <div className="mt-2.5 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setShowAllModels((v) => !v)}
                        className="btn-secondary h-7 px-3 text-2xs"
                      >
                        {showAllModels ? t('收起') : t('展开全部 ({n})', { n: sortedModels.length })}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* 第 6 行：工作区打开任务快捷跳转（点击直达对应保活终端） */}
            {tasks.length > 0 && (
              <section aria-label={t('当前工作区任务')} data-dashboard-tasks className={cardClass}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Cpu size={14} className="text-accent" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-fg">{t('当前工作区任务')}</h2>
                    <span className="rounded-full bg-muted px-1.5 text-2xs tabular-nums text-fg-subtle">{tasks.length}</span>
                  </div>
                  <span className="text-2xs text-fg-faint">{t('后台保持运行，点击任务立即切回终端')}</span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {tasks.map((task) => {
                    const meta = TASK_STATUS_META[task.status];
                    return (
                      <button
                        key={task.id}
                        type="button"
                        data-dashboard-task={task.id}
                        onClick={() => onSelectTask(task.id)}
                        className="flex items-center gap-2.5 rounded-lg border border-line bg-canvas/45 px-3 py-2 text-left transition-colors hover:border-accent/60 hover:bg-hover/60"
                      >
                        <BrandIcon icon={task.groupId} size={15} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-fg">{task.title}</span>
                          <span className="block truncate text-2xs text-fg-faint">{folderName(task.cwd)}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-2xs text-fg-subtle">
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
                          <span>{meta.label}</span>
                        </span>
                        <Terminal size={12} className="shrink-0 text-fg-faint" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 底部说明 */}
            <div className="flex items-start gap-2 rounded-xl border border-line/70 bg-surface/40 px-3.5 py-2.5 text-2xs leading-relaxed text-fg-faint">
              <Info size={13} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden="true" />
              <p>
                {t('汇总本机 Claude Code、Codex、Antigravity 与 Pi 的历史会话记录；API 等值成本按公开费率对已收录模型估算（Pi 优先采用日志原生费用），内部模型与未定价模型记为「未定价」并计入价格覆盖率，仅供参考而非实际账单。')}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

DashboardView.displayName = 'DashboardView';
