import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { Decompress as ZstdDecompress } from 'fzstd';
import { quotaService } from './quota-service';
import { formatClaudeModel } from './model-format';
import { isAccountCli, resolveConfigDir } from './account-env';
import { normalizePathKey } from './fs-utils';
import { estimateModelCostUsd } from './model-pricing';
import type {
  DashboardDailyRecord,
  DashboardProjectInfo,
  DashboardSessionMeta,
  DashboardStats,
  UsageAccountInfo,
  UsageAccountRef,
  UsageCli,
  UsageDay,
  UsageRow,
  UsageStats,
} from '../shared/types';
import { t } from './i18n';

export type { DashboardStats, UsageAccountInfo, UsageAccountRef, UsageCli, UsageDay, UsageRow, UsageStats };

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
  costUsd?: number;   // 仅 Pi 等原生带单次费用的日志填充
}

interface ParsedFile {
  cwd?: string;
  sessionId?: string;
  entries: Entry[];
}

interface FileSource {
  cliId: UsageCli;
  accountId: string;
  accountName: string;
  file: string;
  /** 取不到模型名时的兜底 */
  fallbackModel: () => string;
}

const home = os.homedir();
const AGY_ROOT = path.join(home, '.gemini', 'antigravity-cli');
const PI_SESSIONS = path.join(home, '.pi', 'agent', 'sessions');

// 单个会话文件的解析结果，按 mtime + 大小判断是否过期；持久化到 userData 下避免重启后重复解压全部历史归档会话
type CachedFile = ParsedFile & { mtimeMs: number; size: number };
const fileCache = new Map<string, CachedFile>();
const PARSE_CONCURRENCY = 6;
// Separate cache files avoid serializing every session when one active log changes.
const pendingCacheWrites = new Map<string, CachedFile>();
let writingCache = false;

function usageCachePath(file: string): string | null {
  try {
    if (!app?.isReady?.()) return null;
    const key = createHash('sha256').update(normalizePathKey(file)).digest('hex');
    return path.join(app.getPath('userData'), 'usage-cache-v6', `${key}.jsonl`);
  } catch { return null; }
}

export async function readDiskCache(file: string, stat: fs.Stats): Promise<CachedFile | undefined> {
  const cacheFile = usageCachePath(file);
  if (!cacheFile) return;
  let header: Omit<CachedFile, 'entries'> | undefined;
  const entries: Entry[] = [];
  let complete = false;
  try {
    await readLines(cacheFile, (line) => {
      const item = JSON.parse(line);
      if (!header) {
        if (item.mtimeMs !== stat.mtimeMs || item.size !== stat.size) throw new Error('stale cache');
        header = item;
      } else if (item.complete === true) complete = item.count === entries.length;
      else {
        if (complete || typeof item.model !== 'string' || !['ts', 'input', 'output', 'cacheRead', 'cacheWrite'].every((key) => Number.isFinite(item[key]))) throw new Error('invalid cache');
        entries.push(item);
      }
    });
    if (header && complete) return { ...header, entries };
  } catch { /* Rebuild incomplete, stale or unreadable cache from the original log. */ }
}

export function scheduleSaveDiskCache(file: string, value: CachedFile): void {
  const cacheFile = usageCachePath(file);
  if (!cacheFile) return;
  pendingCacheWrites.set(cacheFile, value);
  if (writingCache) return;
  writingCache = true;
  void (async () => {
    try {
      while (pendingCacheWrites.size) {
        const [target, cached] = pendingCacheWrites.entries().next().value!;
        pendingCacheWrites.delete(target);
        let handle: fs.promises.FileHandle | undefined;
        try {
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          handle = await fs.promises.open(`${target}.tmp`, 'w');
          const { entries, ...header } = cached;
          await handle.writeFile(JSON.stringify(header) + '\n');
          for (let offset = 0; offset < entries.length; offset += 256) {
            await handle.writeFile(entries.slice(offset, offset + 256).map((entry) => JSON.stringify(entry)).join('\n') + '\n');
          }
          await handle.writeFile(JSON.stringify({ complete: true, count: entries.length }) + '\n');
          await handle.close();
          handle = undefined;
          await fs.promises.rename(`${target}.tmp`, target);
        } catch { /* Optional cache never prevents displaying statistics. */ }
        finally { await handle?.close().catch(() => {}); }
      }
    } finally { writingCache = false; }
  })();
}

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** 逐行读取会话文件；按游标切分避免大块或超长单行产生 O(N^2) 字符串切片拷贝 */
async function readLines(file: string, onLine: (line: string) => void): Promise<void> {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const feed = (chunk: Uint8Array) => {
    const str = decoder.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    const firstNl = str.indexOf('\n');
    if (firstNl < 0) {
      pending += str;
      return;
    }
    onLine(pending ? pending + str.slice(0, firstNl) : str.slice(0, firstNl));
    pending = '';
    let pos = firstNl + 1;
    let newline: number;
    while ((newline = str.indexOf('\n', pos)) >= 0) {
      onLine(str.slice(pos, newline));
      pos = newline + 1;
    }
    if (pos < str.length) pending = str.slice(pos);
  };
  const stream = fs.createReadStream(file);
  try {
    if (file.endsWith('.zst')) {
      const zstd = new ZstdDecompress((chunk) => feed(chunk));
      for await (const chunk of stream) zstd.push(chunk as Buffer);
      zstd.push(new Uint8Array(0), true);
    } else {
      for await (const chunk of stream) feed(chunk as Buffer);
    }
    pending += decoder.end();
    if (pending) onLine(pending);
  } finally {
    stream.destroy();
  }
}

