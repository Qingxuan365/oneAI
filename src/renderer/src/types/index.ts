import type {
  AccountCliId,
  FilePreviewResult,
  HistoryAccountRef,
  HistoryEntry,
  LoginStatus,
  QuotaData,
  SessionAccount,
  SessionSnapshot,
  SystemStats,
  ThemeId,
  UsageAccountInfo,
  UsageAccountRef,
  UsageCli,
  UsageDay,
  UsageRow,
  UsageStats,
} from '../../../shared/types';
import { THEME_IDS } from '../../../shared/types';

export { THEME_IDS };
export type {
  AccountCliId,
  FilePreviewResult,
  HistoryAccountRef,
  HistoryEntry,
  LoginStatus,
  QuotaData,
  SessionAccount,
  SessionSnapshot,
  SystemStats,
  ThemeId,
  UsageAccountInfo,
  UsageAccountRef,
  UsageCli,
  UsageDay,
  UsageRow,
  UsageStats,
};

export type TaskStatus = 'starting' | 'running' | 'idle' | 'stopped' | 'error';

export interface TaskSession {
  id: string;              // 任务唯一ID（对应底层的 ptyId）
  groupId: string;         // 所属 CLI 的 ID（对应 CliDef.id）
  title: string;           // 任务名称，例如 "Task 1: Auth Refactor"
  status: TaskStatus;      // 运行状态
  cwd: string;             // 执行工作目录
  command?: string;        // 该任务使用的启动命令
  errorMessage?: string;   // 启动失败原因
  historyId?: string;      // 由历史会话恢复时的 CLI 会话 ID
  accountId?: string;      // 使用的账号配置 ID（AppSettings.accounts），缺省为 CLI 的默认账号
  createdAt: number;       // 创建时间戳
}

/** 多账号：每个账号是一个独立的 CLI 配置目录（登录凭据与会话记录都在其中），目前支持 Codex、Claude Code 与 Kimi Code */
export interface Account {
  id: string;
  cliId: AccountCliId;
  name: string;
  configDir: string;       // 绝对路径；Codex 对应 CODEX_HOME，Claude Code 对应 CLAUDE_CONFIG_DIR，Kimi Code 对应 KIMI_CODE_HOME
  env?: string;            // 附加环境变量，每行 KEY=VALUE
}

/** CLI 定义：图标、默认命令；任务按其 groupId（即 CLI id）关联到这里 */
export interface CliDef {
  id: string;              // 如 "codex", "kimi", "opencode", "claude", "grok", "terminal"
  name: string;            // 显示名称，如 "Codex", "Kimi Code"
  icon: string;            // 品牌专属 Logo，未内置的 CLI 回退为通用终端图标
  defaultCommand: string;  // 默认拉起命令模版
  custom?: boolean;        // 用户在「设置 → CLI」里自定义的 CLI：启动时整条命令交给 PowerShell 解析
}

/** 用户自定义的 CLI（AppSettings.customClis）：名称与完整启动命令，没有品牌图标，用通用终端图标 */
export interface CustomCli {
  id: string;
  name: string;
  command: string;         // 完整启动命令，可带参数，如 `mycli --model x`
}

// 在线音乐：一个音频直链、电台流或 .m3u / .pls 歌单地址；name 为空时播放器用网址主机名代替
export interface MusicStream {
  id: string;
  name: string;
  url: string;
}

/** 侧栏中的一个工作文件夹；任务按 cwd 归属到文件夹，文件夹按此数组顺序显示 */
export interface FolderEntry {
  path: string;            // 首次出现时的原始路径（保留大小写），比较时用 folderKey 归一化
  isExpanded: boolean;
}

