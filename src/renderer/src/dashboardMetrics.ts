import {
  DashboardDailyRecord,
  DashboardSessionMeta,
  DashboardStats,
  UsageCli,
} from './types';

export type DashboardRange = 'overview' | 'today' | '7d' | '30d' | 'all';
export type TrendMetric = 'tokens' | 'cost' | 'sessions';
export type TrendGrouping = 'stacked' | 'total';
export type BreakdownDimension = 'agent' | 'model' | 'project' | 'account';
export type ModelSortKey = 'tokens' | 'cost' | 'requests';

export interface DashboardFilter {
  range: DashboardRange;
  cliId: UsageCli | 'all';
  projectKey: string; // 'all' 或 normalized project key
  accountKey: string; // 'all' 或 `${cliId}:${accountId}`
  modelKey?: string;
}

export interface HeatmapCell {
  date: string;
  tokens: number;
  requests: number;
  sessions: number;
  status: 'missing' | 'empty' | 'active' | 'future';
  level: 0 | 1 | 2 | 3 | 4;
  inActiveRange: boolean;
}

export interface TrendBucket {
  key: string;
  label: string;
  tokens: number;
  cost: number;
  sessions: number;
  byCli: Partial<Record<UsageCli, { tokens: number; cost: number; sessions: number }>>;
}

export interface BreakdownItem {
  key: string;
  label: string;
  sublabel?: string;
  cliId?: UsageCli;
  tokens: number;
  costUsd: number;
  requests: number;
  sharePct: number;
  filterPatch?: Partial<Pick<DashboardFilter, 'cliId' | 'projectKey' | 'accountKey' | 'modelKey'>>;
}

export interface ModelDetailRow {
  cliId: UsageCli;
  accountId: string;
  accountName: string;
  model: string;
  subagent?: boolean;
  requests: number;
  sessions: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheHitPct: number | null;
  tokens: number;
  costUsd: number;
  costPriced: boolean;
}

export interface DashboardViewModel {
  startDate: string;
  endDate: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  requests: number;
  recordCount: number;
  activeSessions: number;
  activeAgents: number;
  activeProjects: number;
  estimatedCostUsd: number;
  pricedTokens: number;
  priceCoveragePct: number;
  cacheHitPct: number | null;
  cacheSampleCoveragePct: number;
  comparison: {
    comparable: boolean;
    prevTokens: number;
    deltaPct: number | null;
  };
  sparkline: number[];
  rangeActiveDays: number;
  rangeMissingDays: number;
  heatmap: {
    startDate: string;
    endDate: string;
    weeks: HeatmapCell[][];
    activeDays: number;
    missingDays: number;
    maxTokens: number;
    peakDay: { date: string; tokens: number; requests: number } | null;
  };
  trend: {
    monthly: boolean;
    buckets: TrendBucket[];
  };
  breakdowns: Record<BreakdownDimension, BreakdownItem[]>;
  composition: Array<{
    id: 'input' | 'cacheRead' | 'cacheWrite' | 'output';
    tokens: number;
    pct: number;
  }>;
  modelRows: ModelDetailRow[];
  maxModelTokens: number;
}

export const CLI_ORDER: UsageCli[] = ['codex', 'agy', 'claude', 'pi'];

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysStr(str: string, days: number): string {
  const d = parseLocalDate(str);
  d.setDate(d.getDate() + days);
  return dateKeyFromDate(d);
}