async function listJsonl(dir: string): Promise<string[]> {
  let entries: fs.Dirent[];
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const plain = new Set(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl')).map((entry) => entry.name));
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
    // 同名的明文文件优先，避免同一会话被明文与压缩两份重复计数
    else if (entry.isFile() && entry.name.endsWith('.jsonl.zst') && !plain.has(entry.name.slice(0, -4))) files.push(full);
    else if (entry.isDirectory()) files.push(...await listJsonl(full));
  }
  return files;
}

// Claude Code：同一条 assistant 消息会按内容块写成多行，按 message.id + requestId 去重并以最后一行为准
async function parseClaude(file: string): Promise<ParsedFile> {
  const byKey = new Map<string, Entry>();
  let cwd: string | undefined;
  await readLines(file, (line) => {
    const wantCwd = !cwd && line.includes('"cwd"');
    const wantUsage = line.includes('"type":"assistant"') && line.includes('"usage"');
    if (!wantCwd && !wantUsage) return;
    try {
      const e = JSON.parse(line);
      if (!cwd && typeof e.cwd === 'string' && e.cwd.trim()) cwd = e.cwd.trim();
      if (!wantUsage) return;
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
  return { cwd, entries: [...byKey.values()] };
}

/** codex-auto-review 是 Codex 自动审查（guardian）子会话使用的内部模型 id，加上中文说明避免被误认为主模型 */
const AUTO_REVIEW_MODEL = 'codex-auto-review';
// 缓存里保留原始模型 id，显示名在汇总时按当前语言生成
const modelLabel = (model: string) => (model === AUTO_REVIEW_MODEL ? t('自动审查 (codex-auto-review)') : model);

// Codex：turn_context 给出模型，token_count 给出每次请求的用量；总量没有增长的重复事件不计；缺失模型时在汇总阶段代入实时默认模型
async function parseCodex(file: string): Promise<ParsedFile> {
  const entries: Entry[] = [];
  let cwd: string | undefined;
  let sessionId: string | undefined;
  let model = '';
  let lastTotal = -1;
  await readLines(file, (line) => {
    const isMeta = (!cwd || !sessionId) && line.includes('"session_meta"');
    const isContext = line.includes('"turn_context"');
    if (!isMeta && !isContext && !line.includes('"token_count"')) return;
    try {
      const e = JSON.parse(line);
      if (e.type === 'session_meta') {
        if (!cwd && typeof e.payload?.cwd === 'string' && e.payload.cwd.trim()) cwd = e.payload.cwd.trim();
        if (!sessionId && typeof e.payload?.id === 'string' && e.payload.id.trim()) sessionId = e.payload.id.trim();
        return;
      }
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
        model,
        input: Math.max(0, num(last.input_tokens) - cached),
        output: num(last.output_tokens),
        cacheRead: cached,
        cacheWrite: num(last.cache_write_input_tokens),
      });
    } catch { /* 忽略坏行 */ }
  });
  return { cwd, sessionId, entries };
}

// Antigravity：PLANNER_RESPONSE 步骤带 token；记录里没有模型字段，只能从 USER_INPUT 末尾的 <USER_SETTINGS_CHANGE> 块中跟踪。
// 必须先解析 JSON 并限定为 USER_INPUT 末尾的标签块，避免对话里读取/编辑源码或粘贴正则（如 (.+?)\\）时误匹配成模型名。
const AGY_MODEL_CHANGE = /^The user changed setting `Model Selection` from [^\r\n]+? to ([^\r\n]+?)\. No need to comment/m;
const VALID_AGY_MODEL = /^[A-Za-z0-9][A-Za-z0-9 ._:\/+-]*$/;

function stripEffort(model: string): string {
  return model.trim().replace(/\s*\([^)]*\)$/, '');
}

