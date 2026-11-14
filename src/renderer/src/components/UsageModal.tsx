import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, User } from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import { Modal } from './Modal';
import { Account, UsageCli, UsageDay, UsageRow, UsageStats } from '../types';
import { t } from '../i18n';

const CLI_LABELS: Record<UsageCli, string> = { claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity', pi: 'Pi' };
const weekdays = () => [t('一'), t('二'), t('三'), t('四'), t('五'), t('六'), t('日')];

/** 方块颜色：0 次为底色，其余按当天请求数占范围内最大值的比例分 4 档（沿用主题的 success 色，随主题变化） */
const LEVEL_CLASSES = ['bg-control', 'bg-success/25', 'bg-success/50', 'bg-success/75', 'bg-success'];

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

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]); // 账号列表只在每次打开时读取一次

  const view = useMemo(() => {
    if (!stats) return null;
    const weekDays = stats.days.filter((day) => day.date >= dateOf(stats.weekStart));
    const weeks: UsageDay[][] = [];
    for (let i = 0; i < stats.days.length; i += 7) weeks.push(stats.days.slice(i, i + 7));
    // 层级：CLI → 账号 → 模型。CLI 按合计 Tokens 降序，其下账号、模型同样降序，子会话（如 Codex 自动审查）排在账号内末尾
    const sumOf = (rows: UsageRow[]) => ({
      requests: rows.reduce((sum, row) => sum + row.requests, 0),
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
      return { cliId, accountGroups, showAccounts: accountGroups.length > 1 || accountGroups[0].accountId !== 'default', ...sumOf(rows) };
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
    return {
      weeks,
      groups,
      label,
      max: Math.max(0, ...stats.days.map((day) => day.requests)),
      requests: stats.rows.reduce((sum, row) => sum + row.requests, 0),
      tokens: stats.rows.reduce((sum, row) => sum + rowTokens(row), 0),
      activeDays: weekDays.filter((day) => day.requests > 0).length,
      maxTokens: Math.max(0, ...stats.rows.map(rowTokens)),
    };
  }, [stats]);

  const today = dateOf(Date.now());
  const th = 'px-2 py-1.5 text-right font-medium';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="usage-title"
      title={t('本周用量')}
      icon={<BarChart3 size={16} className="text-accent" />}
      widthClass="max-w-3xl"
    >
      {loading && !stats && <p className="p-8 text-center text-sm text-fg-subtle">{t('正在统计…')}</p>}
      {error && <p role="alert" className="p-4 text-center text-sm text-danger">{error}</p>}
      {stats && view && (
        <div className="space-y-6">
          <section aria-label={t('本周概览')} className="flex flex-wrap items-end gap-x-8 gap-y-2" data-usage-summary>
            <div>
              <p className="text-2xs text-fg-faint">{t('本周（{date} 起）请求数', { date: `${pad(new Date(stats.weekStart).getMonth() + 1)}-${pad(new Date(stats.weekStart).getDate())}` })}</p>
              <p className="text-xl font-semibold tabular-nums text-fg">{view.requests.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-2xs text-fg-faint">Tokens</p>
              <p className="text-xl font-semibold tabular-nums text-fg">{formatTokens(view.tokens)}</p>
            </div>
            <div>
              <p className="text-2xs text-fg-faint">{t('活跃天数')}</p>
              <p className="text-xl font-semibold tabular-nums text-fg">{view.activeDays} / 7</p>
            </div>
          </section>

          <section aria-label={t('各 CLI 的账号与模型用量')}>
            <h3 className="mb-2 text-xs font-medium text-fg-muted">{t('各 CLI 的账号与模型用量')}</h3>
            {stats.rows.length === 0 ? (
              <p className="rounded-lg border border-line px-4 py-6 text-center text-sm text-fg-subtle" data-usage-empty>{t('本周还没有用量记录')}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[34rem] text-xs">
                  <thead className="bg-surface text-fg-faint">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">{t('CLI / 账号 / 模型')}</th>
                      <th className={th}>{t('请求')}</th>
                      <th className={th}>{t('会话')}</th>
                      <th className={th}>{t('输入')}</th>
                      <th className={th}>{t('输出')}</th>
                      <th className={th}>{t('缓存')}</th>
                      <th className={th}>{t('合计')}</th>
                    </tr>
                  </thead>
                  {view.groups.map((group) => (
                    <tbody key={group.cliId} data-usage-group={group.cliId}>
                      <tr className="border-t border-line-strong bg-surface" data-usage-cli>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2 font-medium text-fg">
                            <BrandIcon icon={group.cliId} size={14} />
                            {CLI_LABELS[group.cliId]}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums text-fg">{group.requests.toLocaleString()}</td>
                        <td colSpan={4} />
                        <td className="px-2 py-2 text-right font-medium tabular-nums text-fg">{formatTokens(group.tokens)}</td>
                      </tr>
                      {group.accountGroups.map((account) => (
                        <React.Fragment key={account.accountId}>
                          {group.showAccounts && (
                            <tr className="border-t border-line bg-muted" data-usage-account={account.accountId}>
                              <td className="py-1.5 pl-9 pr-3">
                                <span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
                                  <User size={12} className="shrink-0" aria-hidden="true" />
                                  <span className="truncate">{account.name}</span>
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-fg-muted">{account.requests.toLocaleString()}</td>
                              <td colSpan={4} />
                              <td className="px-2 py-1.5 text-right tabular-nums text-fg-muted">{formatTokens(account.tokens)}</td>
                            </tr>
                          )}
                          {account.rows.map((row) => (
                            <tr key={`${row.accountId}-${row.model}`} className="border-t border-line" data-usage-row>
                              <td className={`py-2 pr-3 ${group.showAccounts ? 'pl-14' : 'pl-9'}`}>
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className={`truncate ${row.subagent ? 'text-fg-subtle' : 'text-fg'}`}>{row.model}</span>
                                  {row.subagent && <span className="shrink-0 rounded-full border border-line-strong px-1.5 text-2xs text-fg-faint" title={t('Codex 自动审查等由 CLI 自动发起的子会话')}>{t('子会话')}</span>}
                                </span>
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums text-fg">{row.requests.toLocaleString()}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-fg-muted">{row.sessions}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-fg-muted">{formatTokens(row.input)}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-fg-muted">{formatTokens(row.output)}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-fg-muted" title={t('读 {read} / 写 {write}', { read: row.cacheRead.toLocaleString(), write: row.cacheWrite.toLocaleString() })}>{formatTokens(row.cacheRead + row.cacheWrite)}</td>
                              <td className="px-2 py-2 text-right">
                                <span className="block tabular-nums text-fg">{formatTokens(rowTokens(row))}</span>
                                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-control" aria-hidden="true">
                                  <span className="block h-full rounded-full bg-success" style={{ width: `${view.maxTokens ? (rowTokens(row) / view.maxTokens) * 100 : 0}%` }} />
                                </span>
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </section>

          <section aria-label={t('每日使用频次')}>
            <h3 className="mb-2 text-xs font-medium text-fg-muted">{t('每日使用频次（近 {n} 周，按请求数）', { n: view.weeks.length })}</h3>
            <div className="overflow-x-auto pb-1">
              <div className="inline-flex gap-2" role="group" aria-label={t('每日请求数方块图')} data-usage-heatmap>
                <div className="flex flex-col gap-1 pt-[19px] text-2xs leading-[14px] text-fg-faint" aria-hidden="true">
                  {weekdays().map((name, index) => <span key={name} className="h-3.5">{index % 2 === 0 ? name : ''}</span>)}
                </div>
                <div className="flex gap-1">
                  {view.weeks.map((week, column) => {
                    const month = Number(week[0].date.slice(5, 7));
                    const showMonth = column === 0 || month !== Number(view.weeks[column - 1][0].date.slice(5, 7));
                    return (
                      <div key={week[0].date} className="flex flex-col gap-1">
                        <span className="h-[15px] whitespace-nowrap text-2xs leading-[15px] text-fg-faint" aria-hidden="true">{showMonth ? t(`${month}月`) : ''}</span>
                        {week.map((day, row) => {
                          const future = day.date > today;
                          const level = dayLevel(day.requests, view.max);
                          return (
                            <span
                              key={day.date}
                              title={future ? undefined : dayTitle(day, weekdays()[row], view.label)}
                              data-usage-cell
                              data-date={day.date}
                              data-level={future ? 'future' : level}
                              className={`h-3.5 w-3.5 rounded-[3px] ${future ? 'bg-control/40' : LEVEL_CLASSES[level]} ${day.date === today ? 'ring-1 ring-fg-subtle' : ''}`}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end gap-1.5 text-2xs text-fg-faint" aria-hidden="true">
              <span>{t('少')}</span>
              {LEVEL_CLASSES.map((cls) => <span key={cls} className={`h-3.5 w-3.5 rounded-[3px] ${cls}`} />)}
              <span>{t('多')}</span>
            </div>
          </section>

          <p className="text-2xs leading-relaxed text-fg-faint">
            {t('统计本机 Claude Code、Codex、Antigravity、Pi 的会话记录，请求数为模型回复次数；Antigravity 记录不含模型字段，模型名按会话内的切换记录推断，且无法区分账号，统一归默认账号。暂不含 Kimi Code、OpenCode。')}
          </p>
        </div>
      )}
    </Modal>
  );
};

function dateOf(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
