import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { Decompress as ZstdDecompress } from 'fzstd';
import { isAccountCli, resolveConfigDir } from './account-env';
import { t } from './i18n';

export interface HistoryEntry {
  id: string;
  cliId: 'claude' | 'codex' | 'kimi';
  title: string;
  cwd: string;
  updatedAt: number;
  command: string; // 恢复该会话的完整启动命令
  accountId?: string;   // 非默认账号时携带账号配置 id；默认账号缺省
  accountName?: string; // 非默认账号时携带账号名称
}

export interface HistoryAccountRef {
  id: string;
  name: string;
  cliId: string;
  configDir: string;
}

interface DirScope {
  dir: string;
  accountId?: string;
  accountName?: string;
}

const MAX_PER_CLI = 200;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const home = os.homedir();

// 最近一次列表中每个会话对应的磁盘路径；删除只信任此表，不接受渲染进程传入的路径
const deleteTargets = new Map<string, string[]>();
const DEFAULT_DELETE_ROOTS = [
  path.join(home, '.claude', 'projects'),
  path.join(home, '.codex', 'sessions'),
  path.join(home, '.codex', 'archived_sessions'),
  path.join(home, '.kimi-code', 'sessions'),
];
let dynamicDeleteRoots: string[] = [...DEFAULT_DELETE_ROOTS];

// 按文件 mtime + size 缓存解析结果，避免每 2 分钟与每次打开历史抽屉重复打开最多数百个文件
const claudeCache = new Map<string, { sig: string; base: Omit<HistoryEntry, 'accountId' | 'accountName'> | null; targets?: string[] }>();
const codexMetaCache = new Map<string, { sig: string; meta: { id: string; cwd: string; prompt?: string } | null }>();
const kimiCache = new Map<string, { sig: string; base: Omit<HistoryEntry, 'accountId' | 'accountName'> | null; targets?: string[] }>();
const MAX_HISTORY_CACHE = 1500;

function targetKey(cliId: HistoryEntry['cliId'], id: string, accountId?: string): string {
  return `${cliId}:${accountId || 'default'}:${id}`;
}

function normalizeDirKey(dir: string): string {
  return process.platform === 'win32' ? path.resolve(dir).toLowerCase() : path.resolve(dir);
}

/** 默认目录优先；同目录的多账号配置自动去重并归入默认账号 */
function scopesForCli(defaultDir: string, cliId: HistoryEntry['cliId'], accounts: HistoryAccountRef[]): DirScope[] {
  const result = new Map<string, DirScope>([[normalizeDirKey(defaultDir), { dir: defaultDir }]]);
  for (const acc of accounts) {
    if (!acc || !isAccountCli(acc.cliId) || acc.cliId !== cliId || typeof acc.id !== 'string' || !acc.id) continue;
    const resolved = resolveConfigDir(acc.configDir);
    if (!resolved) continue;
    const key = normalizeDirKey(resolved);
    if (result.has(key)) continue;
    result.set(key, {
      dir: resolved,
      accountId: acc.id,
      accountName: typeof acc.name === 'string' && acc.name.trim() ? acc.name.trim() : acc.id,
    });
  }
  return [...result.values()];
}

function withAccount(base: Omit<HistoryEntry, 'accountId' | 'accountName'>, scope: DirScope): HistoryEntry {
  return scope.accountId
    ? { ...base, accountId: scope.accountId, accountName: scope.accountName }
    : { ...base };
}

function isInsideRoots(target: string): boolean {
  const resolvedTarget = path.resolve(target);
  return dynamicDeleteRoots.some((root) => {
    const rel = path.relative(path.resolve(root), resolvedTarget);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  });
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

/** 流式读取 .jsonl.zst 开头指定字节即中止解压，避免为提取会话元数据解压整个归档文件 */
async function readZstHead(file: string, maxBytes: number): Promise<string> {
  const decoder = new StringDecoder('utf8');
  let out = '';
  let total = 0;
  const stream = fs.createReadStream(file, { highWaterMark: 16 * 1024 });
  try {
    const zstd = new ZstdDecompress((chunk) => {
      if (total >= maxBytes) return;
      const remain = maxBytes - total;
      const slice = chunk.byteLength > remain ? chunk.subarray(0, remain) : chunk;
      total += slice.byteLength;
      out += decoder.write(Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength));
    });
    for await (const chunk of stream) {
      zstd.push(chunk as Buffer);
      if (total >= maxBytes) break;
    }
    if (total < maxBytes) zstd.push(new Uint8Array(0), true);
    out += decoder.end();
    return out;
  } finally {
    stream.destroy();
  }
}

