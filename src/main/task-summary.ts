import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ipcMain } from 'electron';
import { resolveConfigDir } from './account-env';

/** 侧栏任务行第二行的数据：该任务会话里最近一条用户消息；text 为 null 表示会话里还没有用户消息（新会话） */
export interface TaskSummary {
  text: string | null;
}

interface SummaryTask {
  id: string;
  cliId: 'claude' | 'codex' | 'kimi';
  cwd: string;
  createdAt: number;
  historyId?: string;
  configDir?: string;       // 多账号：该账号的配置目录（CLAUDE_CONFIG_DIR / CODEX_HOME / KIMI_CODE_HOME）
}

interface SessionInfo {
  id: string;
  birth: number;            // 会话开始时间，用来判断它属于哪个任务
  lastPrompt: string | null;
}

const MAX_TASKS = 100;
const MAX_SESSIONS_PER_GROUP = 40;
const MAX_TEXT = 100;
/** 任务创建时间是在 PTY 启动之后才记录的，CLI 不会更早生成会话文件；容差只用来兜住毫秒级的时钟与调度误差 */
const SKEW_MS = 2_000;

function folderKey(folder: string): string {
  return folder.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
}

function clip(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > MAX_TEXT ? `${oneLine.slice(0, MAX_TEXT)}…` : oneLine;
}

async function readSlice(file: string, from: 'head' | 'tail', bytes: number): Promise<string> {
  const handle = await fs.promises.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, from === 'head' ? 0 : size - length);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}

// ---------- 按文件签名缓存解析结果，轮询时只重新解析有变化的文件 ----------
const cache = new Map<string, { sig: string; value: unknown }>();
async function cached<T>(file: string, stat: fs.Stats, parse: () => Promise<T>): Promise<T> {
  const sig = `${stat.mtimeMs}:${stat.size}`;
  const hit = cache.get(file);
  if (hit && hit.sig === sig) return hit.value as T;
  const value = await parse();
  if (cache.size > 800) cache.clear();
  cache.set(file, { sig, value });
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
    const cached = claudeDirectoryCache.get(dir);
    if (cached && cached.mtimeMs === stat.mtimeMs) names = cached.names;
    else {
      names = (await fs.promises.readdir(dir)).filter((name) => name.endsWith('.jsonl'));
      claudeDirectoryCache.set(dir, { mtimeMs: stat.mtimeMs, names });
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

// ---------- Codex：<CODEX_HOME>/sessions/YYYY/MM/DD/rollout-*.jsonl ----------
async function lastCodexPrompt(file: string): Promise<string | null> {
  const lines = (await readSlice(file, 'tail', 256 * 1024)).split('\n');
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

async function codexSessionsByFolder(home: string, targetFolders: ReadonlySet<string>, earliest: number): Promise<Map<string, SessionInfo[]>> {
  const byFolder = new Map<string, SessionInfo[]>();
  if (targetFolders.size === 0) return byFolder;
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
    const meta = await cached(`${file}#meta`, stat, async () => {
      try {
        const first = (await readSlice(file, 'head', 32 * 1024)).split('\n')[0];
        const payload = JSON.parse(first)?.payload;
        // source 不是字符串表示子代理（如审查），不是用户会话
        if (typeof payload?.source !== 'string') return null;
        return { id: String(payload.id), cwd: String(payload.cwd ?? ''), birth: Date.parse(payload.timestamp) || stat.birthtimeMs };
      } catch { return null; }
    });
    if (!meta) continue;
    const key = folderKey(meta.cwd);
    if (!targetFolders.has(key)) continue;
    const lastPrompt = await cached(file, stat, () => lastCodexPrompt(file).catch(() => null));
    const list = byFolder.get(key) ?? [];
    list.push({ id: meta.id, birth: meta.birth, lastPrompt });
    byFolder.set(key, list);
  }
  for (const [key, list] of byFolder) {
    byFolder.set(key, list.sort((a, b) => b.birth - a.birth).slice(0, MAX_SESSIONS_PER_GROUP));
  }
  return byFolder;
}

// ---------- Kimi Code：<KIMI_CODE_HOME>/sessions/<项目>/<会话>/state.json（含 cwd、createdAt、lastPrompt） ----------
async function kimiSessionsByFolder(home: string, targetFolders: ReadonlySet<string>, earliest: number): Promise<Map<string, SessionInfo[]>> {
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
      if (!stat || stat.mtimeMs < earliest - SKEW_MS) return;
      const state = await cached(file, stat, async () => {
        try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { return null; }
      });
      if (!state || state.archived || typeof state.cwd !== 'string') return;
      const key = folderKey(state.cwd);
      if (!targetFolders.has(key)) return;
      const created = typeof state.createdAt === 'number' ? state.createdAt : Date.parse(state.createdAt);
      const list = byFolder.get(key) ?? [];
      list.push({
        id: String(state.id ?? session.name),
        birth: Number.isFinite(created) ? created : stat.birthtimeMs,
        lastPrompt: typeof state.lastPrompt === 'string' && state.lastPrompt.trim() ? clip(state.lastPrompt) : null,
      });
      byFolder.set(key, list);
    }));
  }));
  for (const [key, list] of byFolder) {
    byFolder.set(key, list.sort((a, b) => b.birth - a.birth).slice(0, MAX_SESSIONS_PER_GROUP));
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
    const { id, cliId, cwd, createdAt, historyId, configDir } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id || (cliId !== 'claude' && cliId !== 'codex' && cliId !== 'kimi')) continue;
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || typeof createdAt !== 'number') continue;
    tasks.push({
      id, cliId, cwd, createdAt,
      historyId: typeof historyId === 'string' ? historyId : undefined,
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
    const homeKey = `${task.cliId}|${process.platform === 'win32' ? home.toLowerCase() : home}`;
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
        for (const task of tasks) result[task.id] = { text: assigned.get(task.id)?.lastPrompt ?? null };
      }));
      return;
    }
    const allTasks = [...folders.values()].flat();
    const earliest = Math.min(...allTasks.map((task) => task.createdAt));
    const targetFolders = new Set(folders.keys());
    let grouped = new Map<string, SessionInfo[]>();
    try {
      grouped = cliId === 'codex'
        ? await codexSessionsByFolder(home, targetFolders, earliest)
        : await kimiSessionsByFolder(home, targetFolders, earliest);
    } catch { /* 读取失败时按「没有会话」处理 */ }
    for (const [fKey, tasks] of folders) {
      const assigned = assignSessions(tasks, grouped.get(fKey) ?? []);
      for (const task of tasks) result[task.id] = { text: assigned.get(task.id)?.lastPrompt ?? null };
    }
  }));
  return result;
}

export function setupTaskSummary(): void {
  ipcMain.handle('task:summaries', (_event, tasks: unknown) => readTaskSummaries(tasks));
}
