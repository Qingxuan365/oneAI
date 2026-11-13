import { CliDef, TaskSession } from './types';

export const DEFAULT_WORKSPACE_PATH = 'd:\\GitHub\\OneAI';

/** 内置 CLI 定义（绑定各 AI CLI 的真实执行命令），顺序即默认菜单顺序 */
export const BUILTIN_CLIS: CliDef[] = [
  { id: 'codex', name: 'Codex', icon: 'codex', defaultCommand: 'codex' },
  { id: 'claude', name: 'Claude Code', icon: 'claude', defaultCommand: 'claude' },
  { id: 'kimi', name: 'Kimi Code', icon: 'kimi', defaultCommand: 'kimi' },
  { id: 'opencode', name: 'OpenCode', icon: 'opencode', defaultCommand: 'opencode' },
  { id: 'grok', name: 'Grok Build', icon: 'grok', defaultCommand: 'grok' },
  { id: 'terminal', name: '系统终端', icon: 'terminal', defaultCommand: 'powershell.exe' },
];

/** 首次启动（没有任何已保存状态）时在默认文件夹里放的示例任务 */
export function seedTasks(now = Date.now()): TaskSession[] {
  const seed = (id: string, groupId: string, title: string, ageMinutes: number): TaskSession => ({
    id, groupId, title, status: 'stopped', cwd: DEFAULT_WORKSPACE_PATH, createdAt: now - ageMinutes * 60_000,
  });
  return [
    seed('codex-task-1', 'codex', 'Task 1: Codex CLI', 30),
    seed('claude-task-1', 'claude', 'Task 1: Claude CLI', 15),
    seed('kimi-task-1', 'kimi', 'Task 1: Kimi CLI', 5),
    seed('opencode-task-1', 'opencode', 'Task 1: OpenCode CLI', 1),
    seed('grok-task-1', 'grok', 'Task 1: Grok Build', 2),
    seed('terminal-task-1', 'terminal', 'Task 1: PowerShell', 0),
  ];
}