export function extractAgyModelChange(line: string): string | null {
  if (!line.includes('"USER_INPUT"') || !line.includes('Model Selection')) return null;
  let parsed: { type?: unknown; content?: unknown };
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (parsed.type !== 'USER_INPUT' || typeof parsed.content !== 'string') return null;
  const tagStart = parsed.content.lastIndexOf('<USER_SETTINGS_CHANGE>');
  if (tagStart < 0) return null;
  const tail = parsed.content.slice(tagStart);
  if (!/<\/USER_SETTINGS_CHANGE>\s*$/.test(tail)) return null;
  const closeIdx = tail.lastIndexOf('</USER_SETTINGS_CHANGE>');
  const body = tail.slice('<USER_SETTINGS_CHANGE>'.length, closeIdx);
  const changed = body.match(AGY_MODEL_CHANGE)?.[1]?.trim();
  if (!changed) return null;
  if (changed === 'None') return '';
  const stripped = stripEffort(changed);
  return VALID_AGY_MODEL.test(stripped) ? stripped : null;
}

async function parseAgy(file: string): Promise<ParsedFile> {
  const entries: Entry[] = [];
  let model = '';
  await readLines(file, (line) => {
    const changedModel = extractAgyModelChange(line);
    if (changedModel !== null) {
      model = changedModel;
      return;
    }
    if (!line.includes('"PLANNER_RESPONSE"') || !line.includes('"input_tokens"')) return;
    try {
      const e = JSON.parse(line);
      const ts = Date.parse(e.created_at);
      if (e.type !== 'PLANNER_RESPONSE' || !Number.isFinite(ts)) return;
      entries.push({
        ts,
        model,
        input: num(e.input_tokens),
        output: num(e.output_tokens),
        cacheRead: num(e.cache_read_tokens),
        cacheWrite: 0,
      });
    } catch { /* 忽略坏行 */ }
  });
  return { cwd: undefined, entries };
}

const DEFAULT_ACCOUNT = { id: 'default', get name() { return t('默认账号'); } };

interface DirAccount { dir: string; id: string; name: string }

/** 默认配置目录 + 各账号的独立配置目录；按目录去重，目录相同时默认账号优先（Windows 路径不区分大小写） */
function accountDirs(defaultDir: string, cliId: 'claude' | 'codex', accounts: UsageAccountRef[]): DirAccount[] {
  const result = new Map<string, DirAccount>([[normalizePathKey(defaultDir), { dir: defaultDir, ...DEFAULT_ACCOUNT }]]);
  for (const account of accounts) {
    if (account?.cliId !== cliId || typeof account.id !== 'string' || !account.id) continue;
    const dir = resolveConfigDir(account.configDir);
    if (!dir || result.has(normalizePathKey(dir))) continue;
    result.set(normalizePathKey(dir), { dir, id: account.id, name: typeof account.name === 'string' && account.name.trim() ? account.name.trim() : account.id });
  }
  return [...result.values()];
}

// Pi：每条 assistant 消息自带 provider / model / usage（输入为未命中缓存部分，与缓存读写、输出相加等于 totalTokens）；
// 出错的请求 usage 全为 0，没有消耗，不计入
async function parsePi(file: string): Promise<ParsedFile> {
  const entries: Entry[] = [];
  let cwd: string | undefined;
  await readLines(file, (line) => {
    const isSession = !cwd && line.includes('"type":"session"');
    const isUsage = line.includes('"role":"assistant"') && line.includes('"usage"');
    if (!isSession && !isUsage) return;
    try {
      const e = JSON.parse(line);
      if (e.type === 'session') {
        if (!cwd && typeof e.cwd === 'string' && e.cwd.trim()) cwd = e.cwd.trim();
        return;
      }
      const message = e.message;
      const usage = message?.usage;
      const ts = Date.parse(e.timestamp);
      if (e.type !== 'message' || message?.role !== 'assistant' || !usage || typeof message.model !== 'string' || !message.model || !Number.isFinite(ts)) return;
      const costTotal = typeof usage.cost?.total === 'number' && Number.isFinite(usage.cost.total) && usage.cost.total >= 0 ? usage.cost.total : undefined;
      const entry: Entry = {
        ts,
        model: message.model,
        input: num(usage.input),
        output: num(usage.output),
        cacheRead: num(usage.cacheRead),
        cacheWrite: num(usage.cacheWrite),
        ...(costTotal !== undefined ? { costUsd: costTotal } : {}),
      };
      if (entry.input + entry.output + entry.cacheRead + entry.cacheWrite === 0) return;
      entries.push(entry);
    } catch { /* 忽略坏行 */ }
  });
  return { cwd, entries };
}