export interface AppSettings {
  language: 'zh-CN' | 'en'; // 界面语言：首次启动按系统语言预选，在首次引导里确认，之后可在设置 → 外观 切换
  onboardingDone: boolean; // 首次引导（选择语言、认识各入口）是否已完成；完成后不再弹出
  theme: 'system' | ThemeId; // 应用主题，默认跟随系统（仅在 light / dark 间切换）
  voiceReminderEnabled: boolean; // 工作满提醒时长时是否语音播报
  taskDoneSoundEnabled: boolean; // 任务由运行转为空闲（输出停止）时播放提示音，默认 false
  taskDoneSoundVolume: number; // 提示音音量 (0 ~ 100, 默认 60)
  taskDoneSoundBackgroundOnly: boolean; // 仅当该任务不在当前视窗（非当前任务或窗口失焦）时才响，默认 true
  workReminderHours: number; // 工作时长提醒的间隔小时数，默认 1（1 ~ 12 的整数）
  terminalFontSize: number;   // 终端代码字体大小 (12 ~ 24, 默认 15)
  terminalLineHeight: number; // 终端行高 (1.2 ~ 1.6, 默认 1.3)
  uiScale: 'compact' | 'standard' | 'comfortable' | 'large'; // 界面全局字体缩放
  terminalCursorStyle: 'bar' | 'block' | 'underline'; // 终端光标样式 (默认 'bar')
  terminalCursorBlink: boolean; // 终端光标闪烁 (默认 true)
  terminalLinkClick: boolean; // 终端链接无需按住 Ctrl，单击即打开，默认 false
  terminalSmoothScroll: boolean; // 终端滚轮 / 翻页滚动带缓动动画（约 120ms），默认 false
  previewMinimap: boolean; // 文件预览面板右侧是否显示代码缩略图（minimap），默认 true
  musicDirectory: string; // 顶栏音乐播放目录，空字符串表示系统「音乐」目录
  musicPlayerVisible: boolean; // 侧栏底部是否显示音乐播放器，默认 true
  musicStreams: MusicStream[]; // 用户添加的在线音乐（音频直链、电台流、.m3u / .pls 歌单），默认空；「恢复默认设置」不会清空
  clockOffsetHours: number; // 顶栏时钟相对系统时间增加的小时数，默认 0（-24 ~ 24 的整数）
  topbarDateVisible: boolean; // 窗口最大化时顶栏时钟是否显示年月日（含农历）与星期，默认 true
  accounts: Account[]; // 多账号配置（Codex / Claude Code / Kimi Code），默认空；「恢复默认设置」不会清空
  customClis: CustomCli[]; // 用户自定义的 CLI，默认空；「恢复默认设置」不会清空
}

