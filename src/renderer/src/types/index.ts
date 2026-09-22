export type TaskStatus = 'running' | 'idle' | 'waiting' | 'stopped';

export interface TaskSession {
  id: string;              // 任务唯一ID（对应底层的 ptyId）
  groupId: string;         // 所属 CLI 分组ID
  title: string;           // 任务名称，例如 "Task 1: Auth Refactor"
  status: TaskStatus;      // 运行状态
  cwd: string;             // 执行工作目录
  createdAt: number;       // 创建时间戳
}

export interface CliGroup {
  id: string;              // 分组ID，如 "codex", "kimi", "opencode", "claude", "shell"
  name: string;            // 组名，如 "Codex", "Kimi Code"
  icon: 'codex' | 'kimi' | 'opencode' | 'claude' | 'terminal'; // 品牌专属 Logo
  defaultCommand: string;  // 默认拉起命令模版
  isExpanded: boolean;     // 是否展开子任务列表
  tasks: TaskSession[];    // 子任务列表
}

export interface AppSettings {
  terminalFontSize: number;   // 终端代码字体大小 (12 ~ 24, 默认 15)
  terminalLineHeight: number; // 终端行高 (1.2 ~ 1.6, 默认 1.3)
  uiScale: 'compact' | 'standard' | 'comfortable' | 'large'; // 界面全局字体缩放
}

export interface QuotaData {
  cliId: string;                 // 'kimi' | 'codex' | 'claude' | 'opencode'
  cliName: string;               // 'Kimi Code' | 'Codex' ...
  model?: string;                // 如 'gpt-5.5' | 'k3' | 'claude-3.7-sonnet'
  planType?: string;             // 如 'Plus' | 'Pro'
  fiveHourPercent: number;       // 5小时配额剩余百分比（0-100）
  fiveHourResetsIn: string;      // 5小时配额重置倒计时（例如 "2h 45m"）
  sevenDayPercent: number;       // 7天配额剩余百分比（0-100）
  sevenDayResetsOn: string;      // 7天配额重置日（例如 "Resets Sun"）
  lastUpdated: number;           // 最后更新时间戳
  status: 'normal' | 'warning' | 'critical' | 'offline';
  message?: string;
}

export interface ElectronTerminalAPI {
  createSession: (options: { id: string; command?: string; cwd?: string }) => Promise<{ success: boolean; buffer?: string; error?: string }>;
  getSessionBuffer: (id: string) => Promise<string>;
  writeSession: (id: string, data: string) => Promise<void>;
  resizeSession: (id: string, cols: number, rows: number) => Promise<void>;
  killSession: (id: string) => Promise<void>;
  onSessionData: (callback: (event: { id: string; data: string }) => void) => () => void;
  onSessionExit: (callback: (event: { id: string; exitCode: number }) => void) => () => void;
  getQuota: (cliId?: string) => Promise<QuotaData>;
  getAllQuotas: () => Promise<Record<string, QuotaData>>;
  refreshQuota: (cliId?: string) => Promise<Record<string, QuotaData>>;
  onQuotaUpdate: (callback: (quotas: Record<string, QuotaData>) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronTerminalAPI;
  }
}
