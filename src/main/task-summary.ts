import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ipcMain } from 'electron';
import { resolveConfigDir } from './account-env';
import { normalizePathKey, readSlice, readZstHead, readZstTail, setBoundedMap } from './fs-utils';
import { folderKey } from '../shared/paths';
import type { TaskSummary } from '../shared/types';
import { quotaService } from './quota-service';

interface SummaryTask {
  id: string;
  cliId: 'claude' | 'codex' | 'kimi';
  cwd: string;
  createdAt: number;
  historyId?: string;
  configDir?: string;       // 多账号：该账号的配置目录（CLAUDE_CONFIG_DIR / CODEX_HOME / KIMI_CODE_HOME）
  includeUsage?: boolean;
}

interface SessionInfo {
  id: string;
  birth: number;            // 会话开始时间，用来判断它属于哪个任务
  lastPrompt: string | null;
  file?: string;
  stat?: fs.Stats;
}

const MAX_TASKS = 100;
const MAX_SESSIONS_PER_GROUP = 40;
const MAX_TEXT = 100;
const MAX_SUMMARY_CACHE = 800;
/** 任务创建时间是在 PTY 启动之后才记录的，CLI 不会更早生成会话文件；容差只用来兜住毫秒级的时钟与调度误差 */
const SKEW_MS = 2_000;

function clip(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_TEXT ? `${oneLine.slice(0, MAX_TEXT)}…` : oneLine;
}

// ---------- 按文件签名缓存解析结果（LRU 容量淘汰），轮询时只重新解析有变化的文件 ----------
const cache = new Map<string, { sig: string; value: unknown }>();
async function cached<T>(file: string, stat: fs.Stats, parse: () => Promise<T>): Promise<T> {
  const sig = `${stat.mtimeMs}:${stat.size}`;
  const hit = cache.get(file);
  if (hit && hit.sig === sig) {
    setBoundedMap(cache, file, hit, MAX_SUMMARY_CACHE);
    return hit.value as T;
  }
  const value = await parse();
  setBoundedMap(cache, file, { sig, value }, MAX_SUMMARY_CACHE);
  return value;
}

async function statOf(file: string): Promise<fs.Stats | null> {
  try { return await fs.promises.stat(file); } catch { return null; }
}

// ---------- Claude Code：<配置目录>/projects/<cwd 中非字母数字字符换成 ->/<会话 id>.jsonl ----------
/** 用户在 Claude 里真正输入的文字；命令标签、任务通知、中断提示、工具结果都不算 */
function claudeUserText(line: string): string | null {
  if (!line.includes('"type":"user"')) return null;
  let entry: any;
  try { entry = JSON.parse(line); } catch { return null; }
  if (entry.type !== 'user' || entry.isMeta || entry.isSidechain) return null;
  const content = entry.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) && !content.some((part: any) => part?.type === 'tool_result')
    ? content.find((part: any) => part?.type === 'text')?.text
    : null;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('<') || trimmed.startsWith('[Request interrupted') || trimmed.startsWith('Caveat:')) return null;
  return trimmed;
}

async function lastClaudePrompt(file: string, size: number): Promise<string | null> {
  for (const bytes of [256 * 1024, 2 * 1024 * 1024]) {
    const lines = (await readSlice(file, 'tail', bytes)).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const text = claudeUserText(lines[i]);
      if (text) return clip(text);
    }
    if (size <= bytes) return null;
  }
  return null;
}

const claudeDirectoryCache = new Map<string, { mtimeMs: number; names: string[] }>();

