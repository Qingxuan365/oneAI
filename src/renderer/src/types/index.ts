export type TaskStatus = 'starting' | 'running' | 'idle' | 'waiting' | 'stopped' | 'error';

export interface TaskSession {
  id: string;              // 任务唯一ID（对应底层的 ptyId）
  groupId: string;         // 所属 CLI 分组ID
  title: string;           // 任务名称，例如 "Task 1: Auth Refactor"
  status: TaskStatus;      // 运行状态
  cwd: string;             // 执行工作目录
  command?: string;        // 该任务使用的启动命令
  errorMessage?: string;   // 启动失败原因
  historyId?: string;      // 由历史会话恢复时的 CLI 会话 ID
  createdAt: number;       // 创建时间戳
}

export interface HistoryEntry {
  id: string;
  cliId: 'claude' | 'codex' | 'kimi';
  title: string;
  cwd: string;
  updatedAt: number;
  command: string;
}

export interface CliGroup {
  id: string;              // 分组ID，如 "codex", "kimi", "opencode", "claude", "grok", "shell"
  name: string;            // 组名，如 "Codex", "Kimi Code", "Grok"
  icon: string;            // 品牌专属 Logo，未内置的 CLI 回退为通用终端图标
  defaultCommand: string;  // 默认拉起命令模版
  isExpanded: boolean;     // 是否展开子任务列表
  tasks: TaskSession[];    // 子任务列表
}

// 具体主题 id；bean 豆沙绿、parchment 羊皮纸、dusk 暖夜、nord 北极灰蓝为护眼主题
export type ThemeId = 'light' | 'dark' | 'bean' | 'parchment' | 'dusk' | 'nord';

export interface AppSettings {
  theme: 'system' | ThemeId; // 应用主题，默认跟随系统（仅在 light / dark 间切换）
  voiceReminderEnabled: boolean; // 工作满提醒时长时是否语音播报
  workReminderHours: number; // 工作时长提醒的间隔小时数，默认 1（1 ~ 12 的整数）
  terminalFontSize: number;   // 终端代码字体大小 (12 ~ 24, 默认 15)
  terminalLineHeight: number; // 终端行高 (1.2 ~ 1.6, 默认 1.3)
  uiScale: 'compact' | 'standard' | 'comfortable' | 'large'; // 界面全局字体缩放
  terminalCursorStyle: 'bar' | 'block' | 'underline'; // 终端光标样式 (默认 'bar')
  terminalCursorBlink: boolean; // 终端光标闪烁 (默认 true)
  musicDirectory: string; // 顶栏音乐播放目录，空字符串表示系统「音乐」目录
  musicPlayerVisible: boolean; // 侧栏底部是否显示音乐播放器，默认 true
  clockOffsetHours: number; // 顶栏时钟相对系统时间增加的小时数，默认 0（-24 ~ 24 的整数）
}

export interface QuotaData {
  cliId: string;                 // 'kimi' | 'codex' | 'claude' | 'opencode' | 'grok'
  cliName: string;               // 'Kimi Code' | 'Codex' | 'Grok' ...
  model?: string;                // 如 'deepseek-v4-pro' | 'gpt-5.5'
  effort?: string;               // 推理思考等级: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
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
  isWindowMaximized: () => Promise<boolean>;
  onWindowMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
  /** 关闭窗口时仍有终端进程在运行，主进程请求界面确认；参数为运行中的进程数 */
  onWindowCloseRequest?: (callback: (aliveCount: number) => void) => () => void;
  confirmWindowClose?: () => void;
  cancelWindowClose?: () => void;
  selectWorkspaceDirectory?: (currentPath?: string) => Promise<string | null>;
  listMusic?: (dir?: string) => Promise<{ directory: string; tracks: Array<{ name: string; path: string }> }>;
  readMusic?: (filePath: string) => Promise<Uint8Array | null>;
  selectMusicDirectory?: (currentPath?: string) => Promise<string | null>;
  getPathForFile?: (file: File) => string;
  readPasteContent?: () => Promise<{ type: 'text' | 'file-path' | 'image-path' | 'none'; content: string }>;
  writeClipboardText?: (text: string) => Promise<boolean>;
  loadWorkspaceState?: () => string | null;
  saveWorkspaceState?: (json: string) => void;
  listSessionHistory: () => Promise<HistoryEntry[]>;
  deleteSessionHistory: (items: Array<{ cliId: HistoryEntry['cliId']; id: string }>) => Promise<{ deleted: number; failed: number }>;
  detectClis: () => Promise<Array<{ id: string; name: string; command: string }>>;
  createSession: (options: { id: string; command?: string; cwd?: string }) => Promise<{ success: boolean; buffer?: string; error?: string }>;
  getSessionBuffer: (id: string) => Promise<string>;
  writeSession: (id: string, data: string) => Promise<void>;
  resizeSession: (id: string, cols: number, rows: number) => Promise<void>;
  killSession: (id: string) => Promise<void>;
  restartSession?: (id: string) => Promise<{ success: boolean; buffer?: string; error?: string }>;
  clearSessionBuffer?: (id: string) => Promise<boolean>;
  resolvePreviewPaths?: (cwd: string, candidates: string[]) => Promise<Array<string | null>>;
  readPreviewFile?: (cwd: string, filePath: string) => Promise<FilePreviewResult>;
  openExternal?: (url: string) => Promise<boolean>;
  /** 在资源管理器中打开文件夹，目录不存在时返回 false */
  openDirectory?: (dir: string) => Promise<boolean>;
  saveLogFile?: (defaultName: string, content: string) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
  onSessionData: (callback: (event: { id: string; data: string }) => void) => () => void;
  onSessionExit: (callback: (event: { id: string; exitCode: number }) => void) => () => void;
  getQuota: (cliId?: string) => Promise<QuotaData>;
  getAllQuotas: () => Promise<Record<string, QuotaData>>;
  refreshQuota: (cliId?: string) => Promise<Record<string, QuotaData>>;
  onQuotaUpdate: (callback: (quotas: Record<string, QuotaData>) => void) => () => void;
}

export type FilePreviewResult =
  | { kind: 'text'; path: string; size: number; content: string }
  | { kind: 'image'; path: string; size: number; dataUrl: string }
  | { kind: 'binary' | 'too-large' | 'error'; path: string; size?: number; message?: string };

declare global {
  interface Window {
    electronAPI: ElectronTerminalAPI;
  }
}
