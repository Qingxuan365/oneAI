import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { KnownCliInfo } from '../shared/types';
import knownClis from './known-clis.json';

export interface DetectedCli {
  id: string;
  name: string;
  command: string;
}

/** 用户在设置里自定义的 CLI：只需要 id 与完整启动命令 */
export interface CustomCliProbe {
  id: string;
  command: string;
}

// 已知 AI 编程 CLI（数据见 known-clis.json）。前五个有内置品牌分组，其余检测到后自动生成通用分组。
const KNOWN_CLIS: KnownCliInfo[] = knownClis as KnownCliInfo[];

/** 取完整命令里的可执行文件（第一个词，支持引号包住的带空格路径） */
function executableOf(command: string): string {
  const first = command.trim().match(/^"([^"]*)"|^'([^']*)'|^\S+/);
  return first ? (first[1] ?? first[2] ?? first[0]) : '';
}

async function isFileAsync(file: string): Promise<boolean> {
  try { return (await fs.promises.stat(file)).isFile(); } catch { return false; }
}

/** 合并当前进程 PATH 与系统最新 Machine / User PATH，按平台大小写去重并保留新增项 */
export function mergePathStrings(
  currentPath: string,
  freshEntries: string[],
  platform: NodeJS.Platform = process.platform,
): string {
  const delimiter = platform === 'win32' ? ';' : ':';
  const normalize = platform === 'win32'
    ? (entry: string) => entry.replace(/[\\/]+$/, '').toLowerCase()
    : (entry: string) => entry.replace(/\/+$/, '');
  const seen = new Set<string>();
  const merged: string[] = [];
  const pushAll = (raw: string) => {
    for (const part of raw.split(delimiter)) {
      const trimmed = part.trim().replace(/^"(.*)"$/, '$1');
      if (!trimmed) continue;
      const key = normalize(trimmed);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(trimmed);
    }
  };
  // 优先放最新的系统 / 用户 PATH，让刚装好的 CLI 生效，再保留进程原有条目（如开发期注入路径）
  for (const raw of freshEntries) pushAll(raw);
  pushAll(currentPath);
  return merged.join(delimiter);
}