/** 额度服务读取模型名是异步的：统计开始前并行扫描各 CLI 会话目录与默认模型，保持固定顺序以保证跨文件去重确定性 */
async function collectSources(accounts: UsageAccountRef[]): Promise<FileSource[]> {
  const valid = accounts.filter((account) => isAccountCli(account?.cliId));

  const claudePromise = Promise.all(
    accountDirs(path.join(home, '.claude'), 'claude', valid).map(async ({ dir, id, name }) => (
      (await listJsonl(path.join(dir, 'projects'))).map((file): FileSource => ({
        cliId: 'claude',
        accountId: id,
        accountName: name,
        file,
        fallbackModel: () => '',
      }))
    )),
  ).then((lists) => lists.flat());

  const codexPromise = Promise.all(
    accountDirs(path.join(home, '.codex'), 'codex', valid).map(async ({ dir, id, name }) => {
      const [info, sessionFiles, archivedFiles] = await Promise.all([
        quotaService.getCodexInfo(dir),
        listJsonl(path.join(dir, 'sessions')),
        listJsonl(path.join(dir, 'archived_sessions')),
      ]);
      const defaultModel = info.model || 'Auto';
      return [...sessionFiles, ...archivedFiles].map((file): FileSource => ({
        cliId: 'codex',
        accountId: id,
        accountName: name,
        file,
        fallbackModel: () => defaultModel,
      }));
    }),
  ).then((lists) => lists.flat());

  // Antigravity 的登录在系统凭据库，无法按目录区分，统一归默认账号；
  // 紧凑版 transcript.jsonl 完整保留所有顶层 token 字段与模型切换提示，体积远小于 transcript_full.jsonl，缺失时才回退
  const agyPromise = (async (): Promise<FileSource[]> => {
    const [agyInfo, conversations] = await Promise.all([
      quotaService.getAgyInfo(),
      fs.promises.readdir(path.join(AGY_ROOT, 'brain'), { withFileTypes: true }).catch((): fs.Dirent[] => []),
    ]);
    const agyFallback = stripEffort(agyInfo.model);
    return Promise.all(conversations.filter((entry) => entry.isDirectory()).map(async (entry): Promise<FileSource> => {
      const logsDir = path.join(AGY_ROOT, 'brain', entry.name, '.system_generated', 'logs');
      const compact = path.join(logsDir, 'transcript.jsonl');
      let file = compact;
      try { await fs.promises.access(compact); } catch { file = path.join(logsDir, 'transcript_full.jsonl'); }
      return {
        cliId: 'agy',
        accountId: DEFAULT_ACCOUNT.id,
        accountName: DEFAULT_ACCOUNT.name,
        file,
        fallbackModel: () => agyFallback,
      };
    }));
  })();

  // Pi 没有多账号，统一归默认账号
  const piPromise = listJsonl(PI_SESSIONS).then((files) => files.map((file): FileSource => ({
    cliId: 'pi',
    accountId: DEFAULT_ACCOUNT.id,
    accountName: DEFAULT_ACCOUNT.name,
    file,
    fallbackModel: () => '',
  })));

  const [claudeSources, codexSources, agySources, piSources] = await Promise.all([
    claudePromise,
    codexPromise,
    agyPromise,
    piPromise,
  ]);
  return [...claudeSources, ...codexSources, ...agySources, ...piSources];
}

