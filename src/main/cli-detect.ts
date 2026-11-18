import fs from 'node:fs';
import path from 'node:path';
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
const KNOWN_CLIS: DetectedCli[] = knownClis;

/** 取完整命令里的可执行文件（第一个词，支持引号包住的带空格路径） */
function executableOf(command: string): string {
  const first = command.trim().match(/^"([^"]*)"|^'([^']*)'|^\S+/);
  return first ? (first[1] ?? first[2] ?? first[0]) : '';
}

async function isFileAsync(file: string): Promise<boolean> {
  try { return (await fs.promises.stat(file)).isFile(); } catch { return false; }
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

/** 内置的已知 CLI 清单（来自 known-clis.json），设置页据此显示每个 CLI 是否已安装 */
export function listKnownClis(): DetectedCli[] {
  return KNOWN_CLIS;
}

// 按 PATH 检测已安装的 AI CLI，只返回已安装项；用户自定义的 CLI 一并检测，结果里 name 为空
export async function detectInstalledClis(custom: CustomCliProbe[] = []): Promise<DetectedCli[]> {
  const pathFiles = await buildPathFileSet();
  const [knownFlags, extraFlags] = await Promise.all([
    Promise.all(KNOWN_CLIS.map((cli) => isInstalled(cli.command, pathFiles))),
    Promise.all(custom.map(async (cli) => (
      Boolean(cli && typeof cli.id === 'string' && typeof cli.command === 'string')
      && await isInstalled(cli.command, pathFiles)
    ))),
  ]);
  const known = KNOWN_CLIS.filter((_, index) => knownFlags[index]);
  const extra = custom
    .filter((_, index) => extraFlags[index])
    .map((cli): DetectedCli => ({ id: cli.id, name: '', command: cli.command }));
  return [...known, ...extra];
}
