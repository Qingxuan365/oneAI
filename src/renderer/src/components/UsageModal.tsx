import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  ChevronsUpDown,
  Database,
  Info,
  Layers,
  RotateCw,
  User,
} from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import { Modal } from './Modal';
import { Account, UsageCli, UsageDay, UsageRow, UsageStats } from '../types';
import { t } from '../i18n';

const CLI_LABELS: Record<UsageCli, string> = { claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity', pi: 'Pi' };
const CLI_BAR_CLASSES: Record<UsageCli, string> = {
  agy: 'bg-accent',
  claude: 'bg-warning',
  codex: 'bg-success',
  pi: 'bg-violet',
};
const CLI_DOT_CLASSES: Record<UsageCli, string> = {
  agy: 'bg-accent',
  claude: 'bg-warning',
  codex: 'bg-success',
  pi: 'bg-violet',
};
const weekdays = () => [t('一'), t('二'), t('三'), t('四'), t('五'), t('六'), t('日')];

/** 方块颜色：0 次为底色，其余按当天请求数占范围内最大值的比例分 4 档（沿用主题的 success 色，随主题变化） */
const LEVEL_CLASSES = ['bg-control/85', 'bg-success/25', 'bg-success/50', 'bg-success/75', 'bg-success'];

const rowTokens = (row: UsageRow) => row.input + row.output + row.cacheRead + row.cacheWrite;

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

const pad = (n: number) => String(n).padStart(2, '0');

function dayLevel(requests: number, max: number): number {
  if (requests <= 0 || max <= 0) return 0;
  return Math.max(1, Math.ceil((requests / max) * 4));
}

function dayTitle(day: UsageDay, weekday: string, label: (key: string) => string): string {
  if (day.requests === 0) return t('{date}（周{weekday}）：无请求', { date: day.date, weekday });
  const order = (key: string) => (Object.keys(CLI_LABELS) as string[]).indexOf(key.slice(0, key.indexOf(':')));
  const parts = Object.keys(day.by)
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .map((key) => `${label(key)} ${day.by[key]}`);
  return t('{date}（周{weekday}）：{n} 次请求（{parts}）', { date: day.date, weekday, n: day.requests, parts: parts.join(t('，')) });
}

interface UsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 需要一并统计的多账号配置目录 */
  accounts: Account[];
}

