import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import { Modal } from './Modal';
import { Account, UsageCli, UsageDay, UsageRow, UsageStats } from '../types';

const CLI_LABELS: Record<UsageCli, string> = { claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity' };
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

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

function dayTitle(day: UsageDay, weekday: string): string {
  if (day.requests === 0) return `${day.date}（周${weekday}）：无请求`;
  const parts = (Object.keys(CLI_LABELS) as UsageCli[])
    .filter((cli) => day.byCli[cli])
    .map((cli) => `${CLI_LABELS[cli]} ${day.byCli[cli]}`);
  return `${day.date}（周${weekday}）：${day.requests} 次请求（${parts.join('，')}）`;
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
    if (!load) { setError('当前版本不支持用量统计'); return; }
    setLoading(true);
    setError('');
    load(accounts.map(({ cliId, configDir }) => ({ cliId, configDir })))
      .then((result) => { if (active) setStats(result); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : '读取用量失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen]); // 账号列表只在每次打开时读取一次

  const view = useMemo(() => {
    if (!stats) return null;
    const weekDays = stats.days.filter((day) => day.date >= dateOf(stats.weekStart));
    const weeks: UsageDay[][] = [];
    for (let i = 0; i < stats.days.length; i += 7) weeks.push(stats.days.slice(i, i + 7));
    return {
      weeks,
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
      title="本周用量"
      icon={<BarChart3 size={16} className="text-accent" />}
      widthClass="max-w-2xl"
    >
      {loading && !stats && <p className="p-8 text-center text-sm text-fg-subtle">正在统计…</p>}
      {error && <p role="alert" className="p-4 text-center text-sm text-danger">{error}</p>}
      {stats && view && (
        <div className="space-y-6">
          <section aria-label="本周概览" className="flex flex-wrap items-end gap-x-8 gap-y-2" data-usage-summary>
            <div>
              <p className="text-2xs text-fg-faint">{`本周（${pad(new Date(stats.weekStart).getMonth() + 1)}-${pad(new Date(stats.weekStart).getDate())} 起）请求数`}</p>
              <p className="text-xl font-semibold tabular-nums text-fg">{view.requests.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-2xs text-fg-faint">Tokens</p>
              <p className="text-xl font-semibold tabular-nums text-fg">{formatTokens(view.tokens)}</p>
            </div>
            <div>
              <p className="text-2xs text-fg-faint">活跃天数</p>
              <p className="text-xl font-semibold tabular-nums text-fg">{view.activeDays} / 7</p>
            </div>
          </section>

          <section aria-label="各模型用量">
            <h3 className="mb-2 text-xs font-medium text-fg-muted">各模型用量</h3>
            {stats.rows.length === 0 ? (
              <p className="rounded-lg border border-line px-4 py-6 text-center text-sm text-fg-subtle" data-usage-empty>本周还没有用量记录</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[34rem] text-xs">
                  <thead className="bg-surface text-fg-faint">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">模型</th>
                      <th className={th}>请求</th>
                      <th className={th}>会话</th>
                      <th className={th}>输入</th>
                      <th className={th}>输出</th>
                      <th className={th}>缓存</th>
                      <th className={th}>合计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.rows.map((row) => (
                      <tr key={`${row.cliId}-${row.model}`} className="border-t border-line" data-usage-row>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <BrandIcon icon={row.cliId} size={14} />
                            <span className="min-w-0">
                              <span className="block truncate text-fg">{row.model}</span>
                              <span className="block text-2xs text-fg-faint">{CLI_LABELS[row.cliId]}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-fg">{row.requests.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-fg-muted">{row.sessions}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-fg-muted">{formatTokens(row.input)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-fg-muted">{formatTokens(row.output)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-fg-muted" title={`读 ${row.cacheRead.toLocaleString()} / 写 ${row.cacheWrite.toLocaleString()}`}>{formatTokens(row.cacheRead + row.cacheWrite)}</td>
                        <td className="px-2 py-2 text-right">
                          <span className="block tabular-nums text-fg">{formatTokens(rowTokens(row))}</span>
                          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-control" aria-hidden="true">
                            <span className="block h-full rounded-full bg-success" style={{ width: `${view.maxTokens ? (rowTokens(row) / view.maxTokens) * 100 : 0}%` }} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="每日使用频次">
            <h3 className="mb-2 text-xs font-medium text-fg-muted">每日使用频次（近 {view.weeks.length} 周，按请求数）</h3>
            <div className="overflow-x-auto pb-1">
              <div className="inline-flex gap-2" role="group" aria-label="每日请求数方块图" data-usage-heatmap>
                <div className="flex flex-col gap-[3px] pt-[18px] text-2xs leading-3 text-fg-faint" aria-hidden="true">
                  {WEEKDAYS.map((name, index) => <span key={name} className="h-3">{index % 2 === 0 ? name : ''}</span>)}
                </div>
                <div className="flex gap-[3px]">
                  {view.weeks.map((week, column) => {
                    const month = Number(week[0].date.slice(5, 7));
                    const showMonth = column === 0 || month !== Number(view.weeks[column - 1][0].date.slice(5, 7));
                    return (
                      <div key={week[0].date} className="flex flex-col gap-[3px]">
                        <span className="h-[15px] whitespace-nowrap text-2xs leading-[15px] text-fg-faint" aria-hidden="true">{showMonth ? `${month}月` : ''}</span>
                        {week.map((day, row) => {
                          const future = day.date > today;
                          const level = dayLevel(day.requests, view.max);
                          return (
                            <span
                              key={day.date}
                              title={future ? undefined : dayTitle(day, WEEKDAYS[row])}
                              data-usage-cell
                              data-date={day.date}
                              data-level={future ? 'future' : level}
                              className={`h-3 w-3 rounded-[2px] ${future ? 'bg-control/40' : LEVEL_CLASSES[level]} ${day.date === today ? 'ring-1 ring-fg-subtle' : ''}`}
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
              <span>少</span>
              {LEVEL_CLASSES.map((cls) => <span key={cls} className={`h-3 w-3 rounded-[2px] ${cls}`} />)}
              <span>多</span>
            </div>
          </section>

          <p className="text-2xs leading-relaxed text-fg-faint">
            统计本机 Claude Code、Codex、Antigravity 的会话记录，请求数为模型回复次数；Antigravity 记录不含模型字段，模型名按会话内的切换记录推断。暂不含 Kimi Code、Pi、OpenCode。
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