async function claudeSessions(home: string, cwd: string): Promise<SessionInfo[]> {
  const dir = path.join(home, 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
  let names: string[];
  try {
    const stat = await fs.promises.stat(dir);
    const hit = claudeDirectoryCache.get(dir);
    if (hit && hit.mtimeMs === stat.mtimeMs) {
      names = hit.names;
    } else {
      names = (await fs.promises.readdir(dir)).filter((name) => name.endsWith('.jsonl'));
      setBoundedMap(claudeDirectoryCache, dir, { mtimeMs: stat.mtimeMs, names }, 200);
    }
  } catch { claudeDirectoryCache.delete(dir); return []; }
  const stats = (await Promise.all(names.map(async (name) => ({ name, stat: await statOf(path.join(dir, name)) }))))
    .filter((item): item is { name: string; stat: fs.Stats } => item.stat !== null)
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .slice(0, MAX_SESSIONS_PER_GROUP);
  return Promise.all(stats.map(async ({ name, stat }): Promise<SessionInfo> => {
    const file = path.join(dir, name);
    const lastPrompt = await cached(file, stat, () => lastClaudePrompt(file, stat.size).catch(() => null));
    return { id: path.basename(name, '.jsonl'), birth: stat.birthtimeMs || stat.ctimeMs, lastPrompt };
  }));
}

// ---------- Codex：<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-*.jsonl（历史恢复时覆盖 archived_sessions 与 .jsonl.zst） ----------
async function lastCodexPrompt(file: string): Promise<string | null> {
  const tail = file.endsWith('.zst') ? await readZstTail(file, 256 * 1024) : await readSlice(file, 'tail', 256 * 1024);
  const lines = tail.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"user_message"')) continue;
    try {
      const entry = JSON.parse(lines[i]);
      const message = entry?.payload?.message;
      if (entry?.type === 'event_msg' && entry.payload?.type === 'user_message' && typeof message === 'string' && message.trim()) return clip(message);
    } catch { /* 被截断的行跳过 */ }
  }
  return null;
}

async function readCodexMeta(file: string, stat: fs.Stats): Promise<{ id: string; cwd: string; birth: number } | null> {
  return cached(`${file}#meta`, stat, async () => {
    try {
      const head = file.endsWith('.zst') ? await readZstHead(file, 32 * 1024) : await readSlice(file, 'head', 32 * 1024);
      const first = head.split('\n')[0];
      const payload = JSON.parse(first)?.payload;
      // source 不是字符串表示子代理（如审查），不是用户会话
      if (typeof payload?.source !== 'string') return null;
      return { id: String(payload.id), cwd: String(payload.cwd ?? ''), birth: Date.parse(payload.timestamp) || stat.birthtimeMs };
    } catch { return null; }
  });
}

async function listCodexArchiveOrOldFiles(dir: string, depth: number): Promise<string[]> {
  let entries: fs.Dirent[];
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const plainNames = new Set(entries.filter((e) => e.isFile() && e.name.endsWith('.jsonl')).map((e) => e.name));
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(full);
    else if (entry.isFile() && entry.name.endsWith('.jsonl.zst') && !plainNames.has(entry.name.slice(0, -4))) files.push(full);
    else if (entry.isDirectory() && depth > 0) files.push(...await listCodexArchiveOrOldFiles(full, depth - 1));
  }
  return files;
}

