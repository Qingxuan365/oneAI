import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { formatClaudeModel, quotaService } from './quota-service';
import { isAccountCli, resolveConfigDir } from './account-env';

export type UsageCli = 'claude' | 'codex' | 'agy';

export interface UsageRow {
  cliId: UsageCli;
  model: string;
  requests: number;   // 请求数：一次模型回复算一次
  sessions: number;   // 本周内出现过该模型回复的会话数
  input: number;      // 未命中缓存的输入 tokens
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface UsageDay {
  date: string;       // 本地日期 YYYY-MM-DD
  requests: number;
  byCli: Partial<Record<UsageCli, number>>;
}

export interface UsageStats {
  generatedAt: number;
  weekStart: number;  // 本周周一 00:00（本地时间）的毫秒时间戳
  rows: UsageRow[];   // 本周各 CLI × 模型，按 tokens 降序
  days: UsageDay[];   // 周一对齐、连续的每日请求数，到本周周日为止
}

export interface UsageAccountRef { cliId: string; configDir: string }

/** 方块图覆盖的周数（含本周）；本机会话日志只保留一段时间，更早的天数记为 0 */
export const HEATMAP_WEEKS = 26;

interface Entry {
  key?: string;       // 跨文件去重键（Claude 恢复会话时会把旧消息复制进新文件）
  ts: number;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

interface FileSource {
  cliId: UsageCli;
  file: string;
  /** 取不到模型名时的兜底 */
  fallbackModel: () => string;
}

const home = os.homedir();
const AGY_ROOT = path.join(home, '.gemini', 'antigravity-cli');

// 单个会话文件的解析结果，按 mtime + 大小判断是否过期；会话文件只追加，未变化的文件不再重读
const fileCache = new Map<string, { mtimeMs: number; size: number; entries: Entry[] }>();

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

async function readLines(file: string, onLine: (line: string) => void): Promise<void> {
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) onLine(line);
  } finally {
    lines.close();
    stream.destroy();
  }
}

async function listJsonl(dir: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
    else if (entry.isDirectory()) files.push(...await listJsonl(full));
  }
  return files;
}

// Claude Code：同一条 assistant 消息会按内容块写成多行，按 message.id + requestId 去重并以最后一行为准
async function parseClaude(file: string): Promise<Entry[]> {
  const byKey = new Map<string, Entry>();
  await readLines(file, (line) => {
    if (!line.includes('"type":"assistant"') || !line.includes('"usage"')) return;
    try {
      const e = JSON.parse(line);
      const usage = e.message?.usage;
      const model = e.message?.model;
      const ts = Date.parse(e.timestamp);
      if (e.type !== 'assistant' || !usage || typeof model !== 'string' || model.startsWith('<') || !Number.isFinite(ts)) return;
      const key = `${e.message.id ?? e.uuid}:${e.requestId ?? ''}`;
      byKey.set(key, {
        key,
        ts,
        model: formatClaudeModel(model),
        input: num(usage.input_tokens),
        output: num(usage.output_tokens),
        cacheRead: num(usage.cache_read_input_tokens),
        cacheWrite: num(usage.cache_creation_input_tokens),
      });
    } catch { /* 忽略坏行 */ }
  });
  return [...byKey.values()];
}

// Codex：turn_context 给出模型，token_count 给出每次请求的用量；总量没有增长的重复事件不计
async function parseCodex(file: string, fallbackModel: () => string): Promise<Entry[]> {
  const entries: Entry[] = [];
  let model = '';
  let lastTotal = -1;
  await readLines(file, (line) => {
    const isContext = line.includes('"turn_context"');
    if (!isContext && !line.includes('"token_count"')) return;
    try {
      const e = JSON.parse(line);
      if (isContext && e.type === 'turn_context') {
        if (typeof e.payload?.model === 'string' && e.payload.model) model = e.payload.model;
        return;
      }
      if (e.type !== 'event_msg' || e.payload?.type !== 'token_count') return;
      const info = e.payload.info;
      const total = info?.total_token_usage?.total_tokens;
      const last = info?.last_token_usage;
      const ts = Date.parse(e.timestamp);
      if (!last || typeof total !== 'number' || total === lastTotal || !Number.isFinite(ts)) return;
      lastTotal = total;
      // OpenAI 口径：input_tokens 已含缓存命中部分，这里拆开，保证各项相加等于 total_tokens
      const cached = num(last.cached_input_tokens);
      entries.push({
        ts,
        model: model || fallbackModel(),
        input: Math.max(0, num(last.input_tokens) - cached),
        output: num(last.output_tokens),
        cacheRead: cached,
        cacheWrite: num(last.cache_write_input_tokens),
      });
    } catch { /* 忽略坏行 */ }
  });
  return entries;
}

// Antigravity：PLANNER_RESPONSE 步骤带 token；记录里没有模型字段，只能从「Model Selection 变更」提示中跟踪
const AGY_MODEL_CHANGE = /`Model Selection` from .+? to (.+?)\. No need/;

function stripEffort(model: string): string {
  return model.trim().replace(/\s*\([^)]*\)$/, '');
}

async function parseAgy(file: string, fallbackModel: () => string): Promise<Entry[]> {
  const entries: Entry[] = [];
  let model = '';
  await readLines(file, (line) => {
    if (line.includes('Model Selection')) {
      const changed = line.match(AGY_MODEL_CHANGE)?.[1];
      if (changed && changed !== 'None') model = stripEffort(changed);
    }
    if (!line.includes('"PLANNER_RESPONSE"') || !line.includes('"input_tokens"')) return;
    try {
      const e = JSON.parse(line);
      const ts = Date.parse(e.created_at);
      if (e.type !== 'PLANNER_RESPONSE' || !Number.isFinite(ts)) return;
      entries.push({
        ts,
        model: model || fallbackModel(),
        input: num(e.input_tokens),
        output: num(e.output_tokens),
        cacheRead: num(e.cache_read_tokens),
        cacheWrite: 0,
      });
    } catch { /* 忽略坏行 */ }
  });
  return entries;
}