async function readHead(file: string, bytes: number): Promise<string> {
  return file.endsWith('.zst') ? readZstHead(file, bytes) : readSlice(file, 'head', bytes);
}

function decodeJsonString(raw: string | undefined): string {
  if (!raw) return '';
  try { return JSON.parse(`"${raw}"`); } catch { return raw; }
}

function clip(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
}

async function listFiles(dir: string, match: (name: string) => boolean, depth: number): Promise<string[]> {
  let entries: fs.Dirent[];
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && match(entry.name)) files.push(full);
    else if (entry.isDirectory() && depth > 0) files.push(...await listFiles(full, match, depth - 1));
  }
  return files;
}

/** 扫描 Codex 会话文件（含 .jsonl 与 .jsonl.zst）；同目录同名明文与压缩包并存时以明文为主并附带压缩包删除目标 */
async function listCodexFiles(dir: string, depth: number, companions: Map<string, string[]>): Promise<string[]> {
  let entries: fs.Dirent[];
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const plainNames = new Set(entries.filter((e) => e.isFile() && e.name.endsWith('.jsonl')).map((e) => e.name));
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(full);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl.zst')) {
      const plainName = entry.name.slice(0, -4);
      if (plainNames.has(plainName)) {
        const plainFull = path.join(dir, plainName);
        companions.set(plainFull, [...(companions.get(plainFull) ?? []), full]);
      } else {
        files.push(full);
      }
    } else if (entry.isDirectory() && depth > 0) {
      files.push(...await listCodexFiles(full, depth - 1, companions));
    }
  }
  return files;
}

async function newest(files: string[]): Promise<{ file: string; mtime: number; size: number }[]> {
  const stats = await Promise.all(files.map(async (file) => {
    try {
      const stat = await fs.promises.stat(file);
      return { file, mtime: stat.mtimeMs, size: stat.size };
    } catch { return null; }
  }));
  return stats.filter((item): item is { file: string; mtime: number; size: number } => item !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_PER_CLI);
}

// Claude Code：<CLAUDE_CONFIG_DIR>/projects/<项目>/<sessionId>.jsonl（仅顶层文件，子代理在子目录）
async function listClaudeScope(scope: DirScope): Promise<HistoryEntry[]> {
  const root = path.join(scope.dir, 'projects');
  const files = await listFiles(root, (name) => name.endsWith('.jsonl'), 1);
  const topLevel = files.filter((file) => path.dirname(path.dirname(file)) === root);
  if (claudeCache.size > MAX_HISTORY_CACHE) claudeCache.clear();
  const result = await Promise.all((await newest(topLevel)).map(async ({ file, mtime, size }): Promise<HistoryEntry | null> => {
    const sig = `${mtime}:${size}`;
    const hit = claudeCache.get(file);
    if (hit && hit.sig === sig) {
      if (!hit.base) return null;
      if (hit.targets) deleteTargets.set(targetKey('claude', hit.base.id, scope.accountId), hit.targets);
      return withAccount(hit.base, scope);
    }
    try {
      const id = path.basename(file, '.jsonl');
      if (!SAFE_ID.test(id)) {
        claudeCache.set(file, { sig, base: null });
        return null;
      }
      const head = await readSlice(file, 'head', 256 * 1024);
      const cwd = decodeJsonString(head.match(/"cwd":"((?:[^"\\]|\\.)*)"/)?.[1]);
      if (!cwd) {
        claudeCache.set(file, { sig, base: null });
        return null;
      }
      const tail = await readSlice(file, 'tail', 64 * 1024);
      const titles = [...(tail + head).matchAll(/"(?:aiTitle|customTitle)":"((?:[^"\\]|\\.)*)"/g)];
      let title = decodeJsonString(titles[0]?.[1]);
      if (!title) {
        for (const line of head.split('\n')) {
          if (!line.includes('"type":"user"')) continue;
          try {
            const content = JSON.parse(line).message?.content;
            const text = typeof content === 'string' ? content : content?.find?.((part: { type: string }) => part.type === 'text')?.text;
            if (text && !text.startsWith('<')) { title = text; break; }
          } catch { /* 行被截断则跳过 */ }
        }
      }
      if (!title) {
        claudeCache.set(file, { sig, base: null });
        return null;
      }
      const targets = [file, path.join(path.dirname(file), id)];
      deleteTargets.set(targetKey('claude', id, scope.accountId), targets);
      const base: Omit<HistoryEntry, 'accountId' | 'accountName'> = {
        id,
        cliId: 'claude',
        title: clip(title),
        cwd,
        updatedAt: mtime,
        command: `claude --resume ${id}`,
      };
      claudeCache.set(file, { sig, base, targets });
      return withAccount(base, scope);
    } catch { return null; }
  }));
  return result.filter((item): item is HistoryEntry => item !== null);
}