export const UsageModal: React.FC<UsageModalProps> = ({ isOpen, onClose, accounts }) => {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collapsedClis, setCollapsedClis] = useState<ReadonlySet<UsageCli>>(() => new Set());
  const [hoveredCell, setHoveredCell] = useState<{ day: UsageDay; weekday: string } | null>(null);
  const [refreshSeq, setRefreshSeq] = useState(0);

  const toggleCli = (cliId: UsageCli) => {
    setCollapsedClis((prev) => {
      const next = new Set(prev);
      if (next.has(cliId)) next.delete(cliId); else next.add(cliId);
      return next;
    });
  };

  const refresh = useCallback(() => setRefreshSeq((n) => n + 1), []);

  useEffect(() => {
    if (!isOpen) {
      setHoveredCell(null);
      return;
    }
    let active = true;
    const load = window.electronAPI.getUsageStats;
    if (!load) { setError(t('当前版本不支持用量统计')); return; }
    setLoading(true);
    setError('');
    load(accounts.map(({ id, name, cliId, configDir }) => ({ id, name, cliId, configDir })))
      .then((result) => { if (active) setStats(result); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : t('读取用量失败')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen, refreshSeq]); // 账号列表在每次打开或点击刷新时读取

  const view = useMemo(() => {
    if (!stats) return null;
    const weekStartKey = dateOf(stats.weekStart);
    const weekDays = stats.days.filter((day) => day.date >= weekStartKey).slice(0, 7);
    const weeks: UsageDay[][] = [];
    for (let i = 0; i < stats.days.length; i += 7) weeks.push(stats.days.slice(i, i + 7));
    // 层级：CLI → 账号 → 模型。CLI 按合计 Tokens 降序，其下账号、模型同样降序，子会话（如 Codex 自动审查）排在账号内末尾
    const sumOf = (rows: UsageRow[]) => ({
      requests: rows.reduce((sum, row) => sum + row.requests, 0),
      input: rows.reduce((sum, row) => sum + row.input, 0),
      output: rows.reduce((sum, row) => sum + row.output, 0),
      cache: rows.reduce((sum, row) => sum + row.cacheRead + row.cacheWrite, 0),
      tokens: rows.reduce((sum, row) => sum + rowTokens(row), 0),
    });
    const byCli = new Map<UsageCli, UsageRow[]>();
    for (const row of stats.rows) byCli.set(row.cliId, [...(byCli.get(row.cliId) ?? []), row]);
    const groups = [...byCli.entries()].map(([cliId, rows]) => {
      const byAccount = new Map<string, UsageRow[]>();
      for (const row of rows) byAccount.set(row.accountId, [...(byAccount.get(row.accountId) ?? []), row]);
      const accountGroups = [...byAccount.entries()].map(([accountId, accountRows]) => ({
        accountId,
        name: accountRows[0].accountName,
        rows: [...accountRows].sort((a, b) => Number(Boolean(a.subagent)) - Number(Boolean(b.subagent)) || rowTokens(b) - rowTokens(a)),
        ...sumOf(accountRows),
      })).sort((a, b) => b.tokens - a.tokens);
      // 只有默认账号时不多显示一层；有多个账号，或唯一的账号不是默认账号时，才显示账号分段
      return {
        cliId,
        accountGroups,
        modelCount: rows.length,
        showAccounts: accountGroups.length > 1 || accountGroups[0].accountId !== 'default',
        ...sumOf(rows),
      };
    }).sort((a, b) => b.tokens - a.tokens);

    // 方块图悬停提示里的「CLI（账号）」标签，规则与表格一致
    const accountCount = new Map<UsageCli, number>();
    for (const account of stats.accounts) accountCount.set(account.cliId, (accountCount.get(account.cliId) ?? 0) + 1);
    const label = (key: string) => {
      const split = key.indexOf(':');
      const cli = key.slice(0, split) as UsageCli;
      const account = stats.accounts.find((item) => item.cliId === cli && item.accountId === key.slice(split + 1));
      const showAccount = account && ((accountCount.get(cli) ?? 0) > 1 || account.accountId !== 'default');
      return showAccount ? t('{cli}（{account}）', { cli: CLI_LABELS[cli] ?? cli, account: account.name }) : (CLI_LABELS[cli] ?? cli);
    };

    const totals = sumOf(stats.rows);
    const cacheShare = totals.tokens > 0 ? ((totals.cache / totals.tokens) * 100).toFixed(1) : '0.0';
    return {
      weeks,
      weekDays,
      groups,
      label,
      max: Math.max(0, ...stats.days.map((day) => day.requests)),
      totalHeatmapRequests: stats.days.reduce((sum, day) => sum + day.requests, 0),
      weekPeak: Math.max(0, ...weekDays.map((day) => day.requests)),
      requests: totals.requests,
      inputTokens: totals.input,
      outputTokens: totals.output,
      cacheTokens: totals.cache,
      cacheShare,
      tokens: totals.tokens,
      activeDays: weekDays.filter((day) => day.requests > 0).length,
      maxTokens: Math.max(0, ...stats.rows.map(rowTokens)),
    };
  }, [stats]);

  const allCollapsed = Boolean(view && view.groups.length > 0 && view.groups.every((g) => collapsedClis.has(g.cliId)));
  const toggleAllClis = () => {
    if (!view) return;
    setCollapsedClis(allCollapsed ? new Set() : new Set(view.groups.map((g) => g.cliId)));
  };

  const today = dateOf(Date.now());
  const th = 'border-b border-line-strong bg-panel/95 px-2.5 py-2 text-right font-medium backdrop-blur-sm';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="usage-title"
      title={t('本周用量')}
      icon={<BarChart3 size={16} className="text-accent" />}
      widthClass="max-w-[52rem]"
    >
      {loading && !stats && <p className="p-8 text-center text-sm text-fg-subtle">{t('正在统计…')}</p>}
      {error && <p role="alert" className="p-4 text-center text-sm text-danger">{error}</p>}
      {stats && view && (
        <div className="space-y-5">
          <section aria-label={t('本周概览')} className="space-y-2.5" data-usage-summary>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="flex flex-col justify-between rounded-xl border border-line bg-surface/80 px-3.5 py-3 transition-colors hover:border-line-strong">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-2xs font-medium text-fg-subtle">
                    {t('本周（{date} 起）请求数', { date: `${pad(new Date(stats.weekStart).getMonth() + 1)}-${pad(new Date(stats.weekStart).getDate())}` })}
                  </p>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
                    <Activity size={13} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums text-fg">
                  {view.requests.toLocaleString()}
                </p>
                <p className="mt-2 truncate text-2xs tabular-nums text-fg-faint">
                  {t('单日最高 {n} 次', { n: view.weekPeak.toLocaleString() })}
                </p>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-line bg-surface/80 px-3.5 py-3 transition-colors hover:border-line-strong">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-2xs font-medium text-fg-subtle">Tokens</p>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet/15 text-violet">
                    <Layers size={13} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums text-fg">
                  {formatTokens(view.tokens)}
                </p>
                <p className="mt-2 truncate text-2xs tabular-nums text-fg-faint">
                  {t('输入 {input} · 输出 {output}', { input: formatTokens(view.inputTokens), output: formatTokens(view.outputTokens) })}
                </p>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-line bg-surface/80 px-3.5 py-3 transition-colors hover:border-line-strong">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-2xs font-medium text-fg-subtle">{t('缓存占比')}</p>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-success/15 text-success">
                    <Database size={13} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums text-fg">
                  {view.cacheShare}%
                </p>
                <p className="mt-2 truncate text-2xs tabular-nums text-fg-faint">
                  {t('缓存 {tokens}', { tokens: formatTokens(view.cacheTokens) })}
                </p>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-line bg-surface/80 px-3.5 py-3 transition-colors hover:border-line-strong">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-2xs font-medium text-fg-subtle">{t('活跃天数')}</p>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning">
                    <CalendarDays size={13} aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums text-fg">
                  {view.activeDays} <span className="text-sm font-normal text-fg-faint">/ 7</span>
                </p>
                <div className="mt-2 grid grid-cols-7 gap-1" aria-hidden="true">
                  {view.weekDays.map((d) => {
                    const isFuture = d.date > today;
                    const isToday = d.date === today;
                    return (
                      <span
                        key={d.date}
                        className={`h-1.5 rounded-full ${isFuture ? 'bg-control/40' : d.requests > 0 ? 'bg-success' : 'bg-control'} ${isToday ? 'outline outline-1 outline-accent' : ''}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {view.tokens > 0 && view.groups.length > 0 && (
              <div className="rounded-xl border border-line bg-surface/55 px-3.5 py-2.5">
                <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-control/80" aria-label={t('Tokens 占比')}>
                  {view.groups.map((g) => {
                    const pct = (g.tokens / view.tokens) * 100;
                    if (pct <= 0) return null;
                    return (
                      <span
                        key={g.cliId}
                        style={{ width: `${Math.max(pct, 1.5)}%` }}
                        className={`h-full first:rounded-l-full last:rounded-r-full ${CLI_BAR_CLASSES[g.cliId]}`}
                      />
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs">
                  {view.groups.map((g) => {
                    const pct = ((g.tokens / view.tokens) * 100).toFixed(1);
                    return (
                      <span key={g.cliId} className="inline-flex items-center gap-1.5 text-fg-muted">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${CLI_DOT_CLASSES[g.cliId]}`} aria-hidden="true" />
                        <span className="font-medium text-fg">{CLI_LABELS[g.cliId]}</span>
                        <span className="tabular-nums text-fg-subtle">{pct}%</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section aria-label={t('各 CLI 的账号与模型用量')}>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h3 id="usage-table-heading" className="text-xs font-semibold tracking-wide text-fg-muted">
                {t('各 CLI 的账号与模型用量')}
              </h3>
              <div className="flex items-center gap-1.5">
                {view.groups.length > 1 && (
                  <button
                    type="button"
                    onClick={toggleAllClis}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-line bg-surface px-2 text-2xs font-medium text-fg-subtle transition-all hover:border-line-strong hover:bg-hover hover:text-fg active:scale-[0.97]"
                  >
                    <ChevronsUpDown size={12} aria-hidden="true" />
                    {allCollapsed ? t('全部展开') : t('全部收起')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={refresh}
                  disabled={loading}
                  title={t('刷新用量')}
                  aria-label={t('刷新用量')}
                  className="icon-btn h-6 w-6 border border-line bg-surface active:scale-[0.97]"
                >
                  <RotateCw size={12} className={loading ? 'animate-spin text-accent' : ''} aria-hidden="true" />
                </button>
              </div>
            </div>

            {stats.rows.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface/50 px-4 py-7 text-center text-sm text-fg-subtle" data-usage-empty>
                {t('本周还没有用量记录')}
              </p>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="usage-table-heading"
                className="overflow-x-auto rounded-xl border border-line bg-canvas/35 shadow-sm"
              >
                <table className="w-full min-w-[36rem] table-fixed border-separate border-spacing-0 text-xs">
                  <colgroup>
                    <col className="w-[34%]" />
                    <col className="w-[10%]" />
                    <col className="w-[8%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                    <col className="w-[15%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 text-fg-faint">
                    <tr>
                      <th className="border-b border-line-strong bg-panel/95 px-3 py-2 text-left font-medium backdrop-blur-sm">
                        {t('CLI / 账号 / 模型')}
                      </th>
                      <th className={th}>{t('请求')}</th>
                      <th className={th}>{t('会话')}</th>
                      <th className={th}>{t('输入')}</th>
                      <th className={th}>{t('输出')}</th>
                      <th className={th}>{t('缓存')}</th>
                      <th className="border-b border-line-strong bg-panel/95 px-3 py-2 text-right font-medium backdrop-blur-sm">
                        {t('合计')}
                      </th>
                    </tr>
                  </thead>
                  {view.groups.map((group, groupIdx) => {
                    const expanded = !collapsedClis.has(group.cliId);
                    const cliLabel = CLI_LABELS[group.cliId] ?? group.cliId;
                    const topBorder = groupIdx > 0 ? 'border-t border-line-strong' : '';
                    return (
                      <tbody key={group.cliId} data-usage-group={group.cliId}>
                        <tr
                          className="cursor-pointer bg-surface/90 transition-colors hover:bg-hover"
                          data-usage-cli
                          onClick={() => toggleCli(group.cliId)}
                        >
                          <td className={`${topBorder} px-3 py-2.5`}>
                            <span className="flex min-w-0 items-center gap-2 font-semibold text-fg">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleCli(group.cliId); }}
                                aria-expanded={expanded}
                                aria-label={expanded ? t('收起 {name}', { name: cliLabel }) : t('展开 {name}', { name: cliLabel })}
                                title={expanded ? t('收起 {name}', { name: cliLabel }) : t('展开 {name}', { name: cliLabel })}
                                className="icon-btn -ml-1 h-5 w-5 enabled:hover:bg-control active:scale-95"
                              >
                                <ChevronRight
                                  size={13}
                                  className={`transition-transform duration-150 ${expanded ? 'rotate-90 text-fg' : 'text-fg-subtle'}`}
                                  aria-hidden="true"
                                />
                              </button>
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-elevated shadow-sm">
                                <BrandIcon icon={group.cliId} size={14} />
                              </span>
                              <span className="min-w-0 truncate">{cliLabel}</span>
                              <span className="shrink-0 rounded-full border border-line bg-elevated/80 px-1.5 py-px text-2xs font-normal tabular-nums text-fg-subtle">
                                {t('{n} 个模型', { n: group.modelCount })}
                              </span>
                            </span>
                          </td>
                          <td className={`${topBorder} px-2.5 py-2.5 text-right font-semibold tabular-nums text-fg`}>
                            {group.requests.toLocaleString()}
                          </td>
                          <td className={`${topBorder} px-2.5 py-2.5 text-right tabular-nums text-fg-faint`}>--</td>
                          <td className={`${topBorder} px-2.5 py-2.5 text-right tabular-nums text-fg-subtle`}>{formatTokens(group.input)}</td>
                          <td className={`${topBorder} px-2.5 py-2.5 text-right tabular-nums text-fg-subtle`}>{formatTokens(group.output)}</td>
                          <td className={`${topBorder} px-2.5 py-2.5 text-right tabular-nums text-fg-subtle`}>{formatTokens(group.cache)}</td>
                          <td className={`${topBorder} px-3 py-2.5 text-right font-semibold tabular-nums text-fg`}>
                            {formatTokens(group.tokens)}
                          </td>
                        </tr>
                        {expanded && group.accountGroups.map((account) => (
                          <React.Fragment key={account.accountId}>
                            {group.showAccounts && (
                              <tr className="bg-muted/65" data-usage-account={account.accountId}>
                                <td className="border-t border-line py-1.5 pl-9 pr-3">
                                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-elevated/70 px-2 py-0.5 text-fg-muted">
                                    <User size={11} className="shrink-0 text-accent" aria-hidden="true" />
                                    <span className="min-w-0 truncate font-medium">{account.name}</span>
                                  </span>
                                </td>
                                <td className="border-t border-line px-2.5 py-1.5 text-right font-medium tabular-nums text-fg-muted">
                                  {account.requests.toLocaleString()}
                                </td>
                                <td className="border-t border-line px-2.5 py-1.5 text-right tabular-nums text-fg-faint">--</td>
                                <td className="border-t border-line px-2.5 py-1.5 text-right tabular-nums text-fg-subtle">{formatTokens(account.input)}</td>
                                <td className="border-t border-line px-2.5 py-1.5 text-right tabular-nums text-fg-subtle">{formatTokens(account.output)}</td>
                                <td className="border-t border-line px-2.5 py-1.5 text-right tabular-nums text-fg-subtle">{formatTokens(account.cache)}</td>
                                <td className="border-t border-line px-3 py-1.5 text-right font-medium tabular-nums text-fg-muted">
                                  {formatTokens(account.tokens)}
                                </td>
                              </tr>
                            )}
                            {account.rows.map((row) => {
                              const total = rowTokens(row);
                              const cacheTotal = row.cacheRead + row.cacheWrite;
                              return (
                                <tr key={`${row.accountId}-${row.model}`} className="transition-colors hover:bg-hover/50" data-usage-row>
                                  <td className={`border-t border-line/70 py-2 pr-3 ${group.showAccounts ? 'pl-14' : 'pl-10'}`}>
                                    <span className="flex min-w-0 items-center gap-2">
                                      <span
                                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${row.subagent ? 'bg-fg-faint' : CLI_DOT_CLASSES[group.cliId]}`}
                                        aria-hidden="true"
                                      />
                                      <span
                                        className={`min-w-0 truncate ${row.subagent ? 'text-fg-subtle' : 'font-medium text-fg'}`}
                                        title={row.model}
                                      >
                                        {row.model}
                                      </span>
                                      {row.subagent && (
                                        <span
                                          className="shrink-0 rounded-full border border-line-strong bg-surface px-1.5 py-px text-2xs text-fg-subtle"
                                          title={t('Codex 自动审查等由 CLI 自动发起的子会话')}
                                        >
                                          {t('子会话')}
                                        </span>
                                      )}
                                    </span>
                                  </td>
                                  <td className="border-t border-line/70 px-2.5 py-2 text-right tabular-nums text-fg">
                                    {row.requests.toLocaleString()}
                                  </td>
                                  <td className="border-t border-line/70 px-2.5 py-2 text-right tabular-nums text-fg-muted">
                                    {row.sessions}
                                  </td>
                                  <td className={`border-t border-line/70 px-2.5 py-2 text-right tabular-nums ${row.input > 0 ? 'text-fg-muted' : 'text-fg-faint'}`}>
                                    {formatTokens(row.input)}
                                  </td>
                                  <td className={`border-t border-line/70 px-2.5 py-2 text-right tabular-nums ${row.output > 0 ? 'text-fg-muted' : 'text-fg-faint'}`}>
                                    {formatTokens(row.output)}
                                  </td>
                                  <td
                                    className={`border-t border-line/70 px-2.5 py-2 text-right tabular-nums ${cacheTotal > 0 ? 'text-fg-muted' : 'text-fg-faint'}`}
                                    title={t('读 {read} / 写 {write}', { read: row.cacheRead.toLocaleString(), write: row.cacheWrite.toLocaleString() })}
                                  >
                                    {formatTokens(cacheTotal)}
                                  </td>
                                  <td className="border-t border-line/70 px-3 py-2 text-right">
                                    <span className="block font-medium tabular-nums text-fg">{formatTokens(total)}</span>
                                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-control/80" aria-hidden="true">
                                      <span
                                        className={`block h-full rounded-full ${row.subagent ? 'bg-fg-subtle/60' : CLI_BAR_CLASSES[group.cliId]}`}
                                        style={{ width: `${total > 0 && view.maxTokens > 0 ? Math.max(3, (total / view.maxTokens) * 100) : 0}%` }}
                                      />
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            )}
          </section>

          <div className="rounded-xl border border-line bg-surface/65 p-3.5">
            <section aria-label={t('每日使用频次')}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-fg-muted">
                  {t('每日使用频次（近 {n} 周，按请求数）', { n: view.weeks.length })}
                </h3>
                <span className="min-w-0 truncate text-2xs tabular-nums text-fg-subtle">
                  {hoveredCell
                    ? dayTitle(hoveredCell.day, hoveredCell.weekday, view.label)
                    : t('近 {n} 周共 {total} 次请求 · 单日最高 {max} 次', {
                        n: view.weeks.length,
                        total: view.totalHeatmapRequests.toLocaleString(),
                        max: view.max.toLocaleString(),
                      })}
                </span>
              </div>
              <div className="overflow-x-auto p-px pb-1" onMouseLeave={() => setHoveredCell(null)}>
                <div
                  className="grid w-full gap-1.5"
                  style={{
                    gridTemplateColumns: `auto repeat(${Math.max(1, view.weeks.length)}, minmax(0, 1fr))`,
                    gridTemplateRows: '1rem repeat(7, auto)',
                  }}
                  role="group"
                  aria-label={t('每日请求数方块图')}
                  data-usage-heatmap
                >
                  <div className="row-span-full grid grid-rows-subgrid items-center pr-0.5 text-2xs leading-none text-fg-faint" aria-hidden="true">
                    <span />
                    {weekdays().map((name, index) => <span key={name}>{index % 2 === 0 ? name : ''}</span>)}
                  </div>
                  {view.weeks.map((week, column) => {
                    const month = Number(week[0].date.slice(5, 7));
                    const nextMonth = column + 1 < view.weeks.length ? Number(view.weeks[column + 1][0].date.slice(5, 7)) : month;
                    const showMonth = column === 0 ? nextMonth === month : month !== Number(view.weeks[column - 1][0].date.slice(5, 7));
                    const isLast = column === view.weeks.length - 1;
                    return (
                      <div key={week[0].date} className="row-span-full grid grid-rows-subgrid">
                        <span className="relative text-2xs leading-4 text-fg-faint" aria-hidden="true">
                          {showMonth && (
                            <span className={`absolute top-0 whitespace-nowrap ${isLast ? 'right-0' : 'left-0'}`}>
                              {t(`${month}月`)}
                            </span>
                          )}
                        </span>
                        {week.map((day, row) => {
                          const future = day.date > today;
                          const level = dayLevel(day.requests, view.max);
                          const wkName = weekdays()[row];
                          return (
                            <span
                              key={day.date}
                              title={future ? undefined : dayTitle(day, wkName, view.label)}
                              onMouseEnter={future ? undefined : () => setHoveredCell({ day, weekday: wkName })}
                              data-usage-cell
                              data-date={day.date}
                              data-level={future ? 'future' : level}
                              className={`aspect-square w-full rounded-[4px] transition-all duration-100 ${future ? 'bg-control/35' : `${LEVEL_CLASSES[level]} hover:outline hover:outline-1 hover:outline-fg-muted`} ${day.date === today ? 'ring-1 ring-accent' : ''}`}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-end gap-1.5 text-2xs text-fg-faint" aria-hidden="true">
                <span>{t('少')}</span>
                {LEVEL_CLASSES.map((cls) => <span key={cls} className={`h-3.5 w-3.5 rounded-[3px] ${cls}`} />)}
                <span>{t('多')}</span>
              </div>
            </section>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-line/75 bg-surface/40 px-3 py-2.5 text-2xs leading-relaxed text-fg-faint">
            <Info size={13} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden="true" />
            <p>
              {t('统计本机 Claude Code、Codex、Antigravity、Pi 的会话记录，请求数为模型回复次数；Antigravity 记录不含模型字段，模型名按会话内的切换记录推断，且无法区分账号，统一归默认账号。暂不含 Kimi Code、OpenCode。')}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
};

function dateOf(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