async function codexSessionsByFolder(
  home: string,
  targetFolders: ReadonlySet<string>,
  earliest: number,
  wantedHistoryIds: ReadonlySet<string>,
): Promise<Map<string, SessionInfo[]>> {
  const byFolder = new Map<string, SessionInfo[]>();
  if (targetFolders.size === 0) return byFolder;
  const foundIds = new Set<string>();
  const root = path.join(home, 'sessions');
  // 只看修改时间不早于最早任务创建时间的文件；按日期目录由新到旧，早于这个日期前一天的整个目录跳过
  const cutoffDay = new Date(earliest - 24 * 3600_000);
  const cutoff = new Date(cutoffDay.getFullYear(), cutoffDay.getMonth(), cutoffDay.getDate()).getTime();
  const files: string[] = [];
  const numericDirs = async (dir: string) => {
    try { return (await fs.promises.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory() && /^\d+$/.test(e.name)).map((e) => e.name).sort().reverse(); } catch { return []; }
  };
  for (const year of await numericDirs(root)) {
    for (const month of await numericDirs(path.join(root, year))) {
      for (const day of await numericDirs(path.join(root, year, month))) {
        if (new Date(Number(year), Number(month) - 1, Number(day)).getTime() < cutoff) continue;
        const dayDir = path.join(root, year, month, day);
        try { files.push(...(await fs.promises.readdir(dayDir)).filter((n) => n.endsWith('.jsonl')).map((n) => path.join(dayDir, n))); } catch { /* 跳过 */ }
      }
    }
  }
  const candidateFiles = files.slice(0, 200);
  const stats = await Promise.all(candidateFiles.map((file) => statOf(file)));
  for (let i = 0; i < candidateFiles.length; i++) {
    const file = candidateFiles[i];
    const stat = stats[i];
    if (!stat || stat.mtimeMs < earliest - SKEW_MS) continue;
    const meta = await readCodexMeta(file, stat);
    if (!meta) continue;
    const key = folderKey(meta.cwd);
    if (!targetFolders.has(key)) continue;
    const lastPrompt = await cached(file, stat, () => lastCodexPrompt(file).catch(() => null));
    const list = byFolder.get(key) ?? [];
    list.push({ id: meta.id, birth: meta.birth, lastPrompt, file, stat });
    byFolder.set(key, list);
    foundIds.add(meta.id);
  }

  // 从历史恢复的任务（带 historyId）：原会话文件的 mtime 早于恢复时刻 task.createdAt，或位于 archived_sessions / .jsonl.zst 中，定向补齐
  const missingIds = [...wantedHistoryIds].filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    const [allActive, allArchived] = await Promise.all([
      listCodexArchiveOrOldFiles(root, 4),
      listCodexArchiveOrOldFiles(path.join(home, 'archived_sessions'), 4),
    ]);
    const allCandidates = [...allActive, ...allArchived];
    // 优先匹配文件名包含会话 id 的 rollout 文件（O(1) 零额外读取）；未命中时再回退检查其余较新文件
    const nameMatched = allCandidates.filter((file) => {
      const base = path.basename(file);
      return missingIds.some((id) => base.includes(id));
    });
    const probeList = nameMatched.length > 0 ? nameMatched : allCandidates.slice(0, 120);
    const probeStats = await Promise.all(probeList.map((file) => statOf(file)));
    for (let i = 0; i < probeList.length; i++) {
      const file = probeList[i];
      const stat = probeStats[i];
      if (!stat) continue;
      const meta = await readCodexMeta(file, stat);
      if (!meta || !wantedHistoryIds.has(meta.id) || foundIds.has(meta.id)) continue;
      const key = folderKey(meta.cwd);
      if (!targetFolders.has(key)) continue;
      const lastPrompt = await cached(file, stat, () => lastCodexPrompt(file).catch(() => null));
      const list = byFolder.get(key) ?? [];
      list.push({ id: meta.id, birth: meta.birth, lastPrompt, file, stat });
      byFolder.set(key, list);
      foundIds.add(meta.id);
    }
  }

  for (const [key, list] of byFolder) {
    const pinned = list.filter((item) => wantedHistoryIds.has(item.id));
    const rest = list.filter((item) => !wantedHistoryIds.has(item.id)).sort((a, b) => b.birth - a.birth).slice(0, MAX_SESSIONS_PER_GROUP);
    byFolder.set(key, [...pinned, ...rest]);
  }
  return byFolder;
}

