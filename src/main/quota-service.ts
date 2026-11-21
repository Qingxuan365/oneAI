import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { isAccountCli, resolveConfigDir, AccountCliId } from './account-env';
import { isSamePath, normalizePathKey, setBoundedMap } from './fs-utils';
import type { QuotaData, QuotaGroupSnapshot } from '../shared/types';
import { t } from './i18n';
import { formatClaudeModel } from './model-format';

export type { QuotaData };

async function exists(file: string): Promise<boolean> {
  try { await fs.promises.access(file); return true; } catch { return false; }
}

function stripTomlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && inDouble) { i++; continue; }
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

/**
 * 轻量解析 TOML 字符串键值：剥离引号外的 # 注释，并按 [section] 分组（顶层键归入 ""）。
 * 节名去掉首尾空白与段引号（如 [models."k3"] 归一为 "models.k3"），避免注释行、同后缀键名或子表配置误匹配。
 */
export function parseTomlStrings(content: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>([['', new Map()]]);
  let current = '';
  for (const rawLine of content.split(/\r?\n/)) {
    const cleaned = stripTomlComment(rawLine).trim();
    if (!cleaned) continue;
    const secMatch = cleaned.match(/^\[(?:\[)?([^\[\]]+?)(?:\])?\]$/);
    if (secMatch) {
      current = secMatch[1]
        .split('.')
        .map((seg) => seg.trim().replace(/^(["'])(.*)\1$/, '$2'))
        .join('.');
      if (!sections.has(current)) sections.set(current, new Map());
      continue;
    }
    const kvMatch = cleaned.match(/^([A-Za-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*$/);
    if (!kvMatch) continue;
    const [, key, dq, sq] = kvMatch;
    let val = sq ?? '';
    if (dq !== undefined) {
      try { val = JSON.parse(`"${dq}"`); } catch { val = dq; }
    }
    sections.get(current)!.set(key, val);
  }
  return sections;
}

const CODEX_HOME_DEFAULT = path.join(os.homedir(), '.codex');
const CLAUDE_HOME_DEFAULT = path.join(os.homedir(), '.claude');
const KIMI_HOME_DEFAULT = path.join(os.homedir(), '.kimi-code');
const CLAUDE_STATUS_FILE = path.join(os.homedir(), '.config', 'oneai', 'claude-status.json');
const AGY_SETTINGS_FILE = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
const AGY_BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
const PI_SETTINGS_FILE = path.join(os.homedir(), '.pi', 'agent', 'settings.json');
const PI_MODELS_FILE = path.join(os.homedir(), '.pi', 'agent', 'models.json');
const PI_SESSIONS_DIR = path.join(os.homedir(), '.pi', 'agent', 'sessions');

export interface SessionTokenUsage {
  tokens?: number;
  tokenInput?: number;
  tokenOutput?: number;
  tokenCache?: number;
  cacheHitPercent?: number;
  ctxPercent?: number;
  ctxTokens?: number;
  ctxWindow?: number;
  costUsd?: number;
}

const cleanNonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** 统一计算顶栏展示的会话累计 tokens（in / out / cache）、缓存命中率与上下文占用，各 CLI 共用 */
export function computeSessionUsage(params: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite?: number;
  lastCtxTokens?: number;
  ctxWindow?: number;
  ctxPercent?: number;
  costUsd?: number;
}): SessionTokenUsage {
  const input = cleanNonNeg(params.input);
  const output = cleanNonNeg(params.output);
  const cacheRead = cleanNonNeg(params.cacheRead);
  const cacheWrite = cleanNonNeg(params.cacheWrite);
  const cache = cacheRead + cacheWrite;
  const tokens = input + output + cache;
  const totalInput = input + cache;
  const cacheHitPercent = totalInput > 0 ? Math.max(0, Math.min(100, Math.round((cacheRead / totalInput) * 100))) : undefined;
  const ctxTokens = typeof params.lastCtxTokens === 'number' && Number.isFinite(params.lastCtxTokens) && params.lastCtxTokens >= 0
    ? params.lastCtxTokens
    : undefined;
  const ctxWindow = typeof params.ctxWindow === 'number' && Number.isFinite(params.ctxWindow) && params.ctxWindow > 0
    ? params.ctxWindow
    : undefined;
  const ctxPercent = typeof params.ctxPercent === 'number' && Number.isFinite(params.ctxPercent)
    ? Math.max(0, Math.min(100, Math.round(params.ctxPercent)))
    : (ctxTokens !== undefined && ctxWindow !== undefined
      ? Math.max(0, Math.min(100, Math.round((ctxTokens / ctxWindow) * 100)))
      : undefined);
  const costUsd = typeof params.costUsd === 'number' && Number.isFinite(params.costUsd) && params.costUsd >= 0
    ? params.costUsd
    : undefined;

  const out: SessionTokenUsage = {};
  if (tokens > 0) {
    out.tokens = tokens;
    out.tokenInput = input;
    out.tokenOutput = output;
    out.tokenCache = cache;
  }
  if (cacheHitPercent !== undefined) out.cacheHitPercent = cacheHitPercent;
  if (ctxPercent !== undefined) out.ctxPercent = ctxPercent;
  if (ctxTokens !== undefined) out.ctxTokens = ctxTokens;
  if (ctxWindow !== undefined) out.ctxWindow = ctxWindow;
  if (costUsd !== undefined) out.costUsd = costUsd;
  return out;
}

interface AgyUsageRow {
  group: string;
  label: string;
  pct: number;
  resetMs: number;
}

function parseAgyRows(raw: string): AgyUsageRow[] {
  const rows: AgyUsageRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const group = parts[0]?.trim();
    const label = parts[1]?.trim();
    if (!group || !label) continue;
    const n = parseInt(parts[2] ?? '', 10);
    const pct = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : -1;
    const parsedReset = parts[3] ? Date.parse(parts[3].trim()) : NaN;
    const resetMs = Number.isFinite(parsedReset) ? parsedReset : 0;
    rows.push({ group, label, pct, resetMs });
  }
  return rows;
}

function pickAgyWindow(rows: AgyUsageRow[], targetGroup: string, re: RegExp, now: number): { pct: number; resetMs: number } {
  const targetLower = targetGroup.toLowerCase();
  const hit = rows.find((r) => r.group.toLowerCase() === targetLower && re.test(r.label));
  if (!hit) return { pct: -1, resetMs: 0 };
  const expired = hit.pct >= 0 && hit.resetMs > 0 && hit.resetMs <= now;
  return { pct: expired ? 100 : hit.pct, resetMs: hit.resetMs };
}

/**
 * 解析 `agy -p /usage` 的全部分组额度（按首次出现顺序去重），供 Dashboard 展示同账号下的全部配额窗口。
 */
export function parseAgyUsageGroups(raw: string, now = Date.now()): Array<{
  group: string;
  five: { pct: number; resetMs: number };
  seven: { pct: number; resetMs: number };
}> {
  const rows = parseAgyRows(raw);
  const groups: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const lower = row.group.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    groups.push(row.group);
  }
  return groups.map((group) => ({
    group,
    five: pickAgyWindow(rows, group, /five\s*hour|5h/i, now),
    seven: pickAgyWindow(rows, group, /weekly|7d/i, now),
  }));
}

/**
 * 解析 `agy -p /usage` 的制表符输出并匹配当前模型所在额度分组。
 * Claude / GPT 走 `Claude and GPT models`；独立模型分组（如 `Gemini 4 Argon`）优先匹配同名或 Argon 模型；其余 Gemini 与 `Orchestrator (Neon)` 归入 `Gemini Models`。
 */
export function parseAgyUsage(raw: string, modelName: string, now = Date.now()): {
  group: string;
  five: { pct: number; resetMs: number };
  seven: { pct: number; resetMs: number };
} {
  const rows = parseAgyRows(raw);

  let targetGroup = 'Gemini Models';
  if (/claude|gpt/i.test(modelName)) {
    targetGroup = 'Claude and GPT models';
  } else {
    const lowerModel = modelName.toLowerCase();
    const dedicated = [...new Set(rows.map((r) => r.group))].find((g) => {
      const lg = g.toLowerCase();
      if (lg === 'gemini models' || lg === 'claude and gpt models') return false;
      return lowerModel.includes(lg) || (/argon/i.test(modelName) && /argon/i.test(g));
    });
    if (dedicated) targetGroup = dedicated;
  }

  return {
    group: targetGroup,
    five: pickAgyWindow(rows, targetGroup, /five\s*hour|5h/i, now),
    seven: pickAgyWindow(rows, targetGroup, /weekly|7d/i, now),
  };
}

function formatDuration(diffMs: number): string {
  if (diffMs <= 0) return '0m';
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatResetDay(targetMs: number): string {
  if (!targetMs || targetMs <= Date.now()) return t('已重置');
  // 与 5h 的「3h 55m」同一写法：「4d 2h 47m」，不足一天时省略天数
  const diffMs = targetMs - Date.now();
  const days = Math.floor(diffMs / 86_400_000);
  const rest = formatDuration(diffMs % 86_400_000);
  return days > 0 ? `${days}d ${rest}` : rest;
}

export class QuotaService {
  private mainWindow: BrowserWindow | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private quotasCache: Record<string, QuotaData> = {};
  private cacheExpiry: Record<string, number> = {};
  private readonly CACHE_TTL_MS = 25000;
  private readonly AGY_USAGE_TTL_MS = 120000;
  private agyUsageRaw: string | null = null;
  private agyUsageAt = 0;
  private agyUsageError = '';
  private agyUsagePending: Promise<void> | null = null;
  private agyMissing = false;
  private activeCliId: string | null = null;
  private pollingActive = false;
  private baseWatchers = new Map<string, fs.FSWatcher>();
  private piSessionsWatcher: fs.FSWatcher | null = null;
  private accountWatchers = new Map<string, { dir: string; watcher: fs.FSWatcher }>();
  private debounceMap = new Map<string, NodeJS.Timeout>();
  // 多账号：key 为渲染进程里的账号 id，与默认账号（key 为 cliId）并列缓存、轮询和广播
  private accounts = new Map<string, { cliId: AccountCliId; dir: string }>();

  constructor() {
    const kimiInfo: { model: string; effort?: string } = { model: 'K3' };
    const codexInfo: { model: string; effort?: string } = { model: 'Auto' };
    const claudeInfo: { model: string; effort?: string } = { model: 'Claude' };
    const grokInfo: { model: string; effort?: string } = { model: 'Grok 4.7' };
    const opencodeInfo: { model: string; effort?: string } = { model: 'Auto' };
    const agyInfo: { model: string; effort?: string } = { model: 'Auto' };
    const piInfo: { model: string; effort?: string } = { model: 'Auto' };

    this.quotasCache = {
      kimi: {
        cliId: 'kimi',
        cliName: 'Kimi Code',
        model: kimiInfo.model,
        effort: kimiInfo.effort,
        planType: 'Kimi Coding',
        fiveHourPercent: -1,
        fiveHourResetsIn: '--',
        sevenDayPercent: -1,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
      },
      codex: {
        cliId: 'codex',
        cliName: 'Codex',
        model: codexInfo.model,
        effort: codexInfo.effort,
        planType: 'Plus',
        fiveHourPercent: -1,
        fiveHourResetsIn: '--',
        sevenDayPercent: -1,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
      },
      claude: {
        cliId: 'claude',
        cliName: 'Claude Code',
        model: claudeInfo.model,
        effort: claudeInfo.effort,
        planType: 'Pro',
        fiveHourPercent: -1,
        fiveHourResetsIn: '--',
        sevenDayPercent: -1,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
      },
      opencode: {
        cliId: 'opencode',
        cliName: 'OpenCode',
        model: opencodeInfo.model,
        effort: opencodeInfo.effort,
        fiveHourPercent: -1,
        fiveHourResetsIn: '--',
        sevenDayPercent: -1,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
        message: t('无额度接口'),
      },
      pi: {
        cliId: 'pi',
        cliName: 'Pi',
        model: piInfo.model,
        effort: piInfo.effort,
        fiveHourPercent: -1,
        fiveHourResetsIn: '--',
        sevenDayPercent: -1,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
        message: t('无额度接口'),
      },
      agy: {
        cliId: 'agy',
        cliName: 'Antigravity',
        model: agyInfo.model,
        effort: agyInfo.effort,
        fiveHourPercent: -1,
        fiveHourResetsIn: '--',
        sevenDayPercent: -1,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
        message: t('无额度接口'),
      },
      grok: {
        cliId: 'grok',
        cliName: 'Grok Build',
        model: grokInfo.model,
        effort: grokInfo.effort,
        planType: 'xAI Premium',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
      },
      terminal: {
        cliId: 'terminal',
        cliName: t('系统终端'),
        model: 'PowerShell / CMD',
        planType: 'Local Shell',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
        message: 'PowerShell Ready',
      },
    };
  }

  private buildTerminalQuota(): QuotaData {
    return {
      cliId: 'terminal',
      cliName: t('系统终端'),
      model: 'PowerShell / CMD',
      planType: 'Local Shell',
      fiveHourPercent: 100,
      fiveHourResetsIn: '--',
      sevenDayPercent: 100,
      sevenDayResetsOn: '--',
      lastUpdated: Date.now(),
      status: 'normal',
      message: 'PowerShell Ready',
    };
  }

  private scheduleWatchedRefresh(key: string, delayMs = 300): void {
    const prev = this.debounceMap.get(key);
    if (prev) clearTimeout(prev);
    this.debounceMap.set(key, setTimeout(() => {
      this.debounceMap.delete(key);
      if (this.quotasCache[key] || this.accounts.has(key)) {
        this.cacheExpiry[key] = 0;
        void this.fetchQuotaForCli(key, false).then(() => this.broadcast());
      }
    }, delayMs));
  }

  /** 按需为已存在的配置目录挂载热监听；运行期新装 CLI 或首次生成目录后会在下次轮询时自动补挂 */
  private async ensureBaseWatchers(): Promise<void> {
    // 不在此处监听 ~/.claude.json：其父目录是整个用户主目录，任何主目录文件变动都会唤醒回调，且实时模型切换已由 CLAUDE_STATUS_FILE 与 settings.json 覆盖
    const watchList: Array<{ filePath: string; cliId: string }> = [
      { filePath: path.join(os.homedir(), '.kimi-code', 'config.toml'), cliId: 'kimi' },
      { filePath: path.join(os.homedir(), '.codex', 'config.toml'), cliId: 'codex' },
      { filePath: path.join(os.homedir(), '.claude', 'settings.json'), cliId: 'claude' },
      { filePath: CLAUDE_STATUS_FILE, cliId: 'claude' },
      { filePath: path.join(os.homedir(), '.grok', 'settings_cache.json'), cliId: 'grok' },
      { filePath: path.join(os.homedir(), '.grok', 'models_cache.json'), cliId: 'grok' },
      { filePath: path.join(os.homedir(), '.grok', 'config.toml'), cliId: 'grok' },
      { filePath: path.join(os.homedir(), '.opencode', 'config.json'), cliId: 'opencode' },
      { filePath: AGY_SETTINGS_FILE, cliId: 'agy' },
      { filePath: PI_SETTINGS_FILE, cliId: 'pi' },
      { filePath: PI_MODELS_FILE, cliId: 'pi' },
    ];

    const directories = new Map<string, typeof watchList>();
    for (const item of watchList) {
      const dir = path.dirname(item.filePath);
      const items = directories.get(dir) ?? [];
      items.push(item);
      directories.set(dir, items);
    }
    for (const [dir, items] of directories) {
      const dirKey = normalizePathKey(dir);
      if (this.baseWatchers.has(dirKey)) continue;
      try {
        const watcher = fs.watch(dir, (_event, filename) => {
          const name = filename?.toString().toLowerCase();
          for (const item of items) {
            if (name != null && name !== path.basename(item.filePath).toLowerCase()) continue;
            this.scheduleWatchedRefresh(item.cliId, 300);
          }
        });
        watcher.on('error', () => {
          try { watcher.close(); } catch {}
          if (this.baseWatchers.get(dirKey) === watcher) this.baseWatchers.delete(dirKey);
        });
        this.baseWatchers.set(dirKey, watcher);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[QuotaService] Failed to watch directory:', dir, err);
      }
    }

    // pi 切换模型只追加会话 jsonl，监听会话目录以便即时刷新
    if (!this.piSessionsWatcher) {
      try {
        if (await exists(PI_SESSIONS_DIR)) {
          const watcher = fs.watch(PI_SESSIONS_DIR, { recursive: true }, () => {
            this.scheduleWatchedRefresh('pi', 500);
          });
          watcher.on('error', () => {
            try { watcher.close(); } catch {}
            if (this.piSessionsWatcher === watcher) this.piSessionsWatcher = null;
          });
          this.piSessionsWatcher = watcher;
        }
      } catch (err) {
        console.warn('[QuotaService] Failed to watch pi sessions:', err);
      }
    }
  }

  private syncAccountWatchers(): void {
    const configNameOf: Record<AccountCliId, string> = {
      kimi: 'config.toml',
      codex: 'config.toml',
      claude: 'settings.json',
    };
    for (const [key, entry] of this.accountWatchers) {
      const current = this.accounts.get(key);
      if (!current || !isSamePath(current.dir, entry.dir)) {
        try { entry.watcher.close(); } catch {}
        this.accountWatchers.delete(key);
      }
    }
    for (const [key, { cliId, dir }] of this.accounts) {
      if (this.accountWatchers.has(key)) continue;
      const expected = configNameOf[cliId];
      try {
        const watcher = fs.watch(dir, (_event, filename) => {
          const name = filename?.toString().toLowerCase();
          if (name != null && name !== expected) return;
          this.scheduleWatchedRefresh(key, 300);
        });
        watcher.on('error', () => {
          try { watcher.close(); } catch {}
          if (this.accountWatchers.get(key)?.watcher === watcher) this.accountWatchers.delete(key);
        });
        this.accountWatchers.set(key, { dir, watcher });
      } catch {
        // 账号配置目录尚未生成时跳过监听，后续登录后在轮询周期自动补挂
      }
    }
  }

  public setActiveCli(cliId: string | null): void {
    const prev = this.activeCliId;
    this.activeCliId = cliId;
    if (cliId === 'agy' && prev !== 'agy') {
      this.cacheExpiry['agy'] = 0;
      void this.fetchQuotaForCli('agy', false).then(() => this.broadcast());
    }
  }

  public setWindow(win: BrowserWindow) {
    this.mainWindow = win;
    const refreshOnVisible = () => {
      if (this.pollingActive && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) {
        void this.refreshAllQuotas();
      }
    };
    win.on('restore', refreshOnVisible);
    win.on('show', refreshOnVisible);
  }

  public startPolling(intervalMs: number = 30000) {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
    this.pollingActive = true;
    void this.ensureBaseWatchers();
    this.syncAccountWatchers();
    void this.refreshAllQuotas();

    this.intervalTimer = setInterval(() => {
      if (this.mainWindow && !this.mainWindow.isDestroyed() && (!this.mainWindow.isVisible() || this.mainWindow.isMinimized())) {
        return;
      }
      void this.refreshAllQuotas();
    }, intervalMs);
  }

  public stopPolling() {
    this.pollingActive = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    for (const timer of this.debounceMap.values()) clearTimeout(timer);
    this.debounceMap.clear();
    for (const { watcher } of this.accountWatchers.values()) {
      try { watcher.close(); } catch {}
    }
    this.accountWatchers.clear();
    for (const watcher of this.baseWatchers.values()) {
      try { watcher.close(); } catch {}
    }
    this.baseWatchers.clear();
    if (this.piSessionsWatcher) {
      try { this.piSessionsWatcher.close(); } catch {}
      this.piSessionsWatcher = null;
    }
  }

  public getQuota(cliId: string = 'kimi'): QuotaData {
    return this.quotasCache[cliId] || this.quotasCache['kimi'];
  }

  public getAllQuotas(): Record<string, QuotaData> {
    return this.quotasCache;
  }

  /** 同步账号列表：只保留有效账号，配置目录变化或已删除的账号丢弃旧缓存；轮询启动后按需同步监听并刷新 */
  public setAccounts(list: Array<{ key: string; cliId: string; configDir: string }>): void {
    const next = new Map<string, { cliId: AccountCliId; dir: string }>();
    for (const item of list) {
      const dir = resolveConfigDir(item?.configDir);
      if (typeof item?.key === 'string' && item.key && isAccountCli(item.cliId) && dir) next.set(item.key, { cliId: item.cliId, dir });
    }
    const unchanged = next.size === this.accounts.size
      && [...next.entries()].every(([key, val]) => {
        const cur = this.accounts.get(key);
        return cur?.cliId === val.cliId && cur?.dir === val.dir;
      });
    if (unchanged) return;
    for (const [key, old] of this.accounts) {
      if (next.get(key)?.dir !== old.dir) {
        delete this.quotasCache[key];
        delete this.cacheExpiry[key];
      }
    }
    this.accounts = next;
    if (this.pollingActive) {
      this.syncAccountWatchers();
      void this.refreshAllQuotas();
    }
  }

  public async refreshQuota(cliId?: string): Promise<Record<string, QuotaData>> {
    const forceAgyUsage = cliId === 'agy';
    if (forceAgyUsage) {
      this.agyMissing = false;
      this.agyUsageAt = 0;
    }
    if (cliId && (this.quotasCache[cliId] || this.accounts.has(cliId))) {
      this.cacheExpiry[cliId] = 0;
      await this.fetchQuotaForCli(cliId, forceAgyUsage);
      this.broadcast();
      return this.quotasCache;
    }
    return this.refreshAllQuotas();
  }

  public async refreshAllQuotas(): Promise<Record<string, QuotaData>> {
    if (this.pollingActive) {
      void this.ensureBaseWatchers();
      this.syncAccountWatchers();
    }
    const cliIds = ['kimi', 'codex', 'claude', 'opencode', 'agy', 'pi', 'grok', 'terminal', ...this.accounts.keys()];
    await Promise.allSettled(cliIds.map((id) => this.fetchQuotaForCli(id)));
    this.broadcast();
    return this.quotasCache;
  }

  private async fetchQuotaForCli(cliId: string, forceUsage = false): Promise<void> {
    const now = Date.now();
    if (cliId !== 'terminal' && !forceUsage && this.cacheExpiry[cliId] && now < this.cacheExpiry[cliId]) {
      return;
    }

    try {
      let data: QuotaData | null = null;
      const account = this.accounts.get(cliId);
      switch (account ? account.cliId : cliId) {
        case 'kimi':
          data = await this.fetchKimiQuota(cliId, account?.dir);
          break;
        case 'codex':
          data = await this.fetchCodexQuota(cliId, account?.dir);
          break;
        case 'claude':
          data = await this.fetchClaudeQuota(account?.dir);
          break;
        case 'opencode':
          data = await this.fetchOpenCodeQuota();
          break;
        case 'pi':
          data = await this.fetchPiQuota();
          break;
        case 'agy':
          data = await this.fetchAgyQuota(forceUsage);
          break;
        case 'grok':
          data = await this.fetchGrokQuota();
          break;
        case 'terminal':
          data = this.buildTerminalQuota();
          break;
      }

      if (data) {
        this.quotasCache[cliId] = data;
        this.cacheExpiry[cliId] = now + this.CACHE_TTL_MS;
      }
    } catch (err) {
      console.error(`[QuotaService] Error fetching quota for ${cliId}:`, err);
    }
  }

  public async getKimiInfo(home: string = KIMI_HOME_DEFAULT): Promise<{ model: string; effort?: string }> {
    const configPath = path.join(home, 'config.toml');
    if (!await exists(configPath)) {
      return { model: 'K3', effort: undefined };
    }

    let model = 'K3';
    let effort: string | undefined = undefined;

    try {
      const content = await fs.promises.readFile(configPath, 'utf8');
      const sections = parseTomlStrings(content);
      const top = sections.get('') ?? new Map<string, string>();
      const defaultModelKey = top.get('default_model') ?? '';

      if (defaultModelKey) {
        const modelSection = sections.get(`models.${defaultModelKey}`);
        if (modelSection) {
          const displayName = modelSection.get('display_name');
          if (displayName) model = displayName;
          const modelEffort = modelSection.get('default_effort');
          if (modelEffort) effort = modelEffort;
        }

        if (model === 'K3') {
          if (defaultModelKey.includes('highspeed')) model = 'K2.7 Highspeed';
          else if (defaultModelKey.includes('kimi-for-coding')) model = 'K2.8 Preview';
          else if (defaultModelKey.includes('k3')) model = 'K3';
          else model = defaultModelKey.split('/').pop() || defaultModelKey;
        }
      }

      // 优先从 [thinking] 块中提取全局设置的 effort（如 effort = "high"）
      const thinkingEffort = sections.get('thinking')?.get('effort');
      if (thinkingEffort) effort = thinkingEffort;
    } catch (e) {
      console.warn('[QuotaService] Error parsing Kimi config:', e);
    }

    if (process.env.KIMI_EFFORT) effort = process.env.KIMI_EFFORT;

    return { model, effort };
  }

  public async getCodexInfo(home: string = CODEX_HOME_DEFAULT): Promise<{ model: string; effort?: string }> {
    let model = 'Auto';
    let effort: string | undefined = undefined;
    const configPath = path.join(home, 'config.toml');
    if (await exists(configPath)) {
      try {
        const content = await fs.promises.readFile(configPath, 'utf8');
        const top = parseTomlStrings(content).get('') ?? new Map<string, string>();
        const parsedModel = top.get('model');
        if (parsedModel) model = parsedModel;
        const parsedEffort = top.get('model_reasoning_effort');
        if (parsedEffort) effort = parsedEffort;
      } catch (e) {
        console.warn('[QuotaService] Error reading Codex config:', e);
      }
    }
    if (model === 'Auto' && process.env.CODEX_MODEL) {
      model = process.env.CODEX_MODEL;
    }
    if (!effort && process.env.CODEX_REASONING_EFFORT) {
      effort = process.env.CODEX_REASONING_EFFORT;
    }
    return { model, effort };
  }

  public async getClaudeInfo(configDir?: string): Promise<{ model: string; effort?: string }> {
    let modelId = '';
    let settings: any = null;

    // 非默认账号只读它自己的 settings.json：statusLine 快照与 ~/.claude.json 都属于默认账号
    const settingsPath = path.join(configDir ?? CLAUDE_HOME_DEFAULT, 'settings.json');
    if (await exists(settingsPath)) {
      try { settings = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8')); } catch {}
    }

    // 1. statusLine 落盘文件：会话内 /model、推理等级切换后立即更新，是唯一实时来源
    let statusEffort: string | undefined;
    if (!configDir) {
      try {
        const d = JSON.parse(await fs.promises.readFile(CLAUDE_STATUS_FILE, 'utf8'));
        modelId = d.model?.id || d.model?.display_name || '';
        if (typeof d.effort?.level === 'string') statusEffort = d.effort.level;
      } catch {}
    }

    // 2. settings.json / 环境变量
    if (!modelId && settings) {
      const m = settings.model ? String(settings.model) : '';
      modelId = settings.env?.[`ANTHROPIC_DEFAULT_${m.toUpperCase()}_MODEL`] || settings.env?.ANTHROPIC_MODEL || m;
    }
    if (!modelId && !configDir) modelId = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || '';

    // 3. 兜底：~/.claude.json 中最近启动项目的 lastModelUsage。它是上一个已结束会话的用量统计，不随 /model 变化
    if (!modelId && !configDir) {
      try {
        const c = JSON.parse(await fs.promises.readFile(path.join(os.homedir(), '.claude.json'), 'utf8'));
        const projs = Object.values(c.projects || {})
          .filter((v: any) => v && v.lastModelUsage && Object.keys(v.lastModelUsage).length > 0)
          .sort((x: any, y: any) => (y.lastStartTime || 0) - (x.lastStartTime || 0));
        if (projs.length > 0) {
          const keys = Object.keys((projs[0] as any).lastModelUsage).filter((k) => !/haiku/i.test(k));
          if (keys.length > 0) modelId = keys[keys.length - 1];
        }
      } catch {}
    }

    let effort: string | undefined = statusEffort || settings?.modelSettings?.[modelId]?.effortLevel;
    if (!effort) effort = settings?.effortLevel || settings?.effort;

    return { model: modelId ? formatClaudeModel(modelId) : 'Claude', effort };
  }

  public async getGrokInfo(): Promise<{ model: string; effort?: string }> {
    let model = 'Grok 4.7';
    let effort: string | undefined = undefined;

    // 1. 优先读取 ~/.grok/config.toml 中用户的自定义配置与推理等级
    const grokConfig = path.join(os.homedir(), '.grok', 'config.toml');
    let configDefaultModel: string | undefined = undefined;
    if (await exists(grokConfig)) {
      try {
        const sections = parseTomlStrings(await fs.promises.readFile(grokConfig, 'utf8'));
        const top = sections.get('');
        const modelSec = sections.get('model') ?? sections.get('models');
        configDefaultModel = top?.get('default') ?? top?.get('default_model') ?? modelSec?.get('default') ?? modelSec?.get('default_model');
        const parsedEffort = top?.get('default_reasoning_effort')
          ?? top?.get('reasoning_effort')
          ?? modelSec?.get('default_reasoning_effort')
          ?? modelSec?.get('reasoning_effort')
          ?? sections.get('thinking')?.get('effort');
        if (parsedEffort) effort = parsedEffort;
      } catch {}
    }

    // 2. 读取 ~/.grok/settings_cache.json
    const grokSettings = path.join(os.homedir(), '.grok', 'settings_cache.json');
    let defaultModelId = configDefaultModel || 'grok-4.7';
    if (await exists(grokSettings)) {
      try {
        const raw = JSON.parse(await fs.promises.readFile(grokSettings, 'utf8'));
        const payload = typeof raw.payload === 'string' ? JSON.parse(raw.payload) : raw.payload;
        if (!configDefaultModel && payload?.settings?.default_model) {
          defaultModelId = payload.settings.default_model;
        }
      } catch (e) {
        console.warn('[QuotaService] Error reading Grok settings_cache:', e);
      }
    }

    // 3. 查看 models_cache.json 获取友好名称与兜底 reasoning_effort
    const modelsCache = path.join(os.homedir(), '.grok', 'models_cache.json');
    if (await exists(modelsCache)) {
      try {
        const mc = JSON.parse(await fs.promises.readFile(modelsCache, 'utf8'));
        const targetModel = mc.models?.[defaultModelId] || Object.values(mc.models || {})[0];
        if (targetModel?.info) {
          if (targetModel.info.name) model = targetModel.info.name;
          if (!effort && targetModel.info.reasoning_effort) effort = targetModel.info.reasoning_effort;
        }
      } catch {}
    } else {
      model = defaultModelId;
    }

    if (process.env.GROK_MODEL) model = process.env.GROK_MODEL;
    if (process.env.XAI_MODEL) model = process.env.XAI_MODEL;
    if (process.env.GROK_REASONING_EFFORT) effort = process.env.GROK_REASONING_EFFORT;

    return { model, effort };
  }

  public async getOpenCodeInfo(): Promise<{ model: string; effort?: string }> {
    let model = 'Auto';
    let effort: string | undefined = undefined;
    if (process.env.OPENCODE_MODEL) model = process.env.OPENCODE_MODEL;
    if (process.env.OPENCODE_EFFORT) effort = process.env.OPENCODE_EFFORT;
    const opencodeConfig = path.join(os.homedir(), '.opencode', 'config.json');
    if (await exists(opencodeConfig)) {
      try {
        const c = JSON.parse(await fs.promises.readFile(opencodeConfig, 'utf8'));
        if (c.model) model = c.model;
        if (c.effort || c.reasoning_effort) effort = c.effort || c.reasoning_effort;
      } catch {}
    }
    return { model, effort };
  }

  private piSessionCache: {
    file: string;
    offset: number;
    pending: Buffer;
    state: {
      provider?: string;
      modelId?: string;
      thinkingLevel?: string;
      hasUsage: boolean;
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      costUsd: number;
      lastCtxTokens?: number;
    };
  } | null = null;

  /** 找到最近修改的 pi 会话文件，取其中最后一条 model_change / thinking_level_change 及累计 usage；pi 的 /model 只写会话文件，不改 settings.json。 */
  private piSessionPending: Promise<NonNullable<QuotaService['piSessionCache']>['state']> | null = null;

  private readPiSessionState() {
    if (!this.piSessionPending) this.piSessionPending = this.loadPiSessionState().finally(() => { this.piSessionPending = null; });
    return this.piSessionPending;
  }

  private async loadPiSessionState(): Promise<NonNullable<QuotaService['piSessionCache']>['state']> {
    const emptyState = () => ({ hasUsage: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 });
    try {
      const dirs = await fs.promises.readdir(PI_SESSIONS_DIR);
      const candidates = (await Promise.all(dirs.map(async (dir) => {
        const dirPath = path.join(PI_SESSIONS_DIR, dir);
        let names: string[];
        try { names = await fs.promises.readdir(dirPath); } catch { return []; }
        return Promise.all(names.filter((name) => name.endsWith('.jsonl')).map(async (name) => {
          const file = path.join(dirPath, name);
          try { return { file, mtime: (await fs.promises.stat(file)).mtimeMs }; } catch { return null; }
        }));
      }))).flat();
      let latest: { file: string; mtime: number } | null = null;
      for (const item of candidates) {
        if (item && (!latest || item.mtime > latest.mtime)) latest = item;
      }
      if (!latest) return emptyState();
      // 会话文件只追加：记住已读到的位置，之后只读新增的部分，避免长会话每次刷新都整份重读
      let cache = this.piSessionCache;
      const size = (await fs.promises.stat(latest.file)).size;
      if (!cache || cache.file !== latest.file || size < cache.offset) {
        cache = { file: latest.file, offset: 0, pending: Buffer.alloc(0), state: emptyState() };
        this.piSessionCache = cache;
      }
      if (size > cache.offset) {
        const chunk = Buffer.alloc(size - cache.offset);
        const fd = await fs.promises.open(latest.file, 'r');
        let read = 0;
        try {
          ({ bytesRead: read } = await fd.read(chunk, 0, chunk.length, cache.offset));
        } finally {
          await fd.close();
        }
        cache.offset += read;
        const data = Buffer.concat([cache.pending, chunk.subarray(0, read)]);
        // 末尾可能是还没写完的半行，留到下次再解析
        const lastNewline = data.lastIndexOf(0x0a);
        cache.pending = lastNewline < 0 ? data : data.subarray(lastNewline + 1);
        if (lastNewline >= 0) {
          for (const line of data.subarray(0, lastNewline).toString('utf8').split('\n')) {
            const isChange = line.startsWith('{"type":"model_change"') || line.startsWith('{"type":"thinking_level_change"');
            const isUsage = line.includes('"role":"assistant"') && line.includes('"usage"');
            if (!isChange && !isUsage) continue;
            try {
              const e = JSON.parse(line);
              if (e.type === 'model_change') { cache.state.provider = e.provider; cache.state.modelId = e.modelId; }
              else if (e.type === 'thinking_level_change') cache.state.thinkingLevel = e.thinkingLevel;
              else if (e.type === 'message' && e.message?.role === 'assistant' && e.message.usage) {
                const u = e.message.usage;
                const inp = cleanNonNeg(u.input);
                const out = cleanNonNeg(u.output);
                const cr = cleanNonNeg(u.cacheRead);
                const cw = cleanNonNeg(u.cacheWrite);
                if (inp + out + cr + cw > 0) {
                  cache.state.hasUsage = true;
                  cache.state.input += inp;
                  cache.state.output += out;
                  cache.state.cacheRead += cr;
                  cache.state.cacheWrite += cw;
                  const cost = cleanNonNeg(u.cost?.total);
                  if (cost > 0) cache.state.costUsd += cost;
                  cache.state.lastCtxTokens = inp + cr + cw;
                }
              }
            } catch {}
          }
        }
      }
      return cache.state;
    } catch {
      return emptyState();
    }
  }

  private async readPiDetails(): Promise<{
    model: string;
    effort?: string;
    ctxWindow?: number;
    session: NonNullable<QuotaService['piSessionCache']>['state'];
  }> {
    let model = 'Auto';
    let effort: string | undefined = undefined;
    let ctxWindow: number | undefined = undefined;
    let provider: string | undefined;
    let modelId: string | undefined;
    try {
      const s = JSON.parse(await fs.promises.readFile(PI_SETTINGS_FILE, 'utf8'));
      if (typeof s.defaultModel === 'string' && s.defaultModel) { modelId = s.defaultModel; provider = s.defaultProvider; }
      if (typeof s.defaultThinkingLevel === 'string' && s.defaultThinkingLevel) effort = s.defaultThinkingLevel;
    } catch {}
    const session = await this.readPiSessionState();
    if (session.modelId) { modelId = session.modelId; provider = session.provider; }
    if (session.thinkingLevel) effort = session.thinkingLevel;
    if (modelId) {
      model = modelId;
      try {
        const providers = JSON.parse(await fs.promises.readFile(PI_MODELS_FILE, 'utf8')).providers || {};
        const list: any[] = (provider && providers[provider]?.models) || [];
        const hit = list.find((m) => m.id === modelId);
        if (hit?.name) model = hit.name;
        if (typeof hit?.contextWindow === 'number' && hit.contextWindow > 0) ctxWindow = hit.contextWindow;
      } catch {}
    }
    return { model, effort, ctxWindow, session };
  }

  /** 读取 pi 当前模型：优先取最近会话里的实际模型，没有会话时回退 settings.json 的 defaultModel；显示名取自 models.json。 */
  public async getPiInfo(): Promise<{ model: string; effort?: string }> {
    const { model, effort } = await this.readPiDetails();
    return { model, effort };
  }

  /** 读取 agy 当前模型，settings.json 中形如 "Gemini 4 Hydrogen (Medium)"，括号内为推理等级。 */
  public async getAgyInfo(): Promise<{ model: string; effort?: string; rawModel: string }> {
    let model = 'Auto';
    let effort: string | undefined = undefined;
    let rawModel = 'Auto';
    try {
      const raw = JSON.parse(await fs.promises.readFile(AGY_SETTINGS_FILE, 'utf8')).model;
      if (typeof raw === 'string' && raw.trim()) {
        rawModel = raw.trim();
        const m = rawModel.match(/^(.*?)\s*\(([^)]+)\)$/);
        if (m) {
          model = m[1];
          effort = m[2].toLowerCase();
        } else {
          model = rawModel;
        }
      }
    } catch {}
    return { model, effort, rawModel };
  }

  /** key 为缓存键（默认账号是 'kimi'），home 为该账号的 KIMI_CODE_HOME；账号读取失败时额度记为未知，不借用默认账号的缓存 */
  private async fetchKimiQuota(key: string = 'kimi', home: string = KIMI_HOME_DEFAULT): Promise<QuotaData> {
    const credPath = path.join(home, 'credentials', 'kimi-code.json');
    const kimiInfo = await this.getKimiInfo(home);
    const currentModel = kimiInfo.model;
    const currentEffort = kimiInfo.effort;

    if (!await exists(credPath)) {
      return {
        cliId: 'kimi',
        cliName: 'Kimi Code',
        model: currentModel,
        effort: currentEffort,
        fiveHourPercent: 0,
        fiveHourResetsIn: '--',
        sevenDayPercent: 0,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'offline',
        message: t('未找到 Kimi 凭证文件'),
      };
    }

    try {
      const cred = JSON.parse(await fs.promises.readFile(credPath, 'utf8'));
      const token = cred.access_token;
      if (!token) {
        throw new Error(t('access_token 不存在'));
      }

      const resData = await new Promise<any>((resolve, reject) => {
        const req = https.request('https://api.kimi.com/coding/v1/usages', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          timeout: 8000,
        }, (res) => {
          let chunks = '';
          res.on('data', (chunk) => (chunks += chunk));
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve(JSON.parse(chunks));
              } catch (e) {
                reject(e);
              }
            } else {
              reject(new Error(`Kimi API status ${res.statusCode}`));
            }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Kimi API timeout'));
        });
        req.end();
      });

      const usages = resData.usages || {};
      const limit5h = usages.limit_5h || {};
      const limit7d = usages.limit_7d || {};

      // 接口未返回对应窗口时记为 -1，界面显示 "--"，避免把缺失数据误显示为 100%
      const toRemaining = (w: any): number =>
        typeof w.used_ratio === 'number' ? Math.max(0, Math.min(100, Math.round((1 - w.used_ratio) * 100))) : -1;
      const fiveHourPercent = toRemaining(limit5h);
      const sevenDayPercent = toRemaining(limit7d);

      let fiveHourResetsIn = fiveHourPercent < 0 ? '--' : t('已就绪');
      if (limit5h.reset_time) {
        const resetMs = new Date(limit5h.reset_time).getTime();
        const diff = resetMs - Date.now();
        if (diff > 0) fiveHourResetsIn = formatDuration(diff);
      }

      let sevenDayResetsOn = sevenDayPercent < 0 ? '--' : t('近期重置');
      if (limit7d.reset_time) {
        const resetMs = new Date(limit7d.reset_time).getTime();
        sevenDayResetsOn = formatResetDay(resetMs);
      }

      const known = [fiveHourPercent, sevenDayPercent].filter((p) => p >= 0);
      const minPct = known.length ? Math.min(...known) : 100;
      const status = minPct < 15 ? 'critical' : minPct < 40 ? 'warning' : 'normal';

      return {
        cliId: 'kimi',
        cliName: 'Kimi Code',
        model: currentModel,
        effort: currentEffort,
        planType: 'Kimi Coding',
        fiveHourPercent,
        fiveHourResetsIn,
        sevenDayPercent,
        sevenDayResetsOn,
        lastUpdated: Date.now(),
        status,
      };
    } catch (err: any) {
      console.warn('[QuotaService] Kimi fetch fallback:', err.message);
      const prev = this.quotasCache[key];
      const hasRealPrev = Boolean(prev && (prev.fiveHourResetsIn !== '--' || prev.sevenDayResetsOn !== '--'));
      if (hasRealPrev) {
        return {
          ...prev,
          model: currentModel,
          effort: currentEffort,
          lastUpdated: Date.now(),
        };
      }
      return {
        cliId: 'kimi',
        cliName: 'Kimi Code',
        model: currentModel,
        effort: currentEffort,
        planType: 'Kimi Coding',
        fiveHourPercent: -1,
        fiveHourResetsIn: '--',
        sevenDayPercent: -1,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
        message: t('额度读取失败：{reason}', { reason: err.message }),
      };
    }
  }

  /** key 为缓存键（默认账号是 'codex'），home 为该账号的 CODEX_HOME；账号没有会话记录时额度记为未知而不是 100% */
  private async fetchCodexQuota(key: string = 'codex', home: string = CODEX_HOME_DEFAULT): Promise<QuotaData> {
    const isAccount = !isSamePath(home, CODEX_HOME_DEFAULT);
    const unknownPct = isAccount ? -1 : 100;
    const codexInfo = await this.getCodexInfo(home);
    const currentModel = codexInfo.model;
    const currentEffort = codexInfo.effort;
    const codexSessionsDir = path.join(home, 'sessions');
    if (!await exists(codexSessionsDir)) {
      return {
        cliId: 'codex',
        cliName: 'Codex',
        model: currentModel,
        effort: currentEffort,
        planType: 'Plus',
        fiveHourPercent: unknownPct,
        fiveHourResetsIn: '--',
        sevenDayPercent: unknownPct,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
        message: isAccount ? t('该账号暂无会话记录') : undefined,
      };
    }

    try {
      // 会话按 YYYY/MM/DD 目录存放：由新到旧遍历，凑够 10 个文件即停，避免每次全量扫描
      const MAX_SESSION_FILES = 10;
      const findRecentJsonl = async (dir: string, depth = 0): Promise<string[]> => {
        if (depth > 4) return [];
        let entries: fs.Dirent[];
        try {
          entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
          return [];
        }
        const res: string[] = [];
        for (const e of entries) {
          if (e.isFile() && e.name.endsWith('.jsonl')) res.push(path.join(dir, e.name));
        }
        const subDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse();
        for (const name of subDirs) {
          if (res.length >= MAX_SESSION_FILES) break;
          res.push(...await findRecentJsonl(path.join(dir, name), depth + 1));
        }
        return res;
      };

      const files = await findRecentJsonl(codexSessionsDir);
      const filesWithStats = (await Promise.all(files.map(async (file) => {
        try { const stat = await fs.promises.stat(file); return { path: file, mtime: stat.mtimeMs, size: stat.size }; }
        catch { return { path: file, mtime: 0, size: 0 }; }
      }))).sort((a, b) => b.mtime - a.mtime);

      let foundRateLimits: any = null;
      let turnContext: { model?: string; effort?: string; at: number } | null = null;
      let planType = 'Plus';
      let foundMainSession = false;
      let sessionUsage: SessionTokenUsage | undefined;

      for (const item of filesWithStats.slice(0, 10)) {
        try {
          const tail = await this.readCodexTail(item.path, item.mtime, item.size);
          if (!tail.isSubagent && !foundMainSession) {
            foundMainSession = true;
            sessionUsage = tail.usage;
          }
          if (!turnContext && tail.context) turnContext = tail.context;
          if (!foundRateLimits && tail.rateLimits) {
            foundRateLimits = tail.rateLimits;
            if (foundRateLimits.plan_type) planType = foundRateLimits.plan_type.toUpperCase();
          }
          if (foundRateLimits && turnContext && foundMainSession) break;
        } catch {}
      }

      // 会话内切换的模型与推理等级只记录在会话日志里：最近一轮比 config.toml 的修改时间新时以它为准，
      // 配置未写模型时也采用；之后又改过配置则仍以配置为准
      let model = currentModel;
      let effort = currentEffort;
      if (turnContext) {
        let configMtime = 0;
        try { configMtime = (await fs.promises.stat(path.join(home, 'config.toml'))).mtimeMs; } catch {}
        if (turnContext.at > configMtime || model === 'Auto') {
          model = turnContext.model || model;
          effort = turnContext.effort || effort;
        }
      }

      if (foundRateLimits) {
        const primary = foundRateLimits.primary || {};
        const secondary = foundRateLimits.secondary || {};

        // 窗口已过重置时间说明额度已恢复，不再沿用日志里的旧占用；缺失窗口返回 -1
        const remaining = (w: any): number => {
          if (!w || typeof w.used_percent !== 'number') return -1;
          if (w.resets_at && w.resets_at * 1000 <= Date.now()) return 100;
          return Math.max(0, Math.min(100, Math.round(100 - w.used_percent)));
        };
        const fiveHourPercent = remaining(primary);
        const sevenDayPercent = remaining(secondary);

        let fiveHourResetsIn = fiveHourPercent < 0 ? '--' : t('已就绪');
        if (fiveHourPercent >= 0 && primary.resets_at) {
          const resetMs = primary.resets_at * 1000;
          const diff = resetMs - Date.now();
          if (diff > 0) fiveHourResetsIn = formatDuration(diff);
        }

        let sevenDayResetsOn = sevenDayPercent < 0 ? '--' : t('近期重置');
        if (sevenDayPercent >= 0 && secondary.resets_at) {
          const resetMs = secondary.resets_at * 1000;
          sevenDayResetsOn = formatResetDay(resetMs);
        }

        const known = [fiveHourPercent, sevenDayPercent].filter((p) => p >= 0);
        const minPct = known.length ? Math.min(...known) : 100;
        const status = minPct < 15 ? 'critical' : minPct < 40 ? 'warning' : 'normal';

        return {
          cliId: 'codex',
          cliName: 'Codex',
          model,
          effort,
          planType,
          ...sessionUsage,
          fiveHourPercent,
          fiveHourResetsIn,
          sevenDayPercent,
          sevenDayResetsOn,
          lastUpdated: Date.now(),
          status,
        };
      }

      return {
        cliId: 'codex',
        cliName: 'Codex',
        model,
        effort,
        planType,
        ...sessionUsage,
        fiveHourPercent: unknownPct,
        fiveHourResetsIn: '--',
        sevenDayPercent: unknownPct,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
        message: isAccount ? t('该账号暂无额度记录') : undefined,
      };
    } catch (err: any) {
      console.warn('[QuotaService] Error parsing Codex sessions:', err.message);
      return this.quotasCache[key];
    }
  }

  private codexTailCache = new Map<string, {
    mtimeMs: number; size: number; usage?: SessionTokenUsage; rateLimits: any;
    context: { model?: string; effort?: string; at: number } | null;
    isSubagent: boolean;
  }>();

  private async readCodexTail(file: string, mtimeMs: number, size: number) {
    const cached = this.codexTailCache.get(file);
    if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
      this.codexTailCache.delete(file);
      this.codexTailCache.set(file, cached);
      return cached;
    }
    const result: NonNullable<typeof cached> = { mtimeMs, size, rateLimits: null, context: null, isSubagent: false };
    const handle = await fs.promises.open(file, 'r');
    let content: string;
    try {
      const length = Math.min(size, 256 * 1024);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, size - length);
      content = buffer.subarray(0, bytesRead).toString('utf8');
    } finally { await handle.close(); }
    for (const line of content.split('\n').reverse()) {
      if (!line.includes('"turn_context"') && !line.includes('"rate_limits"') && !line.includes('"total_token_usage"')) continue;
      try {
        const parsed = JSON.parse(line);
        if (line.includes('"turn_context"') && parsed?.payload?.model) {
          if (parsed.payload.model === 'codex-auto-review') {
            result.isSubagent = true;
          } else if (!result.context) {
            result.context = { model: parsed.payload.model, effort: typeof parsed.payload.effort === 'string' ? parsed.payload.effort : undefined, at: Date.parse(parsed.timestamp) || mtimeMs };
          }
        }
        const limits = parsed?.payload?.rate_limits;
        if (!result.rateLimits && limits && (limits.primary || limits.secondary)) result.rateLimits = limits;
        const info = parsed?.payload?.info;
        const total = info?.total_token_usage;
        if (!result.usage && total && typeof total.total_tokens === 'number') {
          const rawIn = cleanNonNeg(total.input_tokens);
          const cachedIn = cleanNonNeg(total.cached_input_tokens);
          const cacheWrite = cleanNonNeg(total.cache_write_input_tokens);
          const out = cleanNonNeg(total.output_tokens);
          const uncachedIn = Math.max(0, rawIn - cachedIn);
          const lastIn = typeof info?.last_token_usage?.input_tokens === 'number' ? info.last_token_usage.input_tokens : undefined;
          const ctxWindow = typeof info?.model_context_window === 'number' && info.model_context_window > 0 ? info.model_context_window : undefined;
          const usage = computeSessionUsage({
            input: uncachedIn,
            output: out,
            cacheRead: cachedIn,
            cacheWrite,
            lastCtxTokens: lastIn,
            ctxWindow,
          });
          if (total.total_tokens > 0) usage.tokens = total.total_tokens;
          result.usage = usage;
        }
      } catch {}
    }
    setBoundedMap(this.codexTailCache, file, result, 50);
    return result;
  }

  private claudeTokenCache: {
    file: string;
    offset: number;
    pending: Buffer;
    perMessage: Map<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    lastCtxTokens?: number;
  } | null = null;
  private claudeLastRateLimits: any = null;

  /**
   * 累计 Claude Code 会话 token：快照里的 context_window 只是当前上下文大小，累计值要从会话记录算。
   * 同一条 assistant 消息会按内容块写成多行（usage 相同或递增），按 message.id + requestId 去重并以最后一行为准。
   * 只统计主会话记录，不含子代理的独立记录；会话文件只追加，按偏移增量读取并分片，避免大文件一次读入。
   */
  private claudeTokenPending: Promise<SessionTokenUsage | undefined> | null = null;

  private toClaudeSessionUsage(cache: NonNullable<QuotaService['claudeTokenCache']>): SessionTokenUsage | undefined {
    if (cache.perMessage.size === 0) return undefined;
    return computeSessionUsage({
      input: cache.input,
      output: cache.output,
      cacheRead: cache.cacheRead,
      cacheWrite: cache.cacheWrite,
      lastCtxTokens: cache.lastCtxTokens,
    });
  }

  private readClaudeSessionTokens(file: string): Promise<SessionTokenUsage | undefined> {
    if (this.claudeTokenPending) {
      return this.claudeTokenPending.then(() => (this.claudeTokenCache?.file === file
        ? this.toClaudeSessionUsage(this.claudeTokenCache)
        : this.readClaudeSessionTokens(file)));
    }
    this.claudeTokenPending = this.loadClaudeSessionTokens(file).finally(() => { this.claudeTokenPending = null; });
    return this.claudeTokenPending;
  }

  private async loadClaudeSessionTokens(file: string): Promise<SessionTokenUsage | undefined> {
    try {
      const size = (await fs.promises.stat(file)).size;
      let cache = this.claudeTokenCache;
      if (!cache || cache.file !== file || size < cache.offset) {
        cache = {
          file,
          offset: 0,
          pending: Buffer.alloc(0),
          perMessage: new Map(),
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        };
        this.claudeTokenCache = cache;
      }
      const SLICE = 1024 * 1024;
      const fd = await fs.promises.open(file, 'r');
      try {
        while (cache.offset < size) {
          const chunk = Buffer.alloc(Math.min(SLICE, size - cache.offset));
          const { bytesRead: read } = await fd.read(chunk, 0, chunk.length, cache.offset);
          if (read <= 0) break;
          cache.offset += read;
          const data = Buffer.concat([cache.pending, chunk.subarray(0, read)]);
          const lastNewline = data.lastIndexOf(0x0a);
          cache.pending = lastNewline < 0 ? data : data.subarray(lastNewline + 1);
          if (lastNewline < 0) continue;
          for (const line of data.subarray(0, lastNewline).toString('utf8').split('\n')) {
            if (!line.includes('"type":"assistant"') || !line.includes('"usage"')) continue;
            try {
              const e = JSON.parse(line);
              const u = e.message?.usage;
              if (e.type !== 'assistant' || !u) continue;
              const inp = cleanNonNeg(u.input_tokens);
              const out = cleanNonNeg(u.output_tokens);
              const cr = cleanNonNeg(u.cache_read_input_tokens);
              const cw = cleanNonNeg(u.cache_creation_input_tokens);
              const key = `${e.message?.id ?? e.uuid}:${e.requestId ?? ''}`;
              const prevMsg = cache.perMessage.get(key);
              if (prevMsg) {
                cache.input -= prevMsg.input;
                cache.output -= prevMsg.output;
                cache.cacheRead -= prevMsg.cacheRead;
                cache.cacheWrite -= prevMsg.cacheWrite;
              }
              cache.input += inp;
              cache.output += out;
              cache.cacheRead += cr;
              cache.cacheWrite += cw;
              cache.perMessage.set(key, { input: inp, output: out, cacheRead: cr, cacheWrite: cw });
              const ctx = inp + cr + cw;
              if (ctx > 0) cache.lastCtxTokens = ctx;
            } catch {}
          }
        }
      } finally {
        await fd.close();
      }
      return this.toClaudeSessionUsage(cache);
    } catch {
      return undefined;
    }
  }

  /** configDir 缺省为默认账号；非默认账号只显示模型与推理等级，额度来自共用的 statusLine 快照，无法区分账号，故显示「--」 */
  private async fetchClaudeQuota(configDir?: string): Promise<QuotaData> {
    const { model, effort } = await this.getClaudeInfo(configDir);
    const base: QuotaData = {
      cliId: 'claude',
      cliName: 'Claude Code',
      model,
      effort,
      fiveHourPercent: -1,
      fiveHourResetsIn: '--',
      sevenDayPercent: -1,
      sevenDayResetsOn: '--',
      lastUpdated: Date.now(),
      status: 'normal',
    };

    if (configDir) return { ...base, message: t('非默认账号暂无额度数据') };

    // 额度来源：~/.claude/oneai-statusline.js 通过 Claude Code statusLine 写入的快照
    let data: any;
    try {
      data = JSON.parse(await fs.promises.readFile(CLAUDE_STATUS_FILE, 'utf8'));
    } catch {
      return { ...base, message: t('等待 Claude Code 会话数据') };
    }

    if (data.rate_limits && (data.rate_limits.five_hour || data.rate_limits.seven_day)) {
      this.claudeLastRateLimits = data.rate_limits;
    }
    const rl = (data.rate_limits && (data.rate_limits.five_hour || data.rate_limits.seven_day) ? data.rate_limits : this.claudeLastRateLimits) || {};
    const now = Date.now();
    const calc = (w: any): { pct: number; resetMs?: number } => {
      if (!w || typeof w.used_percentage !== 'number') return { pct: -1 };
      const resetMs = w.resets_at ? w.resets_at * 1000 : undefined;
      // 窗口已过期说明已重置
      if (resetMs && resetMs < now) return { pct: 100 };
      return { pct: Math.max(0, Math.min(100, Math.round(100 - w.used_percentage))), resetMs };
    };
    const five = calc(rl.five_hour);
    const seven = calc(rl.seven_day);
    const sessionUsage = typeof data.transcript_path === 'string' ? await this.readClaudeSessionTokens(data.transcript_path) : undefined;

    const cw = data.context_window;
    const ctxWindow = typeof cw?.context_window_size === 'number' && cw.context_window_size > 0 ? cw.context_window_size : undefined;
    const curUsage = cw?.current_usage;
    const statusCtxTokens = curUsage && typeof curUsage === 'object'
      ? cleanNonNeg(curUsage.input_tokens) + cleanNonNeg(curUsage.cache_read_input_tokens) + cleanNonNeg(curUsage.cache_creation_input_tokens)
      : undefined;
    const ctxTokens = statusCtxTokens ?? sessionUsage?.ctxTokens;
    const explicitCtxPct = typeof cw?.used_percentage === 'number' && Number.isFinite(cw.used_percentage) ? cw.used_percentage : undefined;
    const ctxPctFromCalc = explicitCtxPct !== undefined
      ? explicitCtxPct
      : (ctxTokens !== undefined && ctxWindow !== undefined
        ? (ctxTokens / ctxWindow) * 100
        : (ctxWindow !== undefined ? 0 : undefined));
    const ctxPercent = ctxPctFromCalc !== undefined ? Math.max(0, Math.min(100, Math.round(ctxPctFromCalc))) : undefined;
    const known = [five.pct, seven.pct].filter((p) => p >= 0);
    const minPct = known.length ? Math.min(...known) : 100;
    const status = minPct < 15 ? 'critical' : minPct < 40 ? 'warning' : 'normal';

    return {
      ...base,
      ...sessionUsage,
      ...(ctxPercent !== undefined ? { ctxPercent } : {}),
      ...(ctxTokens !== undefined ? { ctxTokens } : {}),
      ...(ctxWindow !== undefined ? { ctxWindow } : {}),
      costUsd: typeof data.cost?.total_cost_usd === 'number' ? data.cost.total_cost_usd : undefined,
      fiveHourPercent: five.pct,
      fiveHourResetsIn: five.resetMs ? formatDuration(five.resetMs - now) : '--',
      sevenDayPercent: seven.pct,
      sevenDayResetsOn: seven.resetMs ? formatResetDay(seven.resetMs) : '--',
      status,
    };
  }

  private async fetchOpenCodeQuota(): Promise<QuotaData> {
    const opencodeInfo = await this.getOpenCodeInfo();
    return {
      cliId: 'opencode',
      cliName: 'OpenCode',
      model: opencodeInfo.model,
      effort: opencodeInfo.effort,
      fiveHourPercent: -1,
      fiveHourResetsIn: '--',
      sevenDayPercent: -1,
      sevenDayResetsOn: '--',
      lastUpdated: Date.now(),
      status: 'normal',
      message: t('无额度接口'),
    };
  }

  // pi 是通用客户端，没有 5h / 7d 额度，展示当前模型与会话累计用量 / 上下文占用。
  private async fetchPiQuota(): Promise<QuotaData> {
    const { model, effort, ctxWindow, session } = await this.readPiDetails();
    const sessionUsage = session.hasUsage
      ? computeSessionUsage({
        input: session.input,
        output: session.output,
        cacheRead: session.cacheRead,
        cacheWrite: session.cacheWrite,
        lastCtxTokens: session.lastCtxTokens,
        ctxWindow,
        costUsd: session.costUsd > 0 ? session.costUsd : undefined,
      })
      : undefined;
    return {
      cliId: 'pi',
      cliName: 'Pi',
      model,
      effort,
      ...sessionUsage,
      fiveHourPercent: -1,
      fiveHourResetsIn: '--',
      sevenDayPercent: -1,
      sevenDayResetsOn: '--',
      lastUpdated: Date.now(),
      status: 'normal',
      message: t('无额度接口'),
    };
  }

  private agySessionCache: {
    file: string;
    offset: number;
    pending: Buffer;
    input: number;
    output: number;
    cacheRead: number;
    lastCtxTokens?: number;
    hasData: boolean;
  } | null = null;
  private agySessionPending: Promise<SessionTokenUsage | undefined> | null = null;

  private toAgySessionUsage(cache: NonNullable<QuotaService['agySessionCache']>): SessionTokenUsage | undefined {
    if (!cache.hasData) return undefined;
    return computeSessionUsage({
      input: cache.input,
      output: cache.output,
      cacheRead: cache.cacheRead,
      lastCtxTokens: cache.lastCtxTokens,
    });
  }

  private readAgySessionUsage(): Promise<SessionTokenUsage | undefined> {
    if (!this.agySessionPending) {
      this.agySessionPending = this.loadAgySessionUsage().finally(() => { this.agySessionPending = null; });
    }
    return this.agySessionPending;
  }

  private async loadAgySessionUsage(): Promise<SessionTokenUsage | undefined> {
    try {
      const dirs = await fs.promises.readdir(AGY_BRAIN_DIR, { withFileTypes: true });
      const candidates = await Promise.all(dirs.filter((d) => d.isDirectory()).map(async (d) => {
        const logsDir = path.join(AGY_BRAIN_DIR, d.name, '.system_generated', 'logs');
        for (const name of ['transcript.jsonl', 'transcript_full.jsonl']) {
          const file = path.join(logsDir, name);
          try {
            const stat = await fs.promises.stat(file);
            return { file, mtime: stat.mtimeMs, size: stat.size };
          } catch {}
        }
        return null;
      }));
      let latest: { file: string; mtime: number; size: number } | null = null;
      for (const item of candidates) {
        if (item && (!latest || item.mtime > latest.mtime)) latest = item;
      }
      if (!latest) return undefined;

      let cache = this.agySessionCache;
      if (!cache || cache.file !== latest.file || latest.size < cache.offset) {
        cache = {
          file: latest.file,
          offset: 0,
          pending: Buffer.alloc(0),
          input: 0,
          output: 0,
          cacheRead: 0,
          hasData: false,
        };
        this.agySessionCache = cache;
      }
      if (latest.size > cache.offset) {
        const SLICE = 512 * 1024;
        const fd = await fs.promises.open(latest.file, 'r');
        try {
          while (cache.offset < latest.size) {
            const chunk = Buffer.alloc(Math.min(SLICE, latest.size - cache.offset));
            const { bytesRead: read } = await fd.read(chunk, 0, chunk.length, cache.offset);
            if (read <= 0) break;
            cache.offset += read;
            const data = Buffer.concat([cache.pending, chunk.subarray(0, read)]);
            const lastNewline = data.lastIndexOf(0x0a);
            cache.pending = lastNewline < 0 ? data : data.subarray(lastNewline + 1);
            if (lastNewline < 0) continue;
            for (const line of data.subarray(0, lastNewline).toString('utf8').split('\n')) {
              if (!line.includes('"PLANNER_RESPONSE"')) continue;
              try {
                const e = JSON.parse(line);
                if (e.type !== 'PLANNER_RESPONSE') continue;
                const inp = cleanNonNeg(e.input_tokens);
                const out = cleanNonNeg(e.output_tokens);
                const cr = cleanNonNeg(e.cache_read_tokens);
                if (inp + out + cr > 0) {
                  cache.hasData = true;
                  cache.input += inp;
                  cache.output += out;
                  cache.cacheRead += cr;
                  cache.lastCtxTokens = inp + cr;
                }
              } catch {}
            }
          }
        } finally {
          await fd.close();
        }
      }
      return this.toAgySessionUsage(cache);
    } catch {
      return undefined;
    }
  }

  /**
   * 通过 `agy -p /usage` 读取额度：输出为制表符分隔的「分组 / 窗口 / 剩余百分比 / 重置时间(UTC)」，
   * 不读取 agy 的凭据。单次约 5 秒，仅在当前活动任务为 agy 或手动刷新时按 TTL 调用，避免后台空闲时无谓拉起子进程。
   */
  private async fetchAgyQuota(forceUsage = false): Promise<QuotaData> {
    const prev = this.quotasCache['agy'];
    const now = Date.now();
    const shouldRunUsage = forceUsage || this.activeCliId === 'agy';
    const [agyInfo, freshUsage] = await Promise.all([
      this.getAgyInfo(),
      shouldRunUsage ? this.readAgySessionUsage() : Promise.resolve(undefined),
    ]);
    const pickPrevUsage = (q?: QuotaData): SessionTokenUsage | undefined => {
      if (!q) return undefined;
      const u: SessionTokenUsage = {};
      if (q.tokens !== undefined) u.tokens = q.tokens;
      if (q.tokenInput !== undefined) u.tokenInput = q.tokenInput;
      if (q.tokenOutput !== undefined) u.tokenOutput = q.tokenOutput;
      if (q.tokenCache !== undefined) u.tokenCache = q.tokenCache;
      if (q.cacheHitPercent !== undefined) u.cacheHitPercent = q.cacheHitPercent;
      if (q.ctxPercent !== undefined) u.ctxPercent = q.ctxPercent;
      if (q.ctxTokens !== undefined) u.ctxTokens = q.ctxTokens;
      if (q.ctxWindow !== undefined) u.ctxWindow = q.ctxWindow;
      if (q.costUsd !== undefined) u.costUsd = q.costUsd;
      return u;
    };
    const sessionUsage = shouldRunUsage ? freshUsage : pickPrevUsage(prev);
    const base = {
      cliId: 'agy',
      cliName: 'Antigravity',
      model: agyInfo.model,
      effort: agyInfo.effort,
      ...sessionUsage,
    };
    if (shouldRunUsage && !this.agyMissing && (this.agyUsageRaw === null || now - this.agyUsageAt >= this.AGY_USAGE_TTL_MS)) {
      if (!this.agyUsagePending) {
        this.agyUsagePending = this.runAgyUsage()
          .then((raw) => {
            this.agyUsageRaw = raw;
            this.agyUsageError = '';
          })
          .catch((err: Error & { code?: string }) => {
            if (err.code === 'ENOENT' || /ENOENT/i.test(err.message)) this.agyMissing = true;
            this.agyUsageError = err.message;
          })
          .finally(() => {
            this.agyUsageAt = Date.now();
            this.agyUsagePending = null;
          });
      }
      await this.agyUsagePending;
    }

    if (this.agyUsageRaw === null) {
      return {
        ...base,
        fiveHourPercent: -1,
        fiveHourResetsIn: '--',
        sevenDayPercent: -1,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
        message: this.agyUsageError
          ? t('额度读取失败：{reason}', { reason: this.agyUsageError })
          : (shouldRunUsage ? t('额度读取中') : t('无额度接口')),
      };
    }

    const currentNow = Date.now();
    const { five, seven } = parseAgyUsage(this.agyUsageRaw, agyInfo.rawModel, currentNow);
    const quotaGroups: QuotaGroupSnapshot[] = parseAgyUsageGroups(this.agyUsageRaw, currentNow).map((g) => {
      const fiveDiff = g.five.resetMs - currentNow;
      return {
        group: g.group,
        fiveHourPercent: g.five.pct,
        fiveHourResetsIn: g.five.pct < 0 ? '--' : fiveDiff > 0 ? formatDuration(fiveDiff) : t('已就绪'),
        sevenDayPercent: g.seven.pct,
        sevenDayResetsOn: g.seven.pct < 0 ? '--' : g.seven.resetMs ? formatResetDay(g.seven.resetMs) : t('近期重置'),
      };
    });
    const known = [five.pct, seven.pct].filter((x) => x >= 0);
    const minPct = known.length ? Math.min(...known) : 100;
    const fiveReset = five.resetMs - currentNow;

    return {
      ...base,
      planType: prev?.planType,
      fiveHourPercent: five.pct,
      fiveHourResetsIn: five.pct < 0 ? '--' : fiveReset > 0 ? formatDuration(fiveReset) : t('已就绪'),
      sevenDayPercent: seven.pct,
      sevenDayResetsOn: seven.pct < 0 ? '--' : seven.resetMs ? formatResetDay(seven.resetMs) : t('近期重置'),
      quotaGroups: quotaGroups.length > 0 ? quotaGroups : undefined,
      lastUpdated: this.agyUsageAt,
      status: minPct < 15 ? 'critical' : minPct < 40 ? 'warning' : 'normal',
      message: this.agyUsageError ? t('额度刷新失败：{reason}', { reason: this.agyUsageError }) : undefined,
    };
  }

  private async runAgyUsage(): Promise<string> {
    const local = path.join(os.homedir(), '.local', 'bin', 'agy.exe');
    const bin = await exists(local) ? local : 'agy';
    return new Promise((resolve, reject) => {
      execFile(bin, ['-p', '/usage'], { cwd: os.homedir(), windowsHide: true, timeout: 30000 }, (err, stdout) => {
        if (err) {
          const wrapped = new Error(err.message.split('\n')[0]) as Error & { code?: string };
          wrapped.code = (err as NodeJS.ErrnoException).code;
          return reject(wrapped);
        }
        if (!stdout.includes('\t')) return reject(new Error(t('输出中没有额度数据')));
        resolve(stdout);
      });
    });
  }

  private async fetchGrokQuota(): Promise<QuotaData> {
    try {
      const grokInfo = await this.getGrokInfo();
      const hasApiKey = !!(process.env.XAI_API_KEY || process.env.GROK_API_KEY);
      const xaiDir = path.join(os.homedir(), '.xai');
      const grokDir = path.join(os.homedir(), '.grok');
      const hasConfig = await exists(xaiDir) || await exists(grokDir);

      return {
        cliId: 'grok',
        cliName: 'Grok Build',
        model: grokInfo.model,
        effort: grokInfo.effort,
        planType: 'xAI Premium',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: hasApiKey || hasConfig ? 'normal' : 'normal',
        message: hasApiKey ? 'API Key Active' : 'Ready',
      };
    } catch {
      return this.quotasCache['grok'];
    }
  }

  private broadcast() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('quota:update', this.quotasCache);
    }
  }
}

export const quotaService = new QuotaService();