// Codex：<CODEX_HOME>/sessions 与 archived_sessions 下的 rollout-*.jsonl(.zst)，名称优先取自 session_index.jsonl
async function listCodexScope(scope: DirScope): Promise<HistoryEntry[]> {
  const names = new Map<string, string>();
  try {
    for (const line of (await fs.promises.readFile(path.join(scope.dir, 'session_index.jsonl'), 'utf8')).split('\n')) {
      try {
        const item = JSON.parse(line);
        if (item.id && item.thread_name) names.set(item.id, item.thread_name);
      } catch { /* 忽略坏行 */ }
    }
  } catch { /* 无索引文件 */ }

  const companions = new Map<string, string[]>();
  const [activeFiles, archivedFiles] = await Promise.all([
    listCodexFiles(path.join(scope.dir, 'sessions'), 4, companions),
    listCodexFiles(path.join(scope.dir, 'archived_sessions'), 4, companions),
  ]);
  const files = [...activeFiles, ...archivedFiles];
  if (codexMetaCache.size > MAX_HISTORY_CACHE) codexMetaCache.clear();

  const parsed = await Promise.all((await newest(files)).map(async ({ file, mtime, size }) => {
    const sig = `${mtime}:${size}`;
    let meta: { id: string; cwd: string; prompt?: string } | null | undefined;
    const hit = codexMetaCache.get(file);
    if (hit && hit.sig === sig) {
      meta = hit.meta;
    } else {
      try {
        const head = await readHead(file, 32 * 1024);
        // source 为对象表示子代理（如 guardian 审查），不是用户会话
        if (!/"source":"/.test(head)) {
          codexMetaCache.set(file, { sig, meta: null });
          return null;
        }
        const id = head.match(/"id":"([^"]+)"/)?.[1];
        const cwd = decodeJsonString(head.match(/"cwd":"((?:[^"\\]|\\.)*)"/)?.[1]);
        let prompt: string | undefined;
        for (const line of head.split('\n')) {
          if (!line.includes('"user_message"')) continue;
          try {
            const evt = JSON.parse(line);
            if (evt?.type === 'event_msg' && evt.payload?.type === 'user_message' && typeof evt.payload.message === 'string' && evt.payload.message.trim()) {
              prompt = evt.payload.message.trim();
              break;
            }
          } catch { /* 行被截断则跳过 */ }
        }
        meta = id && SAFE_ID.test(id) && cwd ? { id, cwd, prompt } : null;
        codexMetaCache.set(file, { sig, meta });
      } catch {
        return null;
      }
    }
    if (!meta) return null;
    const title = names.get(meta.id) || meta.prompt || path.basename(meta.cwd) || t('Codex 会话');
    const targets = [file, ...(companions.get(file) ?? [])];
    return {
      entry: withAccount({
        id: meta.id,
        cliId: 'codex',
        title: clip(title),
        cwd: meta.cwd,
        updatedAt: mtime,
        command: `codex resume ${meta.id}`,
      }, scope),
      targets,
    };
  }));

  // 同一会话若同时存在于 sessions 与 archived_sessions，保留更新时间较新的一条并合并删除目标
  const byId = new Map<string, { entry: HistoryEntry; targets: string[] }>();
  for (const item of parsed) {
    if (!item) continue;
    const prev = byId.get(item.entry.id);
    if (!prev) {
      byId.set(item.entry.id, { entry: item.entry, targets: [...item.targets] });
    } else {
      prev.targets.push(...item.targets);
      if (item.entry.updatedAt > prev.entry.updatedAt) prev.entry = item.entry;
    }
  }
  const entries: HistoryEntry[] = [];
  for (const { entry, targets } of byId.values()) {
    deleteTargets.set(targetKey('codex', entry.id, scope.accountId), [...new Set(targets)]);
    entries.push(entry);
  }
  return entries;
}

