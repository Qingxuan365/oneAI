import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { Decompress as ZstdDecompress } from 'fzstd';
import { quotaService } from './quota-service';
import { formatClaudeModel } from './model-format';
import { isAccountCli, resolveConfigDir } from './account-env';
import { t } from './i18n';

export type UsageCli = 'claude' | 'codex' | 'agy' | 'pi';

export interface UsageRow {
  cliId: UsageCli;
  accountId: string;   // OneAI 账号 id；默认账号为 'default'
  accountName: string; // 账号名，默认账号为「默认账号」
  model: string;
  requests: number;   // 请求数：一次模型回复算一次
  sessions: number;   // 本周内出现过该模型回复的会话数
  subagent?: boolean; // CLI 自动发起的子会话（如 Codex 自动审查），不是用户选用的模型
  input: number;      // 未命中缓存的输入 tokens
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface UsageDay {
  date: string;       // 本地日期 YYYY-MM-DD
  requests: number;
  by: Record<string, number>; // 键为 `${cliId}:${accountId}`，值为当天该 CLI 账号的请求数
}

export interface UsageAccountInfo { cliId: UsageCli; accountId: string; name: string }

export interface UsageStats {
  generatedAt: number;
  weekStart: number;  // 本周周一 00:00（本地时间）的毫秒时间戳
  accounts: UsageAccountInfo[]; // 统计范围内出现过用量的 CLI 账号
  rows: UsageRow[];   // 本周各 CLI × 账号 × 模型，按 tokens 降序
  days: UsageDay[];   // 周一对齐、连续的每日请求数，到本周周日为止
}

export interface UsageAccountRef { id: string; name: string; cliId: string; configDir: string }

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
const fileCache = new Map<string, { mtimeMs: number; size: number; entries: Entry[] }>();
const PARSE_CONCURRENCY = 6;
let diskCacheLoaded = false;
let savingDiskCache = false;
let pendingDiskCacheSave = false;

function usageCachePath(): string | null {
  try {
    return app?.isReady?.() ? path.join(app.getPath('userData'), 'usage-cache-v1.json') : null;
  } catch {
    return null;
  }
}

const DISK_CACHE_VERSION = 3;

async function ensureDiskCacheLoaded(): Promise<void> {
  if (diskCacheLoaded) return;
  diskCacheLoaded = true;
  const cacheFile = usageCachePath();
  if (!cacheFile) return;
  try {
    const parsed = JSON.parse(await fs.promises.readFile(cacheFile, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.version === DISK_CACHE_VERSION && parsed.files && typeof parsed.files === 'object') {
      for (const [file, val] of Object.entries(parsed.files as Record<string, any>)) {
        if (val && typeof val.mtimeMs === 'number' && typeof val.size === 'number' && Array.isArray(val.entries)) {
          fileCache.set(file, { mtimeMs: val.mtimeMs, size: val.size, entries: val.entries });
        }
      }
    }
  } catch { /* 首次运行或缓存损坏时忽略，自动重建 */ }
}

function scheduleSaveDiskCache(): void {
  const cacheFile = usageCachePath();
  if (!cacheFile) return;
  if (savingDiskCache) {
    pendingDiskCacheSave = true;
    return;
  }
  savingDiskCache = true;
  void (async () => {
    try {
      do {
        pendingDiskCacheSave = false;
        const files: Record<string, { mtimeMs: number; size: number; entries: Entry[] }> = {};
        for (const [file, value] of fileCache) files[file] = value;
        const tmp = `${cacheFile}.tmp`;
        await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.promises.writeFile(tmp, JSON.stringify({ version: DISK_CACHE_VERSION, files }), 'utf8');
        await fs.promises.rename(tmp, cacheFile);
      } while (pendingDiskCacheSave);
    } catch { /* 缓存落盘失败不影响统计结果 */ } finally {
      savingDiskCache = false;
    }
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

/** codex-auto-review 是 Codex 自动审查（guardian）子会话使用的内部模型 id，加上中文说明避免被误认为主模型 */
const AUTO_REVIEW_MODEL = 'codex-auto-review';
// 缓存里保留原始模型 id，显示名在汇总时按当前语言生成
const modelLabel = (model: string) => (model === AUTO_REVIEW_MODEL ? t('自动审查 (codex-auto-review)') : model);

// Codex：turn_context 给出模型，token_count 给出每次请求的用量；总量没有增长的重复事件不计；缺失模型时在汇总阶段代入实时默认模型
async function parseCodex(file: string): Promise<Entry[]> {
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
        model,
        input: Math.max(0, num(last.input_tokens) - cached),
        output: num(last.output_tokens),
        cacheRead: cached,
        cacheWrite: num(last.cache_write_input_tokens),
      });
    } catch { /* 忽略坏行 */ }
  });
  return entries;
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

async function parseAgy(file: string): Promise<Entry[]> {
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
  return entries;
}

const DEFAULT_ACCOUNT = { id: 'default', get name() { return t('默认账号'); } };

interface DirAccount { dir: string; id: string; name: string }

/** 默认配置目录 + 各账号的独立配置目录；按目录去重，目录相同时默认账号优先（Windows 路径不区分大小写） */
function accountDirs(defaultDir: string, cliId: 'claude' | 'codex', accounts: UsageAccountRef[]): DirAccount[] {
  const keyOf = (dir: string) => (process.platform === 'win32' ? path.resolve(dir).toLowerCase() : path.resolve(dir));
  const result = new Map<string, DirAccount>([[keyOf(defaultDir), { dir: defaultDir, ...DEFAULT_ACCOUNT }]]);
  for (const account of accounts) {
    if (account?.cliId !== cliId || typeof account.id !== 'string' || !account.id) continue;
    const dir = resolveConfigDir(account.configDir);
    if (!dir || result.has(keyOf(dir))) continue;
    result.set(keyOf(dir), { dir, id: account.id, name: typeof account.name === 'string' && account.name.trim() ? account.name.trim() : account.id });
  }
  return [...result.values()];
}

// Pi：每条 assistant 消息自带 provider / model / usage（输入为未命中缓存部分，与缓存读写、输出相加等于 totalTokens）；
// 出错的请求 usage 全为 0，没有消耗，不计入
async function parsePi(file: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  await readLines(file, (line) => {
    if (!line.includes('"role":"assistant"') || !line.includes('"usage"')) return;
    try {
      const e = JSON.parse(line);
      const message = e.message;
      const usage = message?.usage;
      const ts = Date.parse(e.timestamp);
      if (e.type !== 'message' || message?.role !== 'assistant' || !usage || typeof message.model !== 'string' || !message.model || !Number.isFinite(ts)) return;
      const entry = {
        ts,
        model: message.model,
        input: num(usage.input),
        output: num(usage.output),
        cacheRead: num(usage.cacheRead),
        cacheWrite: num(usage.cacheWrite),
      };
      if (entry.input + entry.output + entry.cacheRead + entry.cacheWrite === 0) return;
      entries.push(entry);
    } catch { /* 忽略坏行 */ }
  });
  return entries;
}

/** 额度服务读取模型名是异步的：统计开始前先读出各 Codex 配置目录与 agy 的当前模型，作为缺少模型字段时的兜底 */
async function collectSources(accounts: UsageAccountRef[]): Promise<FileSource[]> {
  const codexModels = new Map<string, string>();
  const agyModel = (await quotaService.getAgyInfo()).model;
  const valid = accounts.filter((account) => isAccountCli(account?.cliId));
  const sources: FileSource[] = [];
  for (const { dir, id, name } of accountDirs(path.join(home, '.claude'), 'claude', valid)) {
    for (const file of await listJsonl(path.join(dir, 'projects'))) {
      sources.push({ cliId: 'claude', accountId: id, accountName: name, file, fallbackModel: () => '' });
    }
  }
  for (const { dir, id, name } of accountDirs(path.join(home, '.codex'), 'codex', valid)) {
    codexModels.set(dir, (await quotaService.getCodexInfo(dir)).model);
    // Codex 桌面应用的会话在 archived_sessions；sessions 里较新的主要是自动审查子会话，较旧的已压缩为 .zst
    for (const sub of ['sessions', 'archived_sessions']) {
      for (const file of await listJsonl(path.join(dir, sub))) {
        sources.push({ cliId: 'codex', accountId: id, accountName: name, file, fallbackModel: () => codexModels.get(dir) ?? 'Auto' });
      }
    }
  }
  // Antigravity 的登录在系统凭据库，无法按目录区分，统一归默认账号；
  // 紧凑版 transcript.jsonl 完整保留所有顶层 token 字段与模型切换提示，体积远小于 transcript_full.jsonl，缺失时才回退
  let conversations: fs.Dirent[] = [];
  try { conversations = await fs.promises.readdir(path.join(AGY_ROOT, 'brain'), { withFileTypes: true }); } catch { /* 未安装 agy */ }
  const agySources = await Promise.all(conversations.filter((entry) => entry.isDirectory()).map(async (entry): Promise<FileSource> => {
    const logsDir = path.join(AGY_ROOT, 'brain', entry.name, '.system_generated', 'logs');
    const compact = path.join(logsDir, 'transcript.jsonl');
    let file = compact;
    try { await fs.promises.access(compact); } catch { file = path.join(logsDir, 'transcript_full.jsonl'); }
    return {
      cliId: 'agy',
      accountId: DEFAULT_ACCOUNT.id,
      accountName: DEFAULT_ACCOUNT.name,
      file,
      fallbackModel: () => stripEffort(agyModel),
    };
  }));
  sources.push(...agySources);
  // Pi 没有多账号，统一归默认账号
  for (const file of await listJsonl(PI_SESSIONS)) {
    sources.push({ cliId: 'pi', accountId: DEFAULT_ACCOUNT.id, accountName: DEFAULT_ACCOUNT.name, file, fallbackModel: () => '' });
  }
  return sources;
}

async function loadEntries(source: FileSource, rangeStart: number): Promise<{ entries: Entry[]; dirty: boolean }> {
  let stat: fs.Stats;
  try { stat = await fs.promises.stat(source.file); } catch { return { entries: [], dirty: false }; }
  if (stat.mtimeMs < rangeStart) return { entries: [], dirty: false };
  const cached = fileCache.get(source.file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return { entries: cached.entries, dirty: false };
  let entries: Entry[];
  try {
    entries = source.cliId === 'claude' ? await parseClaude(source.file)
      : source.cliId === 'codex' ? await parseCodex(source.file)
        : source.cliId === 'pi' ? await parsePi(source.file)
          : await parseAgy(source.file);
  } catch { return { entries: [], dirty: false }; }
  fileCache.set(source.file, { mtimeMs: stat.mtimeMs, size: stat.size, entries });
  return { entries, dirty: true };
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
    days.set(dateKey(day), { date: dateKey(day), requests: 0, by: {} });
  }

  await ensureDiskCacheLoaded();
  const sources = await collectSources(Array.isArray(accounts) ? accounts as UsageAccountRef[] : []);
  const rows = new Map<string, UsageRow>();
  const accountsSeen = new Map<string, UsageAccountInfo>();
  const seen = new Set<string>();
  let cacheDirty = false;
  // 只在会话文件的 mtime 落在统计范围内才读取；已读过且未变化的文件走缓存
  const liveFiles = new Set(sources.map((source) => source.file));
  for (const file of fileCache.keys()) {
    if (!liveFiles.has(file)) {
      fileCache.delete(file);
      cacheDirty = true;
    }
  }

  // 有限并发读取解析，结果按原 sources 下标顺序汇总，保证跨文件去重键与顺序完全确定
  const loadedEntries: Entry[][] = new Array(sources.length);
  let nextIdx = 0;
  const workerCount = Math.min(PARSE_CONCURRENCY, sources.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIdx < sources.length) {
      const i = nextIdx++;
      const { entries, dirty } = await loadEntries(sources[i], rangeStart);
      loadedEntries[i] = entries;
      if (dirty) cacheDirty = true;
    }
  }));
  if (cacheDirty) scheduleSaveDiskCache();

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const sessionRows = new Set<UsageRow>();
    for (const entry of loadedEntries[i]) {
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
