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

function isFile(file: string): boolean {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

function isInstalled(command: string): boolean {
  const executable = executableOf(command);
  if (!executable) return false;
  const name = path.basename(executable);
  // Windows 上按 PATHEXT 补扩展名；不补空扩展名，避免命中 npm 同目录下无扩展名的 shell 脚本。已带扩展名（如 tool.exe）时才按原名查找
  const pathExts = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.PS1').split(';').map((ext) => ext.toLowerCase());
  const exts = process.platform !== 'win32' ? [''] : path.extname(name) ? ['', ...pathExts] : pathExts;
  // 带路径的命令直接检查该路径；否则在 PATH 各目录里找
  const dirs = /[\\/]/.test(executable)
    ? [path.dirname(executable)]
    : (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  return dirs.some((dir) => exts.some((ext) => isFile(path.join(dir, name + ext))));
}

/** 内置的已知 CLI 清单（来自 known-clis.json），设置页据此显示每个 CLI 是否已安装 */
export function listKnownClis(): DetectedCli[] {
  return KNOWN_CLIS;
}

// 按 PATH 检测已安装的 AI CLI，只返回已安装项；用户自定义的 CLI 一并检测，结果里 name 为空
export function detectInstalledClis(custom: CustomCliProbe[] = []): DetectedCli[] {
  const known = KNOWN_CLIS.filter((cli) => isInstalled(cli.command));
  const extra = custom
    .filter((cli) => cli && typeof cli.id === 'string' && typeof cli.command === 'string' && isInstalled(cli.command))
    .map((cli): DetectedCli => ({ id: cli.id, name: '', command: cli.command }));
  return [...known, ...extra];
}