// Kimi Code：<KIMI_CODE_HOME>/sessions/<项目>/<session_id>/state.json
async function listKimiScope(scope: DirScope): Promise<HistoryEntry[]> {
  const files = await listFiles(path.join(scope.dir, 'sessions'), (name) => name === 'state.json', 2);
  if (kimiCache.size > MAX_HISTORY_CACHE) kimiCache.clear();
  const result = await Promise.all((await newest(files)).map(async ({ file, mtime, size }): Promise<HistoryEntry | null> => {
    const sig = `${mtime}:${size}`;
    const hit = kimiCache.get(file);
    if (hit && hit.sig === sig) {
      if (!hit.base) return null;
      if (hit.targets) deleteTargets.set(targetKey('kimi', hit.base.id, scope.accountId), hit.targets);
      return withAccount(hit.base, scope);
    }
    try {
      const state = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      if (state.archived || !state.cwd || !SAFE_ID.test(state.id || '')) {
        kimiCache.set(file, { sig, base: null });
        return null;
      }
      const title = state.title || state.lastPrompt;
      if (!title) {
        kimiCache.set(file, { sig, base: null });
        return null;
      }
      const sessionDir = path.dirname(file);
      const targets = path.basename(sessionDir) === state.id ? [sessionDir] : undefined;
      if (targets) deleteTargets.set(targetKey('kimi', state.id, scope.accountId), targets);
      const base: Omit<HistoryEntry, 'accountId' | 'accountName'> = {
        id: state.id,
        cliId: 'kimi',
        title: clip(String(title)),
        cwd: String(state.cwd).replace(/\//g, '\\'),
        updatedAt: Number(state.updatedAt) || mtime,
        command: `kimi --session ${state.id}`,
      };
      kimiCache.set(file, { sig, base, targets });
      return withAccount(base, scope);
    } catch { return null; }
  }));
  return result.filter((item): item is HistoryEntry => item !== null);
}

export async function deleteSessionHistory(
  items: { cliId: HistoryEntry['cliId']; id: string; accountId?: string }[],
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const { cliId, id, accountId } of items) {
    const key = targetKey(cliId, id, accountId);
    const targets = deleteTargets.get(key);
    if (!targets || !targets.every(isInsideRoots)) { failed++; continue; }
    try {
      for (const target of targets) {
        await fs.promises.rm(target, { recursive: true, force: true });
        claudeCache.delete(target);
        codexMetaCache.delete(target);
        kimiCache.delete(path.join(target, 'state.json'));
      }
      deleteTargets.delete(key);
      deleted++;
    } catch { failed++; }
  }
  return { deleted, failed };
}

export async function listSessionHistory(accounts: HistoryAccountRef[] = []): Promise<HistoryEntry[]> {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const claudeScopes = scopesForCli(path.join(home, '.claude'), 'claude', safeAccounts);
  const codexScopes = scopesForCli(path.join(home, '.codex'), 'codex', safeAccounts);
  const kimiScopes = scopesForCli(path.join(home, '.kimi-code'), 'kimi', safeAccounts);

  const roots = new Set<string>(DEFAULT_DELETE_ROOTS);
  for (const s of claudeScopes) roots.add(path.join(s.dir, 'projects'));
  for (const s of codexScopes) {
    roots.add(path.join(s.dir, 'sessions'));
    roots.add(path.join(s.dir, 'archived_sessions'));
  }
  for (const s of kimiScopes) roots.add(path.join(s.dir, 'sessions'));
  dynamicDeleteRoots = [...roots];

  const all = await Promise.all([
    ...claudeScopes.map((scope) => listClaudeScope(scope)),
    ...codexScopes.map((scope) => listCodexScope(scope)),
    ...kimiScopes.map((scope) => listKimiScope(scope)),
  ]);
  return all.flat().sort((a, b) => b.updatedAt - a.updatedAt);
}
