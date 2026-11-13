import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface HistoryEntry {
  id: string;
  cliId: 'claude' | 'codex' | 'kimi';
  title: string;
  cwd: string;
  updatedAt: number;
  command: string; // 恢复该会话的完整启动命令
}

const MAX_PER_CLI = 200;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const home = os.homedir();

// 最近一次列表中每个会话对应的磁盘路径；删除只信任此表，不接受渲染进程传入的路径
const deleteTargets = new Map<string, string[]>();
const DELETE_ROOTS = [
  path.join(home, '.claude', 'projects'),
  path.join(home, '.codex', 'sessions'),
  path.join(home, '.kimi-code', 'sessions'),
];

function targetKey(cliId: HistoryEntry['cliId'], id: string): string {
  return `${cliId}:${id}`;
}

function isInsideRoots(target: string): boolean {
  return DELETE_ROOTS.some((root) => {
    const rel = path.relative(root, target);
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

async function newest(files: string[]): Promise<{ file: string; mtime: number }[]> {
  const stats = await Promise.all(files.map(async (file) => {
    try { return { file, mtime: (await fs.promises.stat(file)).mtimeMs }; } catch { return null; }
  }));
  return stats.filter((item): item is { file: string; mtime: number } => item !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_PER_CLI);
}

// Claude Code：~/.claude/projects/<项目>/<sessionId>.jsonl（仅顶层文件，子代理在子目录）
async function listClaude(): Promise<HistoryEntry[]> {
  const root = path.join(home, '.claude', 'projects');
  const files = await listFiles(root, (name) => name.endsWith('.jsonl'), 1);
  const topLevel = files.filter((file) => path.dirname(path.dirname(file)) === root);
  const result = await Promise.all((await newest(topLevel)).map(async ({ file, mtime }): Promise<HistoryEntry | null> => {
    try {
      const id = path.basename(file, '.jsonl');
      if (!SAFE_ID.test(id)) return null;
      const head = await readSlice(file, 'head', 256 * 1024);
      const cwd = decodeJsonString(head.match(/"cwd":"((?:[^"\\]|\\.)*)"/)?.[1]);
      if (!cwd) return null;
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
      if (!title) return null;
      deleteTargets.set(targetKey('claude', id), [file, path.join(path.dirname(file), id)]);
      return { id, cliId: 'claude', title: clip(title), cwd, updatedAt: mtime, command: `claude --resume ${id}` };
    } catch { return null; }
  }));
  return result.filter((item): item is HistoryEntry => item !== null);
}

// Codex：~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl，名称取自 session_index.jsonl
async function listCodex(): Promise<HistoryEntry[]> {
  const codexDir = path.join(home, '.codex');
  const names = new Map<string, string>();
  try {
    for (const line of (await fs.promises.readFile(path.join(codexDir, 'session_index.jsonl'), 'utf8')).split('\n')) {
      try {
        const item = JSON.parse(line);
        if (item.id && item.thread_name) names.set(item.id, item.thread_name);
      } catch { /* 忽略坏行 */ }
    }
  } catch { /* 无索引文件 */ }

  const files = await listFiles(path.join(codexDir, 'sessions'), (name) => name.endsWith('.jsonl'), 4);
  const result = await Promise.all((await newest(files)).map(async ({ file, mtime }): Promise<HistoryEntry | null> => {
    try {
      const head = await readSlice(file, 'head', 16 * 1024);
      // source 为对象表示子代理（如 guardian 审查），不是用户会话
      if (!/"source":"/.test(head)) return null;
      const id = head.match(/"id":"([^"]+)"/)?.[1];
      const cwd = decodeJsonString(head.match(/"cwd":"((?:[^"\\]|\\.)*)"/)?.[1]);
      if (!id || !SAFE_ID.test(id) || !cwd) return null;
      const title = names.get(id) || path.basename(cwd) || 'Codex 会话';
      deleteTargets.set(targetKey('codex', id), [file]);
      return { id, cliId: 'codex', title: clip(title), cwd, updatedAt: mtime, command: `codex resume ${id}` };
    } catch { return null; }
  }));
  return result.filter((item): item is HistoryEntry => item !== null);
}

// Kimi Code：~/.kimi-code/sessions/<项目>/<session_id>/state.json
async function listKimi(): Promise<HistoryEntry[]> {
  const files = await listFiles(path.join(home, '.kimi-code', 'sessions'), (name) => name === 'state.json', 2);
  const result = await Promise.all((await newest(files)).map(async ({ file, mtime }): Promise<HistoryEntry | null> => {
    try {
      const state = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      if (state.archived || !state.cwd || !SAFE_ID.test(state.id || '')) return null;
      const title = state.title || state.lastPrompt;
      if (!title) return null;
      const sessionDir = path.dirname(file);
      if (path.basename(sessionDir) === state.id) deleteTargets.set(targetKey('kimi', state.id), [sessionDir]);
      return {
        id: state.id,
        cliId: 'kimi',
        title: clip(String(title)),
        cwd: String(state.cwd).replace(/\//g, '\\'),
        updatedAt: Number(state.updatedAt) || mtime,
        command: `kimi --session ${state.id}`,
      };
    } catch { return null; }
  }));
  return result.filter((item): item is HistoryEntry => item !== null);
}

export async function deleteSessionHistory(
  items: { cliId: HistoryEntry['cliId']; id: string }[],
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const { cliId, id } of items) {
    const targets = deleteTargets.get(targetKey(cliId, id));
    if (!targets || !targets.every(isInsideRoots)) { failed++; continue; }
    try {
      for (const target of targets) await fs.promises.rm(target, { recursive: true, force: true });
      deleteTargets.delete(targetKey(cliId, id));
      deleted++;
    } catch { failed++; }
  }
  return { deleted, failed };
}

export async function listSessionHistory(): Promise<HistoryEntry[]> {
  const all = await Promise.all([listClaude(), listCodex(), listKimi()]);
  return all.flat().sort((a, b) => b.updatedAt - a.updatedAt);
}
