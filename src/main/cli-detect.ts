import fs from 'node:fs';
import path from 'node:path';

export interface DetectedCli {
  id: string;
  name: string;
  command: string;
}

// 已知 AI 编程 CLI。前五个有内置品牌分组，其余检测到后自动生成通用分组。
const KNOWN_CLIS: DetectedCli[] = [
  { id: 'kimi', name: 'Kimi Code', command: 'kimi' },
  { id: 'codex', name: 'Codex', command: 'codex' },
  { id: 'claude', name: 'Claude Code', command: 'claude' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'grok', name: 'Grok Build', command: 'grok' },
  { id: 'agy', name: 'Antigravity', command: 'agy' },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen' },
  { id: 'aider', name: 'Aider', command: 'aider' },
  { id: 'cursor-agent', name: 'Cursor Agent', command: 'cursor-agent' },
  { id: 'copilot', name: 'GitHub Copilot', command: 'copilot' },
  { id: 'amp', name: 'Amp', command: 'amp' },
  { id: 'droid', name: 'Droid', command: 'droid' },
  { id: 'crush', name: 'Crush', command: 'crush' },
  { id: 'goose', name: 'Goose', command: 'goose' },
  { id: 'iflow', name: 'iFlow CLI', command: 'iflow' },
  { id: 'auggie', name: 'Auggie', command: 'auggie' },
  { id: 'kiro-cli', name: 'Kiro CLI', command: 'kiro-cli' },
  { id: 'cline', name: 'Cline', command: 'cline' },
  { id: 'pi', name: 'Pi', command: 'pi' },
];

function isInstalled(command: string): boolean {
  const dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.PS1').split(';').map((ext) => ext.toLowerCase())
    : [''];
  return dirs.some((dir) => exts.some((ext) => {
    try { return fs.statSync(path.join(dir, command + ext)).isFile(); } catch { return false; }
  }));
}

// 按 PATH 检测已安装的 AI CLI，只返回已安装项
export function detectInstalledClis(): DetectedCli[] {
  return KNOWN_CLIS.filter((cli) => isInstalled(cli.command));
}