// ---------- Kimi Code：<KIMI_CODE_HOME>/sessions/<项目>/<会话>/state.json（含 cwd、createdAt、lastPrompt） ----------
async function kimiSessionsByFolder(
  home: string,
  targetFolders: ReadonlySet<string>,
  earliest: number,
  wantedHistoryIds: ReadonlySet<string>,
): Promise<Map<string, SessionInfo[]>> {
  const byFolder = new Map<string, SessionInfo[]>();
  if (targetFolders.size === 0) return byFolder;
  const root = path.join(home, 'sessions');
  let projects: fs.Dirent[];
  try { projects = await fs.promises.readdir(root, { withFileTypes: true }); } catch { return byFolder; }
  await Promise.all(projects.filter((e) => e.isDirectory()).map(async (project) => {
    let sessions: fs.Dirent[];
    try { sessions = await fs.promises.readdir(path.join(root, project.name), { withFileTypes: true }); } catch { return; }
    await Promise.all(sessions.filter((e) => e.isDirectory()).map(async (session) => {
      const file = path.join(root, project.name, session.name, 'state.json');
      const stat = await statOf(file);
      const isWantedHistory = wantedHistoryIds.has(session.name);
      if (!stat || (!isWantedHistory && stat.mtimeMs < earliest - SKEW_MS)) return;
      const state = await cached(file, stat, async () => {
        try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { return null; }
      });
      if (!state || state.archived || typeof state.cwd !== 'string') return;
      const sessionId = String(state.id ?? session.name);
      if (!isWantedHistory && !wantedHistoryIds.has(sessionId) && stat.mtimeMs < earliest - SKEW_MS) return;
      const key = folderKey(state.cwd);
      if (!targetFolders.has(key)) return;
      const created = typeof state.createdAt === 'number' ? state.createdAt : Date.parse(state.createdAt);
      const list = byFolder.get(key) ?? [];
      list.push({
        id: sessionId,
        birth: Number.isFinite(created) ? created : stat.birthtimeMs,
        lastPrompt: typeof state.lastPrompt === 'string' && state.lastPrompt.trim() ? clip(state.lastPrompt) : null,
      });
      byFolder.set(key, list);
    }));
  }));
  for (const [key, list] of byFolder) {
    const pinned = list.filter((item) => wantedHistoryIds.has(item.id));
    const rest = list.filter((item) => !wantedHistoryIds.has(item.id)).sort((a, b) => b.birth - a.birth).slice(0, MAX_SESSIONS_PER_GROUP);
    byFolder.set(key, [...pinned, ...rest]);
  }
  return byFolder;
}

/**
 * 把会话分给任务：从历史恢复的任务按会话 id 直接对应；其余会话按开始时间由早到晚，
 * 分给「创建时间不晚于该会话」的最近创建的任务（同文件夹同 CLI 并发多个任务时无法精确区分，这是启发式）；
 * 没有这样的任务时，才用 2 秒的容差。
 * 早于所有任务创建时间的会话是历史，不属于任何任务。一个任务后来又开了新会话（如 /clear）时取最新的那个。
 */
export function assignSessions(tasks: SummaryTask[], sessions: SessionInfo[]): Map<string, SessionInfo> {
  const result = new Map<string, SessionInfo>();
  const direct = new Set<string>();
  const claimed = new Set<string>();
  for (const task of tasks) {
    const session = task.historyId ? sessions.find((item) => item.id === task.historyId) : undefined;
    if (session) {
      result.set(task.id, session);
      direct.add(task.id);
      claimed.add(session.id);
    }
  }
  const pool = tasks.filter((task) => !direct.has(task.id));
  for (const session of [...sessions].sort((a, b) => a.birth - b.birth)) {
    if (claimed.has(session.id)) continue;
    // 先严格按创建时间归属；没有候选时才放宽容差，取离会话开始最近的任务
    const owner = pool.filter((task) => task.createdAt <= session.birth).sort((a, b) => b.createdAt - a.createdAt)[0]
      ?? pool.filter((task) => task.createdAt - SKEW_MS <= session.birth).sort((a, b) => a.createdAt - b.createdAt)[0];
    if (owner) result.set(owner.id, session);
  }
  return result;
}

function parseTasks(raw: unknown): SummaryTask[] {
  if (!Array.isArray(raw)) return [];
  const tasks: SummaryTask[] = [];
  for (const item of raw.slice(0, MAX_TASKS)) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, cliId, cwd, createdAt, historyId, configDir, includeUsage } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id || (cliId !== 'claude' && cliId !== 'codex' && cliId !== 'kimi')) continue;
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || typeof createdAt !== 'number') continue;
    tasks.push({
      id, cliId, cwd, createdAt,
      includeUsage: includeUsage === true,
      historyId: typeof historyId === 'string' && historyId ? historyId : undefined,
      configDir: typeof configDir === 'string' && configDir ? (resolveConfigDir(configDir) ?? undefined) : undefined,
    });
  }
  return tasks;
}