async function loadEntries(source: FileSource, rangeStart: number): Promise<ParsedFile & { dirty: boolean }> {
  let stat: fs.Stats;
  try { stat = await fs.promises.stat(source.file); } catch { return { entries: [], dirty: false }; }
  if (rangeStart > 0 && stat.mtimeMs < rangeStart) {
    return { entries: [], dirty: false };
  }
  const cached = fileCache.get(source.file) ?? await readDiskCache(source.file, stat);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    fileCache.set(source.file, cached);
    return { cwd: cached.cwd, sessionId: cached.sessionId, entries: cached.entries, dirty: false };
  }
  let parsed: ParsedFile;
  try {
    parsed = source.cliId === 'claude' ? await parseClaude(source.file)
      : source.cliId === 'codex' ? await parseCodex(source.file)
        : source.cliId === 'pi' ? await parsePi(source.file)
          : await parseAgy(source.file);
  } catch { return { entries: [], dirty: false }; }
  const updated = { mtimeMs: stat.mtimeMs, size: stat.size, ...parsed };
  fileCache.set(source.file, updated);
  scheduleSaveDiskCache(source.file, updated);
  return { ...parsed, dirty: true };
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 所在周的周一 00:00（本地时间） */
function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

async function loadSourcesConcurrently(sources: FileSource[], rangeStart: number): Promise<ParsedFile[]> {
  const liveFiles = new Set(sources.map((source) => source.file));
  for (const file of fileCache.keys()) {
    if (!liveFiles.has(file)) {
      fileCache.delete(file);
    }
  }
  const loaded: ParsedFile[] = new Array(sources.length);
  let nextIdx = 0;
  const workerCount = Math.min(PARSE_CONCURRENCY, sources.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIdx < sources.length) {
      const i = nextIdx++;
      const { dirty: _dirty, ...parsed } = await loadEntries(sources[i], rangeStart);
      loaded[i] = parsed;
    }
  }));
  return loaded;
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
    days.set(dateKey(day), { date: dateKey(day), requests: 0, by: {} });
  }

  const sources = await collectSources(Array.isArray(accounts) ? accounts as UsageAccountRef[] : []);
  const rows = new Map<string, UsageRow>();
  const accountsSeen = new Map<string, UsageAccountInfo>();
  const seen = new Set<string>();
  const loaded = await loadSourcesConcurrently(sources, rangeStart);

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const sessionRows = new Set<UsageRow>();
    for (const entry of loaded[i].entries) {
      if (entry.ts < rangeStart || entry.ts >= rangeEnd.getTime()) continue;
      if (entry.key) {
        if (seen.has(entry.key)) continue;
        seen.add(entry.key);
      }
      const accountKey = `${source.cliId}:${source.accountId}`;
      if (!accountsSeen.has(accountKey)) accountsSeen.set(accountKey, { cliId: source.cliId, accountId: source.accountId, name: source.accountName });
      const day = days.get(dateKey(new Date(entry.ts)));
      if (day) {
        day.requests += 1;
        day.by[accountKey] = (day.by[accountKey] ?? 0) + 1;
      }
      if (entry.ts < weekStart) continue;
      const resolvedModel = entry.model || source.fallbackModel();
      const rowKey = `${accountKey}\t${resolvedModel}`;
      let row = rows.get(rowKey);
      if (!row) {
        row = { cliId: source.cliId, accountId: source.accountId, accountName: source.accountName, model: modelLabel(resolvedModel), ...(resolvedModel === AUTO_REVIEW_MODEL ? { subagent: true } : {}), requests: 0, sessions: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
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
    accounts: [...accountsSeen.values()],
    rows: [...rows.values()].sort((a, b) => total(b) - total(a) || b.requests - a.requests),
    days: [...days.values()],
  };
}

export interface DashboardBuildItem {
  sessionId?: string;
  cliId: UsageCli;
  accountId: string;
  accountName: string;
  cwd?: string;
  fallbackModel: string;
  entries: Entry[];
}

function projectNameOf(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/[\\/]+$/, '');
  if (!trimmed) return rawPath.trim();
  const sep = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  if (sep >= 0 && sep < trimmed.length - 1) return trimmed.slice(sep + 1);
  return trimmed;
}