function diffDaysInclusive(startStr: string, endStr: string): number {
  const start = parseLocalDate(startStr).getTime();
  const end = parseLocalDate(endStr).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export function formatCompactTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} K`;
  return String(Math.round(n));
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return '0.0%';
  return `${n.toFixed(1)}%`;
}

export const recordTotalTokens = (r: Pick<DashboardDailyRecord, 'input' | 'output' | 'cacheRead' | 'cacheWrite'>) =>
  r.input + r.output + r.cacheRead + r.cacheWrite;

function resolveWindows(range: DashboardRange, todayStr: string, earliestDate: string | null): {
  startDate: string;
  endDate: string;
  prevStart: string | null;
  prevEnd: string | null;
} {
  if (range === 'today') {
    const yesterday = addDaysStr(todayStr, -1);
    return { startDate: todayStr, endDate: todayStr, prevStart: yesterday, prevEnd: yesterday };
  }
  if (range === '7d') {
    const startDate = addDaysStr(todayStr, -6);
    const prevEnd = addDaysStr(startDate, -1);
    return { startDate, endDate: todayStr, prevStart: addDaysStr(startDate, -7), prevEnd };
  }
  if (range === '30d') {
    const startDate = addDaysStr(todayStr, -29);
    const prevEnd = addDaysStr(startDate, -1);
    return { startDate, endDate: todayStr, prevStart: addDaysStr(startDate, -30), prevEnd };
  }
  if (range === 'all') {
    const startDate = earliestDate && earliestDate <= todayStr ? earliestDate : todayStr;
    return { startDate, endDate: todayStr, prevStart: null, prevEnd: null };
  }
  // overview: 滚动 365 天（与图 1 的年度口径一致）
  const startDate = addDaysStr(todayStr, -364);
  const prevEnd = addDaysStr(startDate, -1);
  return { startDate, endDate: todayStr, prevStart: addDaysStr(startDate, -365), prevEnd };
}

function monthRange(startStr: string, endStr: string): string[] {
  const [sy, sm] = startStr.split('-').map(Number);
  const [ey, em] = endStr.split('-').map(Number);
  const months: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}

export function computeDashboardView(
  stats: DashboardStats,
  filter: DashboardFilter,
  now = Date.now(),
  unknownProjectLabel = '未记录项目',
): DashboardViewModel {
  const todayStr = dateKeyFromDate(new Date(now));

  const sessionMap = new Map<number, DashboardSessionMeta>();
  for (const s of stats.sessions) sessionMap.set(s.id, s);

  const matchingSession = (s: DashboardSessionMeta | undefined): s is DashboardSessionMeta => {
    if (!s) return false;
    if (filter.cliId !== 'all' && s.cliId !== filter.cliId) return false;
    if (filter.projectKey !== 'all' && s.project !== filter.projectKey) return false;
    if (filter.accountKey !== 'all' && `${s.cliId}:${s.accountId}` !== filter.accountKey) return false;
    return true;
  };

  const modelKeyOf = (cliId: UsageCli, r: DashboardDailyRecord) => `${cliId}:${r.modelId ?? r.model}`;
  const matchingRecord = (cliId: UsageCli, r: DashboardDailyRecord) =>
    !filter.modelKey || filter.modelKey === modelKeyOf(cliId, r);
  let earliestDate: string | null = null;
  for (const r of stats.records) {
    const session = sessionMap.get(r.s);
    if (!matchingSession(session) || !matchingRecord(session.cliId, r) || r.date > todayStr) continue;
    if (!earliestDate || r.date < earliestDate) earliestDate = r.date;
  }
  const { startDate, endDate, prevStart, prevEnd } = resolveWindows(filter.range, todayStr, earliestDate);

  // 热力图始终展示最近 12 个月（365 天），并受 Agent / 项目 / 账号过滤
  const hmWindowStart = addDaysStr(todayStr, -364);
  const hmStartObj = parseLocalDate(hmWindowStart);
  const startMondayOffset = (hmStartObj.getDay() + 6) % 7;
  const hmGridStart = addDaysStr(hmWindowStart, -startMondayOffset);
  const todayObj = parseLocalDate(todayStr);
  const endSundayOffset = (7 - ((todayObj.getDay() + 6) % 7) - 1 + 7) % 7;
  const hmGridEnd = addDaysStr(todayStr, endSundayOffset);

  const hmDayAgg = new Map<string, { tokens: number; requests: number; sessions: Set<number> }>();
  const rangeDayTokens = new Map<string, number>();

  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let requests = 0;
  let recordCount = 0;
  let estimatedCostUsd = 0;
  let pricedTokens = 0;
  let validCacheInput = 0;
  let validCacheRead = 0;
  let validCacheSampleTokens = 0;
  let prevTokens = 0;

  const activeSessionIds = new Set<number>();
  const activeAgentSet = new Set<UsageCli>();
  const activeProjectSet = new Set<string>();

  const monthlyTrend = filter.range === 'overview' || filter.range === 'all';
  const trendKeys = monthlyTrend
    ? monthRange(startDate, endDate)
    : Array.from({ length: diffDaysInclusive(startDate, endDate) }, (_, i) => addDaysStr(startDate, i));

  interface MutableTrendBucket {
    key: string;
    label: string;
    tokens: number;
    cost: number;
    sessions: Set<number>;
    byCli: Partial<Record<UsageCli, { tokens: number; cost: number; sessions: Set<number> }>>;
  }
  const trendMap = new Map<string, MutableTrendBucket>();
  for (const key of trendKeys) {
    const label = monthlyTrend ? `${key.slice(2, 4)}/${key.slice(5, 7)}` : `${key.slice(5, 7)}/${key.slice(8, 10)}`;
    trendMap.set(key, { key, label, tokens: 0, cost: 0, sessions: new Set(), byCli: {} });
  }

  const aggAgent = new Map<string, { cliId: UsageCli; tokens: number; costUsd: number; requests: number }>();
  const aggModel = new Map<string, { label: string; cliId: UsageCli; tokens: number; costUsd: number; requests: number }>();
  const aggProject = new Map<string, { key: string; label: string; path?: string; tokens: number; costUsd: number; requests: number }>();
  const aggAccount = new Map<string, { key: string; cliId: UsageCli; accountId: string; accountName: string; tokens: number; costUsd: number; requests: number }>();

  const modelDetailMap = new Map<string, {
    cliId: UsageCli;
    accountId: string;
    accountName: string;
    model: string;
    subagent?: boolean;
    requests: number;
    sessions: Set<number>;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    tokens: number;
    costUsd: number;
    costPriced: boolean;
  }>();

  for (const r of stats.records) {
    const sess = sessionMap.get(r.s);
    if (!matchingSession(sess) || !matchingRecord(sess.cliId, r)) continue;
    const tok = recordTotalTokens(r);

    // 12 个月热力图归集
    if (r.date >= hmWindowStart && r.date <= todayStr) {
      let day = hmDayAgg.get(r.date);
      if (!day) {
        day = { tokens: 0, requests: 0, sessions: new Set() };
        hmDayAgg.set(r.date, day);
      }
      day.tokens += tok;
      day.requests += r.requests;
      day.sessions.add(r.s);
    }

    // 上一周期累计 Token（用于环比）
    if (prevStart && prevEnd && r.date >= prevStart && r.date <= prevEnd) {
      prevTokens += tok;
    }

    if (r.date < startDate || r.date > endDate) continue;

    recordCount += r.requests;
    requests += r.requests;
    totalTokens += tok;
    inputTokens += r.input;
    outputTokens += r.output;
    cacheReadTokens += r.cacheRead;
    cacheWriteTokens += r.cacheWrite;
    rangeDayTokens.set(r.date, (rangeDayTokens.get(r.date) ?? 0) + tok);

    if (r.costPriced) {
      estimatedCostUsd += r.costUsd;
      pricedTokens += r.pricedTokens ?? tok;
    }

    const rowInputTotal = r.input + r.cacheRead + r.cacheWrite;
    if (rowInputTotal > 0) {
      validCacheInput += rowInputTotal;
      validCacheRead += r.cacheRead;
      validCacheSampleTokens += tok;
    }

    activeSessionIds.add(r.s);
    activeAgentSet.add(sess.cliId);
    if (sess.project) activeProjectSet.add(sess.project);

    // 趋势桶
    const bucketKey = monthlyTrend ? r.date.slice(0, 7) : r.date;
    const tb = trendMap.get(bucketKey);
    if (tb) {
      tb.tokens += tok;
      if (r.costPriced) tb.cost += r.costUsd;
      tb.sessions.add(r.s);
      let cliEntry = tb.byCli[sess.cliId];
      if (!cliEntry) {
        cliEntry = { tokens: 0, cost: 0, sessions: new Set() };
        tb.byCli[sess.cliId] = cliEntry;
      }
      cliEntry.tokens += tok;
      if (r.costPriced) cliEntry.cost += r.costUsd;
      cliEntry.sessions.add(r.s);
    }

    // Top 5 维度
    {
      const cur = aggAgent.get(sess.cliId) ?? { cliId: sess.cliId, tokens: 0, costUsd: 0, requests: 0 };
      cur.tokens += tok;
      cur.requests += r.requests;
      if (r.costPriced) cur.costUsd += r.costUsd;
      aggAgent.set(sess.cliId, cur);
    }
    {
      const mk = modelKeyOf(sess.cliId, r);
      const cur = aggModel.get(mk) ?? { label: r.model, cliId: sess.cliId, tokens: 0, costUsd: 0, requests: 0 };
      cur.tokens += tok;
      cur.requests += r.requests;
      if (r.costPriced) cur.costUsd += r.costUsd;
      aggModel.set(mk, cur);
    }
    {
      const pk = sess.project || '__unknown__';
      const cur = aggProject.get(pk) ?? {
        key: pk,
        label: sess.projectName || unknownProjectLabel,
        path: sess.projectPath || undefined,
        tokens: 0,
        costUsd: 0,
        requests: 0,
      };
      cur.tokens += tok;
      cur.requests += r.requests;
      if (r.costPriced) cur.costUsd += r.costUsd;
      aggProject.set(pk, cur);
    }
    {
      const ak = `${sess.cliId}:${sess.accountId}`;
      const cur = aggAccount.get(ak) ?? {
        key: ak,
        cliId: sess.cliId,
        accountId: sess.accountId,
        accountName: sess.accountName,
        tokens: 0,
        costUsd: 0,
        requests: 0,
      };
      cur.tokens += tok;
      cur.requests += r.requests;
      if (r.costPriced) cur.costUsd += r.costUsd;
      aggAccount.set(ak, cur);
    }

    // 模型明细行
    const mdKey = `${sess.cliId}:${sess.accountId}\t${r.model}`;
    let md = modelDetailMap.get(mdKey);
    if (!md) {
      md = {
        cliId: sess.cliId,
        accountId: sess.accountId,
        accountName: sess.accountName,
        model: r.model,
        ...(r.subagent ? { subagent: true } : {}),
        requests: 0,
        sessions: new Set(),
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        tokens: 0,
        costUsd: 0,
        costPriced: false,
      };
      modelDetailMap.set(mdKey, md);
    }
    md.requests += r.requests;
    md.sessions.add(r.s);
    md.input += r.input;
    md.output += r.output;
    md.cacheRead += r.cacheRead;
    md.cacheWrite += r.cacheWrite;
    md.tokens += tok;
    if (r.costPriced) {
      md.costUsd += r.costUsd;
      md.costPriced = true;
    }
  }

  // 构建热力图方格矩阵（按周列 × 周一至周日 7 行）
  let hmMaxTokens = 0;
  let peakDay: { date: string; tokens: number; requests: number } | null = null;
  let hmActiveDays = 0;
  let hmMissingDays = 0;

  for (let d = hmWindowStart; d <= todayStr; d = addDaysStr(d, 1)) {
    const info = hmDayAgg.get(d);
    if (info && info.tokens > 0) {
      hmActiveDays += 1;
      if (info.tokens > hmMaxTokens) {
        hmMaxTokens = info.tokens;
        peakDay = { date: d, tokens: info.tokens, requests: info.requests };
      }
    } else if (!earliestDate || d < earliestDate) {
      hmMissingDays += 1;
    }
  }

  const weeks: HeatmapCell[][] = [];
  let curDate = hmGridStart;
  while (curDate <= hmGridEnd) {
    const col: HeatmapCell[] = [];
    for (let row = 0; row < 7; row++) {
      const info = hmDayAgg.get(curDate);
      const tokens = info?.tokens ?? 0;
      const dayRequests = info?.requests ?? 0;
      const daySessions = info?.sessions.size ?? 0;
      let status: HeatmapCell['status'];
      let level: HeatmapCell['level'] = 0;
      if (curDate > todayStr) {
        status = 'future';
      } else if (curDate < hmWindowStart || !earliestDate || curDate < earliestDate) {
        status = tokens > 0 ? 'active' : 'missing';
      } else if (tokens > 0) {
        status = 'active';
      } else {
        status = 'empty';
      }
      if (status === 'active' && hmMaxTokens > 0) {
        level = Math.max(1, Math.min(4, Math.ceil((tokens / hmMaxTokens) * 4))) as 1 | 2 | 3 | 4;
      }
      col.push({
        date: curDate,
        tokens,
        requests: dayRequests,
        sessions: daySessions,
        status,
        level,
        inActiveRange: curDate >= startDate && curDate <= endDate,
      });
      curDate = addDaysStr(curDate, 1);
    }
    weeks.push(col);
    if (weeks.length > 60) break;
  }

  // 当前所选区间内的活跃天数与缺失天数（用于顶部状态条）
  let rangeActiveDays = 0;
  let rangeMissingDays = 0;
  for (let d = startDate; d <= endDate; d = addDaysStr(d, 1)) {
    if ((rangeDayTokens.get(d) ?? 0) > 0) rangeActiveDays += 1;
    else if (!earliestDate || d < earliestDate) rangeMissingDays += 1;
  }

  // 同比 / 环比：仅当数据最早日期覆盖到上一周期起始日且上期 Token > 0 时才可比
  const comparable = Boolean(prevStart && prevEnd && earliestDate && earliestDate <= prevStart && prevTokens > 0);
  const deltaPct = comparable ? ((totalTokens - prevTokens) / prevTokens) * 100 : null;

  // KPI 卡片 1 的迷你趋势柱（最多 16 柱）
  const sparkBucketsCount = 16;
  const totalSpanDays = diffDaysInclusive(startDate, endDate);
  const sparkRaw = new Array<number>(sparkBucketsCount).fill(0);
  for (const [d, tok] of rangeDayTokens) {
    const offset = diffDaysInclusive(startDate, d) - 1;
    const idx = Math.min(sparkBucketsCount - 1, Math.floor((offset / totalSpanDays) * sparkBucketsCount));
    sparkRaw[idx] += tok;
  }
  const maxSpark = Math.max(0, ...sparkRaw);
  const sparkline = sparkRaw.map((v) => (maxSpark > 0 ? v / maxSpark : 0));

  const trendBuckets: TrendBucket[] = [...trendMap.values()].map((b) => {
    const byCli: TrendBucket['byCli'] = {};
    for (const cliId of CLI_ORDER) {
      const c = b.byCli[cliId];
      if (c) byCli[cliId] = { tokens: c.tokens, cost: c.cost, sessions: c.sessions.size };
    }
    return {
      key: b.key,
      label: b.label,
      tokens: b.tokens,
      cost: b.cost,
      sessions: b.sessions.size,
      byCli,
    };
  });

  const shareOf = (t: number) => (totalTokens > 0 ? (t / totalTokens) * 100 : 0);

  const breakdowns: Record<BreakdownDimension, BreakdownItem[]> = {
    agent: [...aggAgent.values()]
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5)
      .map((a) => ({
        key: a.cliId,
        label: a.cliId,
        cliId: a.cliId,
        tokens: a.tokens,
        costUsd: a.costUsd,
        requests: a.requests,
        sharePct: shareOf(a.tokens),
        filterPatch: { cliId: a.cliId },
      })),
    model: [...aggModel.entries()]
      .sort(([, a], [, b]) => b.tokens - a.tokens)
      .slice(0, 5)
      .map(([key, m]) => ({
        key,
        label: m.label,
        cliId: m.cliId,
        tokens: m.tokens,
        costUsd: m.costUsd,
        requests: m.requests,
        sharePct: shareOf(m.tokens),
        filterPatch: { modelKey: key },
      })),
    project: [...aggProject.values()]
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5)
      .map((p) => ({
        key: p.key,
        label: p.label,
        sublabel: p.path,
        tokens: p.tokens,
        costUsd: p.costUsd,
        requests: p.requests,
        sharePct: shareOf(p.tokens),
        ...(p.key !== '__unknown__' ? { filterPatch: { projectKey: p.key } } : {}),
      })),
    account: [...aggAccount.values()]
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5)
      .map((a) => ({
        key: a.key,
        label: a.accountName,
        sublabel: a.cliId,
        cliId: a.cliId,
        tokens: a.tokens,
        costUsd: a.costUsd,
        requests: a.requests,
        sharePct: shareOf(a.tokens),
        filterPatch: { accountKey: a.key },
      })),
  };

  const composition: DashboardViewModel['composition'] = [
    { id: 'input', tokens: inputTokens, pct: shareOf(inputTokens) },
    { id: 'cacheRead', tokens: cacheReadTokens, pct: shareOf(cacheReadTokens) },
    { id: 'cacheWrite', tokens: cacheWriteTokens, pct: shareOf(cacheWriteTokens) },
    { id: 'output', tokens: outputTokens, pct: shareOf(outputTokens) },
  ];

  const modelRows: ModelDetailRow[] = [...modelDetailMap.values()]
    .map((m) => {
      const mInputTotal = m.input + m.cacheRead + m.cacheWrite;
      return {
        cliId: m.cliId,
        accountId: m.accountId,
        accountName: m.accountName,
        model: m.model,
        subagent: m.subagent,
        requests: m.requests,
        sessions: m.sessions.size,
        input: m.input,
        output: m.output,
        cacheRead: m.cacheRead,
        cacheWrite: m.cacheWrite,
        cacheHitPct: mInputTotal > 0 ? (m.cacheRead / mInputTotal) * 100 : null,
        tokens: m.tokens,
        costUsd: m.costUsd,
        costPriced: m.costPriced,
      };
    })
    .sort((a, b) => b.tokens - a.tokens || b.requests - a.requests);

  return {
    startDate,
    endDate,
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    requests,
    recordCount,
    activeSessions: activeSessionIds.size,
    activeAgents: activeAgentSet.size,
    activeProjects: activeProjectSet.size,
    estimatedCostUsd,
    pricedTokens,
    priceCoveragePct: totalTokens > 0 ? (pricedTokens / totalTokens) * 100 : 0,
    cacheHitPct: validCacheInput > 0 ? (validCacheRead / validCacheInput) * 100 : null,
    cacheSampleCoveragePct: totalTokens > 0 ? (validCacheSampleTokens / totalTokens) * 100 : 0,
    comparison: {
      comparable,
      prevTokens,
      deltaPct,
    },
    sparkline,
    rangeActiveDays,
    rangeMissingDays,
    heatmap: {
      startDate: hmWindowStart,
      endDate: todayStr,
      weeks,
      activeDays: hmActiveDays,
      missingDays: hmMissingDays,
      maxTokens: hmMaxTokens,
      peakDay,
    },
    trend: {
      monthly: monthlyTrend,
      buckets: trendBuckets,
    },
    breakdowns,
    composition,
    modelRows,
    maxModelTokens: Math.max(0, ...modelRows.map((m) => m.tokens)),
  };
}