const DEFAULT_HOMES: Record<SummaryTask['cliId'], string> = {
  claude: path.join(os.homedir(), '.claude'),
  codex: path.join(os.homedir(), '.codex'),
  kimi: path.join(os.homedir(), '.kimi-code'),
};

/** 读取一批任务的摘要；按 (cliId, home) 合并扫描，避免多个文件夹下重复遍历整个 Codex / Kimi 会话目录 */
export async function readTaskSummaries(raw: unknown): Promise<Record<string, TaskSummary>> {
  const byCliHome = new Map<string, { cliId: SummaryTask['cliId']; home: string; folders: Map<string, SummaryTask[]> }>();
  for (const task of parseTasks(raw)) {
    const home = task.configDir ?? DEFAULT_HOMES[task.cliId];
    const homeKey = `${task.cliId}|${normalizePathKey(home)}`;
    let bucket = byCliHome.get(homeKey);
    if (!bucket) {
      bucket = { cliId: task.cliId, home, folders: new Map() };
      byCliHome.set(homeKey, bucket);
    }
    const fKey = folderKey(task.cwd);
    const list = bucket.folders.get(fKey);
    if (list) list.push(task);
    else bucket.folders.set(fKey, [task]);
  }
  const result: Record<string, TaskSummary> = {};
  await Promise.all([...byCliHome.values()].map(async ({ cliId, home, folders }) => {
    if (cliId === 'claude') {
      await Promise.all([...folders.values()].map(async (tasks) => {
        let sessions: SessionInfo[] = [];
        try { sessions = await claudeSessions(home, tasks[0].cwd); } catch {}
        const assigned = assignSessions(tasks, sessions);
        for (const task of tasks) {
          const session = assigned.get(task.id);
          result[task.id] = { text: session?.lastPrompt ?? null, sessionId: canUseSession(task, tasks, sessions, session) ? session?.id : undefined };
        }
      }));
      return;
    }
    const allTasks = [...folders.values()].flat();
    const earliest = Math.min(...allTasks.map((task) => task.createdAt));
    const wantedHistoryIds = new Set(allTasks.flatMap((task) => (task.historyId ? [task.historyId] : [])));
    const targetFolders = new Set(folders.keys());
    let grouped = new Map<string, SessionInfo[]>();
    try {
      grouped = cliId === 'codex'
        ? await codexSessionsByFolder(home, targetFolders, earliest, wantedHistoryIds)
        : await kimiSessionsByFolder(home, targetFolders, earliest, wantedHistoryIds);
    } catch { /* 读取失败时按「没有会话」处理 */ }
    for (const [fKey, tasks] of folders) {
      const sessions = grouped.get(fKey) ?? [];
      const assigned = assignSessions(tasks, sessions);
      for (const task of tasks) {
        const session = assigned.get(task.id);
        const confident = canUseSession(task, tasks, sessions, session);
        const usage = task.includeUsage && confident && session?.file && session.stat
          ? await quotaService.readCodexTaskUsage(session.file, session.stat)
          : undefined;
        result[task.id] = { text: session?.lastPrompt ?? null, sessionId: session?.id, usage };
      }
    }
  }));
  return result;
}

function canUseSession(task: SummaryTask, tasks: SummaryTask[], sessions: SessionInfo[], session?: SessionInfo): boolean {
  if (task.historyId) return session?.id === task.historyId;
  // Keep the sidebar heuristic, but hide task usage if several tasks or logs could match.
  return tasks.filter((item) => !item.historyId).length === 1
    && new Set(sessions.filter((item) => item.birth >= task.createdAt - SKEW_MS).map((item) => item.id)).size === 1;
}

export function setupTaskSummary(): void {
  ipcMain.handle('task:summaries', (_event, tasks: unknown) => readTaskSummaries(tasks));
}