/** 读取 Windows 注册表里最新的 Machine 与 User PATH，刷新到当前 Electron 进程环境（避免安装新 CLI 后需重启 OneAI） */
export async function refreshProcessPath(): Promise<string> {
  const current = process.env.PATH || process.env.Path || '';
  if (process.platform !== 'win32') return current;
  const fresh = await new Promise<string | null>((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $m = [Environment]::GetEnvironmentVariable('Path', 'Machine'); $u = [Environment]::GetEnvironmentVariable('Path', 'User'); Write-Output ($u + ';' + $m)",
      ],
      { windowsHide: true, timeout: 4000, maxBuffer: 256 * 1024 },
      (error, stdout) => {
        if (error || !stdout) {
          resolve(null);
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
  if (!fresh) return current;
  const merged = mergePathStrings(current, [fresh], 'win32');
  process.env.PATH = merged;
  return merged;
}

/** 扫描一次 PATH 各目录的可执行文件名集合，避免对「CLI × PATH 目录 × PATHEXT」做数千次 statSync */
async function buildPathFileSet(): Promise<Set<string>> {
  const normalize = process.platform === 'win32' ? (s: string) => s.toLowerCase() : (s: string) => s;
  const rawDirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  const uniqueDirs = [...new Set(rawDirs.map((dir) => (process.platform === 'win32' ? path.resolve(dir).toLowerCase() : path.resolve(dir))))];
  const names = new Set<string>();
  await Promise.all(uniqueDirs.map(async (dir) => {
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    await Promise.all(entries.map(async (entry) => {
      if (entry.isFile()) {
        names.add(normalize(entry.name));
      } else if (entry.isSymbolicLink() && await isFileAsync(path.join(dir, entry.name))) {
        names.add(normalize(entry.name));
      }
    }));
  }));
  return names;
}

function candidateNames(name: string): string[] {
  // Windows 上按 PATHEXT 补扩展名；不补空扩展名，避免命中 npm 同目录下无扩展名的 shell 脚本。已带扩展名（如 tool.exe）时才按原名查找
  const pathExts = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.PS1').split(';').map((ext) => ext.toLowerCase());
  const exts = process.platform !== 'win32' ? [''] : path.extname(name) ? ['', ...pathExts] : pathExts;
  const normalize = process.platform === 'win32' ? (s: string) => s.toLowerCase() : (s: string) => s;
  return exts.map((ext) => normalize(name + ext));
}

async function isInstalled(command: string, pathFiles: ReadonlySet<string>): Promise<boolean> {
  const executable = executableOf(command);
  if (!executable) return false;
  const name = path.basename(executable);
  const candidates = candidateNames(name);
  // 带路径的命令直接检查该路径；否则在预扫描的 PATH 文件名集合里 O(1) 查找
  if (/[\\/]/.test(executable)) {
    const dir = path.dirname(executable);
    const checks = await Promise.all(candidates.map((candidate) => isFileAsync(path.join(dir, candidate))));
    return checks.some(Boolean);
  }
  return candidates.some((candidate) => pathFiles.has(candidate));
}

/** 检测本机是否已安装 Git（Claude Code 与 Kimi Code 在 Windows 上运行依赖 Git for Windows） */
export async function detectGitInstalled(): Promise<boolean> {
  const pathFiles = await buildPathFileSet();
  if (await isInstalled('git', pathFiles)) return true;
  if (process.platform === 'win32') {
    const commonGitPaths = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'cmd', 'git.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'cmd', 'git.exe'),
    ].filter(Boolean);
    const checks = await Promise.all(commonGitPaths.map((file) => isFileAsync(file)));
    if (checks.some(Boolean)) return true;
  }
  return false;
}

/** 从 `node --version` 等输出中解析三段式语义版本号（如 `v22.19.0` -> `22.19.0`） */
export function parseNodeVersion(raw: string): string | undefined {
  const match = raw.trim().match(/v?(\d+)\.(\d+)\.(\d+)/i);
  return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}` : undefined;
}

/** 判断当前 Node.js 版本是否不低于最低要求 */
export function isNodeVersionAtLeast(current: string | undefined, minimum: string | undefined): boolean {
  if (!minimum) return true;
  if (!current) return false;
  const parse = (ver: string) => {
    const m = ver.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/i);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(current);
  const b = parse(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

function readNodeVersion(executable: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(executable, ['--version'], { windowsHide: true, timeout: 3000, maxBuffer: 16 * 1024 }, (error, stdout) => {
      if (error || !stdout) {
        resolve(undefined);
        return;
      }
      resolve(parseNodeVersion(stdout));
    });
  });
}

/** 检测本机是否已安装 Node.js 及其版本号（供依赖 Node.js 的 CLI 安装前提醒） */
export async function detectNodeInstalled(): Promise<{ hasNode: boolean; nodeVersion?: string }> {
  const pathFiles = await buildPathFileSet();
  if (await isInstalled('node', pathFiles)) {
    const nodeVersion = await readNodeVersion('node');
    return { hasNode: true, ...(nodeVersion ? { nodeVersion } : {}) };
  }
  if (process.platform === 'win32') {
    const commonNodePaths = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
    ].filter(Boolean);
    for (const file of commonNodePaths) {
      if (await isFileAsync(file)) {
        const nodeVersion = await readNodeVersion(file);
        return { hasNode: true, ...(nodeVersion ? { nodeVersion } : {}) };
      }
    }
  }
  return { hasNode: false };
}

/** 内置的已知 CLI 清单（来自 known-clis.json），设置页与欢迎安装页共用 */
export function listKnownClis(): KnownCliInfo[] {
  return KNOWN_CLIS;
}

async function resolveInstalledCommand(
  cli: Pick<KnownCliInfo, 'command' | 'aliases'>,
  pathFiles: ReadonlySet<string>,
): Promise<string | null> {
  const candidates = [cli.command, ...(cli.aliases ?? [])];
  for (const cmd of candidates) {
    if (await isInstalled(cmd, pathFiles)) return cmd;
  }
  return null;
}

// 按 PATH 检测已安装的 AI CLI，只返回已安装项；用户自定义的 CLI 一并检测，结果里 name 为空
export async function detectInstalledClis(
  custom: CustomCliProbe[] = [],
  options: { refreshPath?: boolean } = {},
): Promise<DetectedCli[]> {
  if (options.refreshPath) {
    await refreshProcessPath();
  }
  const pathFiles = await buildPathFileSet();
  const [knownCommands, extraFlags] = await Promise.all([
    Promise.all(KNOWN_CLIS.map((cli) => resolveInstalledCommand(cli, pathFiles))),
    Promise.all(custom.map(async (cli) => (
      Boolean(cli && typeof cli.id === 'string' && typeof cli.command === 'string')
      && await isInstalled(cli.command, pathFiles)
    ))),
  ]);
  const known: DetectedCli[] = [];
  for (let i = 0; i < KNOWN_CLIS.length; i++) {
    const command = knownCommands[i];
    if (!command) continue;
    known.push({ id: KNOWN_CLIS[i].id, name: KNOWN_CLIS[i].name, command });
  }
  const extra = custom
    .filter((_, index) => extraFlags[index])
    .map((cli): DetectedCli => ({ id: cli.id, name: '', command: cli.command }));
  return [...known, ...extra];
}