async function collectSources(accounts: UsageAccountRef[]): Promise<FileSource[]> {
  // 默认账号 + 各账号的独立配置目录，按目录去重
  const claudeDirs = new Set([path.join(home, '.claude')]);
  const codexDirs = new Set([path.join(home, '.codex')]);
  for (const account of accounts) {
    if (!isAccountCli(account?.cliId)) continue;
    const dir = resolveConfigDir(account.configDir);
    if (!dir) continue;
    if (account.cliId === 'claude') claudeDirs.add(dir);
    else if (account.cliId === 'codex') codexDirs.add(dir);
  }

  const sources: FileSource[] = [];
  for (const dir of claudeDirs) {
    for (const file of await listJsonl(path.join(dir, 'projects'))) sources.push({ cliId: 'claude', file, fallbackModel: () => '' });
  }
  for (const dir of codexDirs) {
    for (const file of await listJsonl(path.join(dir, 'sessions'))) {
      sources.push({ cliId: 'codex', file, fallbackModel: () => quotaService.getCodexInfo(dir).model });
    }
  }
  let conversations: fs.Dirent[] = [];
  try { conversations = await fs.promises.readdir(path.join(AGY_ROOT, 'brain'), { withFileTypes: true }); } catch { /* 未安装 agy */ }
  for (const entry of conversations) {
    if (!entry.isDirectory()) continue;
    sources.push({
      cliId: 'agy',
      file: path.join(AGY_ROOT, 'brain', entry.name, '.system_generated', 'logs', 'transcript_full.jsonl'),
      fallbackModel: () => stripEffort(quotaService.getAgyInfo().model),
    });
  }
  return sources;
}

async function loadEntries(source: FileSource, rangeStart: number): Promise<Entry[]> {
  let stat: fs.Stats;
  try { stat = await fs.promises.stat(source.file); } catch { return []; }
  if (stat.mtimeMs < rangeStart) return [];
  const cached = fileCache.get(source.file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.entries;
  let entries: Entry[];
  try {
    entries = source.cliId === 'claude' ? await parseClaude(source.file)
      : source.cliId === 'codex' ? await parseCodex(source.file, source.fallbackModel)
        : await parseAgy(source.file, source.fallbackModel);
  } catch { return []; }
  fileCache.set(source.file, { mtimeMs: stat.mtimeMs, size: stat.size, entries });
  return entries;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 所在周的周一 00:00（本地时间） */
function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

export async function getUsageStats(accounts: unknown): Promise<UsageStats> {
  const now = new Date();
  const weekStartDate = mondayOf(now);
  const rangeStartDate = new Date(weekStartDate);
  rangeStartDate.setDate(rangeStartDate.getDate() - 7 * (HEATMAP_WEEKS - 1));
  const rangeEnd = new Date(weekStartDate);
  rangeEnd.setDate(rangeEnd.getDate() + 7);
  const weekStart = weekStartDate.getTime();
  const rangeStart = rangeStartDate.getTime();

  const days = new Map<string, UsageDay>();
  for (const day = new Date(rangeStartDate); day < rangeEnd; day.setDate(day.getDate() + 1)) {
    days.set(dateKey(day), { date: dateKey(day), requests: 0, byCli: {} });
  }

  const sources = await collectSources(Array.isArray(accounts) ? accounts as UsageAccountRef[] : []);
  const rows = new Map<string, UsageRow>();
  const seen = new Set<string>();
  // 只在会话文件的 mtime 落在统计范围内才读取；已读过且未变化的文件走缓存
  const liveFiles = new Set(sources.map((source) => source.file));
  for (const file of fileCache.keys()) if (!liveFiles.has(file)) fileCache.delete(file);

  for (const source of sources) {
    const sessionRows = new Set<UsageRow>();
    for (const entry of await loadEntries(source, rangeStart)) {
      if (entry.ts < rangeStart || entry.ts >= rangeEnd.getTime()) continue;
      if (entry.key) {
        if (seen.has(entry.key)) continue;
        seen.add(entry.key);
      }
      const day = days.get(dateKey(new Date(entry.ts)));
      if (day) {
        day.requests += 1;
        day.byCli[source.cliId] = (day.byCli[source.cliId] ?? 0) + 1;
      }
      if (entry.ts < weekStart) continue;
      const rowKey = `${source.cliId}\t${entry.model}`;
      let row = rows.get(rowKey);
      if (!row) {
        row = { cliId: source.cliId, model: entry.model, requests: 0, sessions: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
        rows.set(rowKey, row);
      }
      row.requests += 1;
      row.input += entry.input;
      row.output += entry.output;
      row.cacheRead += entry.cacheRead;
      row.cacheWrite += entry.cacheWrite;
      sessionRows.add(row);
    }
    for (const row of sessionRows) row.sessions += 1;
  }

  const total = (row: UsageRow) => row.input + row.output + row.cacheRead + row.cacheWrite;
  return {
    generatedAt: Date.now(),
    weekStart,
    rows: [...rows.values()].sort((a, b) => total(b) - total(a) || b.requests - a.requests),
    days: [...days.values()],
  };
}