/** 按会话与本地日期汇总 Dashboard 数据，供渲染进程在各时间范围与维度间即时过滤 */
export function buildDashboardStats(items: DashboardBuildItem[], now = Date.now()): DashboardStats {
  const seen = new Set<string>();
  const accountsSeen = new Map<string, UsageAccountInfo>();
  const projectsMap = new Map<string, DashboardProjectInfo>();
  const sessions: DashboardSessionMeta[] = [];
  const records: DashboardDailyRecord[] = [];
  let earliestDate: string | null = null;

  // The same Codex session can exist in both the active and archived directories.
  const codexCopies = new Map<string, number>();
  const duplicates = new Set<number>();
  for (const [index, item] of items.entries()) {
    if (item.cliId !== 'codex' || !item.sessionId) continue;
    const key = `${item.accountId}\t${item.sessionId}`;
    const previous = codexCopies.get(key);
    if (previous === undefined || item.entries.length > items[previous].entries.length) {
      if (previous !== undefined) duplicates.add(previous);
      codexCopies.set(key, index);
    } else {
      duplicates.add(index);
    }
  }

  for (const [index, item] of items.entries()) {
    if (duplicates.has(index)) continue;
    const buckets = new Map<string, {
      date: string;
      resolvedModel: string;
      requests: number;
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      costUsd: number;
      costPriced: boolean;
      pricedTokens: number;
    }>();

    for (const entry of item.entries) {
      if (!Number.isFinite(entry.ts) || entry.ts <= 0) continue;
      if (entry.key) {
        if (seen.has(entry.key)) continue;
        seen.add(entry.key);
      }
      const date = dateKey(new Date(entry.ts));
      if (!earliestDate || date < earliestDate) earliestDate = date;
      const resolvedModel = entry.model || item.fallbackModel;
      const key = `${date}\t${resolvedModel}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          date,
          resolvedModel,
          requests: 0,
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          costUsd: 0,
          costPriced: false,
          pricedTokens: 0,
        };
        buckets.set(key, bucket);
      }
      bucket.requests += 1;
      bucket.input += entry.input;
      bucket.output += entry.output;
      bucket.cacheRead += entry.cacheRead;
      bucket.cacheWrite += entry.cacheWrite;
      const cost = typeof entry.costUsd === 'number' && Number.isFinite(entry.costUsd) && entry.costUsd >= 0
        ? entry.costUsd
        : estimateModelCostUsd(resolvedModel, entry);
      if (cost !== null) {
        bucket.costUsd += cost;
        bucket.costPriced = true;
        bucket.pricedTokens += entry.input + entry.output + entry.cacheRead + entry.cacheWrite;
      }
    }

    if (buckets.size === 0) continue;
    const sessionId = sessions.length;
    const rawCwd = item.cwd?.trim() ?? '';
    const projectKey = rawCwd ? normalizePathKey(rawCwd) : '';
    const projectName = rawCwd ? projectNameOf(rawCwd) : '';
    if (projectKey && !projectsMap.has(projectKey)) {
      projectsMap.set(projectKey, { key: projectKey, path: rawCwd, name: projectName });
    }
    const accountKey = `${item.cliId}:${item.accountId}`;
    if (!accountsSeen.has(accountKey)) {
      accountsSeen.set(accountKey, { cliId: item.cliId, accountId: item.accountId, name: item.accountName });
    }
    sessions.push({
      id: sessionId,
      cliId: item.cliId,
      accountId: item.accountId,
      accountName: item.accountName,
      project: projectKey,
      projectPath: rawCwd,
      projectName,
    });

    for (const b of buckets.values()) {
      records.push({
        s: sessionId,
        date: b.date,
        model: modelLabel(b.resolvedModel),
        modelId: b.resolvedModel,
        ...(b.resolvedModel === AUTO_REVIEW_MODEL ? { subagent: true } : {}),
        requests: b.requests,
        input: b.input,
        output: b.output,
        cacheRead: b.cacheRead,
        cacheWrite: b.cacheWrite,
        costUsd: b.costUsd,
        costPriced: b.costPriced,
        pricedTokens: b.pricedTokens,
      });
    }
  }

  let timezone = 'Local';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
  } catch {}

  return {
    generatedAt: now,
    timezone,
    earliestDate,
    accounts: [...accountsSeen.values()],
    projects: [...projectsMap.values()].sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)),
    sessions,
    records,
  };
}

export async function getDashboardStats(accounts: unknown): Promise<DashboardStats> {
  const sources = await collectSources(Array.isArray(accounts) ? accounts as UsageAccountRef[] : []);
  const loaded = await loadSourcesConcurrently(sources, 0);
  const items: DashboardBuildItem[] = sources.map((source, i) => ({
    cliId: source.cliId,
    accountId: source.accountId,
    accountName: source.accountName,
    cwd: loaded[i].cwd,
    sessionId: loaded[i].sessionId,
    fallbackModel: source.fallbackModel(),
    entries: loaded[i].entries,
  }));
  return buildDashboardStats(items, Date.now());
}
