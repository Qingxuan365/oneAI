import { CliDef } from './types';
import { t } from './i18n';

/** 没有活动任务、也没有保存过文件夹时，新任务默认使用的文件夹：本机用户主目录（由主进程提供） */
export function defaultWorkspacePath(): string {
  try { return window.electronAPI?.getHomeDir?.() || ''; } catch { return ''; }
}

/** 统一按 CLI 显示名称首字母顺序排序；系统终端（id === 'terminal'）固定排在最后 */
export function sortClisAlphabetically<T extends { id: string; name: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.id === 'terminal' && b.id !== 'terminal') return 1;
    if (b.id === 'terminal' && a.id !== 'terminal') return -1;
    const byName = a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
    return byName !== 0 ? byName : a.id.localeCompare(b.id, 'en', { sensitivity: 'base' });
  });
}

/** 内置 CLI 定义（绑定各 AI CLI 的真实执行命令），按首字母顺序排列，系统终端固定在末尾 */
export const BUILTIN_CLIS: CliDef[] = [
  { id: 'claude', name: 'Claude Code', icon: 'claude', defaultCommand: 'claude' },
  { id: 'codex', name: 'Codex', icon: 'codex', defaultCommand: 'codex' },
  { id: 'grok', name: 'Grok Build', icon: 'grok', defaultCommand: 'grok' },
  { id: 'kimi', name: 'Kimi Code', icon: 'kimi', defaultCommand: 'kimi' },
  { id: 'opencode', name: 'OpenCode', icon: 'opencode', defaultCommand: 'opencode' },
  { id: 'terminal', get name() { return t('系统终端'); }, icon: 'terminal', defaultCommand: 'powershell.exe' },
];

export const MODEL_PICKER_COMMANDS: ReadonlyMap<string, string> = new Map([
  ['codex', '/model'],
  ['claude', '/model'],
  ['kimi', '/model'],
  ['opencode', '/models'],
  ['agy', '/model'],
  ['pi', '/model'],
]);