export interface RestartSessionOptions {
  command?: string;
  cwd?: string;
  shell?: boolean;
  account?: SessionAccount;
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
  getMusicTrackUrl?: (filePath: string) => string;
  selectMusicDirectory?: (currentPath?: string) => Promise<string | null>;
  resolveMusicStream?: (url: string) => Promise<Array<{ name: string; url: string }>>;
  getPathForFile?: (file: File) => string;
  readPasteContent?: () => Promise<{ type: 'text' | 'file-path' | 'image-path' | 'none'; content: string }>;
  writeClipboardText?: (text: string) => Promise<boolean>;
  loadWorkspaceState?: () => string | null;
  saveWorkspaceState?: (json: string) => void;
  listSessionHistory: (accounts?: HistoryAccountRef[]) => Promise<HistoryEntry[]>;
  deleteSessionHistory: (items: Array<{ cliId: HistoryEntry['cliId']; id: string; accountId?: string }>) => Promise<{ deleted: number; failed: number }>;
  /** 本周各 CLI × 模型的用量与每日请求数（Claude Code / Codex / Antigravity / Pi）；accounts 为需要一并统计的账号配置目录 */
  getUsageStats?: (accounts: UsageAccountRef[]) => Promise<UsageStats>;
  /** 主进程里的已知 CLI 清单（设置 → CLI 显示用），不是写死在界面里 */
  listKnownClis?: () => Promise<Array<{ id: string; name: string; command: string }>>;
  /** 通知主进程当前界面语言，主进程里会显示到界面的文案（错误、额度提示等）跟随它 */
  setLanguage?: (language: string) => Promise<void>;
  /** 当前用户的主目录，新用户首次启动时作为默认文件夹 */
  getHomeDir?: () => string;
  /** 按 PATH 检测已安装的 CLI；custom 为用户自定义 CLI，检测到的会一并返回（name 为空） */
  detectClis: (custom?: Array<{ id: string; command: string }>) => Promise<Array<{ id: string; name: string; command: string }>>;
  createSession: (options: { id: string; command?: string; cwd?: string; shell?: boolean; account?: SessionAccount; cols?: number; rows?: number }) => Promise<{ success: boolean; buffer?: string; error?: string }>;
  getSessionBuffer: (id: string) => Promise<string>;
  getSessionSnapshot?: (id: string) => Promise<SessionSnapshot>;
  /** 会话不存在（已退出或尚未启动）时返回 false */
  writeSession: (id: string, data: string) => Promise<boolean>;
  resizeSession: (id: string, cols: number, rows: number) => Promise<void>;
  killSession: (id: string) => Promise<void>;
  restartSession?: (id: string, options?: RestartSessionOptions) => Promise<{ success: boolean; buffer?: string; error?: string }>;
  clearSessionBuffer?: (id: string) => Promise<boolean>;
  setActiveSession?: (id: string | null, cliId?: string | null) => void;
  resolvePreviewPaths?: (cwd: string, candidates: string[]) => Promise<Array<string | null>>;
  allowDroppedPreview?: (paths: string[]) => Promise<boolean>;
  readPreviewFile?: (cwd: string, filePath: string) => Promise<FilePreviewResult>;
  openExternal?: (url: string) => Promise<boolean>;
  /** 在资源管理器中打开文件夹，目录不存在时返回 false */
  openDirectory?: (dir: string) => Promise<boolean>;
  saveLogFile?: (defaultName: string, content: string) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
  onSessionData: (callback: (event: { id: string; data: string; seq?: number }) => void) => () => void;
  onSessionExit: (callback: (event: { id: string; exitCode: number }) => void) => () => void;
  getQuota: (cliId?: string) => Promise<QuotaData>;
  getAllQuotas: () => Promise<Record<string, QuotaData>>;
  refreshQuota: (cliId?: string) => Promise<Record<string, QuotaData>>;
  /** 同步账号列表给额度服务；账号的额度以账号 id 为键，与默认账号（键为 cliId）并列返回 */
  setQuotaAccounts?: (accounts: Array<{ key: string; cliId: string; configDir: string }>) => Promise<void>;
  /** 窗口控件覆盖层的颜色与高度，随主题与界面缩放同步 */
  setTitleBarOverlay?: (opts: { color: string; symbolColor: string; height: number; backgroundColor?: string }) => void;
  /** 读取任务对应会话里最近一条用户消息（仅 Claude / Codex / Kimi）；text 为 null 表示还没有消息 */
  getTaskSummaries?: (tasks: Array<{ id: string; cliId: string; cwd: string; createdAt: number; historyId?: string; configDir?: string }>) => Promise<Record<string, { text: string | null }>>;
  /** 读取各文件夹所在 Git 仓库的当前分支（只读 .git/HEAD）；不在仓库内为 null */
  getGitBranches?: (paths: string[]) => Promise<Record<string, string | null>>;
  /** 在该账号的环境下运行 CLI 的状态命令，判断是否已登录 */
  checkAccountLogin?: (account: SessionAccount) => Promise<LoginStatus | { error: string }>;
  onQuotaUpdate: (callback: (quotas: Record<string, QuotaData>) => void) => () => void;
  onSystemStats: (callback: (stats: SystemStats) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronTerminalAPI;
  }
}
