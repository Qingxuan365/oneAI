export type AccountCliId = 'codex' | 'claude' | 'kimi';

export interface SessionAccount {
  cliId: AccountCliId;
  configDir: string;
  env?: Record<string, string>;
}

export interface LoginStatus {
  loggedIn: boolean | null;  // null：命令输出无法识别
  detail?: string;           // 可显示的补充信息，如 Claude 返回的邮箱；无则缺省
}

export interface HistoryEntry {
  id: string;
  cliId: 'claude' | 'codex' | 'kimi';
  title: string;
  cwd: string;
  updatedAt: number;
  command: string;           // 恢复该会话的完整启动命令
  accountId?: string;        // 非默认账号时携带账号配置 id；默认账号缺省
  accountName?: string;      // 非默认账号时携带账号名称
}

export interface HistoryAccountRef {
  id: string;
  name: string;
  cliId: string;
  configDir: string;
}

export interface QuotaGroupSnapshot {
  group: string;
  fiveHourPercent: number;
  fiveHourResetsIn: string;
  sevenDayPercent: number;
  sevenDayResetsOn: string;
}

export interface QuotaData {
  cliId: string;
  cliName: string;
  model?: string;
  effort?: string;           // 推理思考等级: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  planType?: string;
  tokens?: number;           // 最近活跃会话累计 token（输入 + 输出 + 缓存读写），无数据时缺省
  tokenInput?: number;       // 最近活跃会话累计未命中缓存输入 token，无数据时缺省
  tokenOutput?: number;      // 最近活跃会话累计输出 token，无数据时缺省
  tokenCache?: number;       // 最近活跃会话累计缓存 token（缓存读 + 缓存写），无数据时缺省
  cacheHitPercent?: number;  // 最近活跃会话缓存命中率（0-100），无数据时缺省
  ctxPercent?: number;       // 最近活跃会话当前上下文占用百分比（0-100），无数据时缺省
  ctxTokens?: number;        // 最近活跃会话当前上下文 token 数，无数据时缺省
  ctxWindow?: number;        // 当前模型上下文窗口上限（token），仅在 CLI 明确提供时填写
  costUsd?: number;          // 最近活跃会话累计费用（美元），Claude Code / Pi 提供
  sessionId?: string;        // 提供会话级字段的日志或快照标识
  sessionScope?: 'task' | 'latest';
  ctxEstimated?: boolean;
  fiveHourPercent: number;   // 5h remaining pct (0-100)，未知为 -1
  fiveHourResetsIn: string;  // e.g. "2h 45m"
  fiveHourResetAt?: number; // Unix 时间戳，单位毫秒
  sevenDayPercent: number;   // 7d remaining pct (0-100)，未知为 -1
  sevenDayResetsOn: string;  // e.g. "4d 2h 47m"
  sevenDayResetAt?: number;  // Unix 时间戳，单位毫秒
  quotaGroups?: QuotaGroupSnapshot[]; // 同一账号下的多组独立额度（如 Antigravity 的 Gemini / Claude / Argon 分组）
  lastUpdated: number;
  status: 'normal' | 'warning' | 'critical' | 'offline';
  message?: string;
}

export type TaskSessionUsage = Pick<QuotaData, 'model' | 'effort' | 'tokens' | 'tokenInput' | 'tokenOutput' | 'tokenCache' | 'cacheHitPercent' | 'ctxPercent' | 'ctxTokens' | 'ctxWindow' | 'costUsd'>;

export interface TaskSummary {
  text: string | null;
  sessionId?: string;
  usage?: TaskSessionUsage;
  usageScope?: QuotaData['sessionScope'];
}

export type UsageCli = 'claude' | 'codex' | 'agy' | 'pi';

export interface UsageRow {
  cliId: UsageCli;
  accountId: string;         // OneAI 账号 id；默认账号为 'default'
  accountName: string;       // 账号名，默认账号为「默认账号」
  model: string;
  requests: number;          // 请求数：一次模型回复算一次
  sessions: number;          // 本周内出现过该模型回复的会话数
  subagent?: boolean;        // CLI 自动发起的子会话（如 Codex 自动审查），不是用户选用的模型
  input: number;             // 未命中缓存的输入 tokens
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface UsageDay {
  date: string;              // 本地日期 YYYY-MM-DD
  requests: number;
  by: Record<string, number>; // 键为 `${cliId}:${accountId}`，值为当天该 CLI 账号的请求数
}

export interface UsageAccountInfo {
  cliId: UsageCli;
  accountId: string;
  name: string;
}

export interface UsageStats {
  generatedAt: number;
  weekStart: number;         // 本周周一 00:00（本地时间）的毫秒时间戳
  accounts: UsageAccountInfo[]; // 统计范围内出现过用量的 CLI 账号
  rows: UsageRow[];          // 本周各 CLI × 账号 × 模型，按 tokens 降序
  days: UsageDay[];          // 周一对齐、连续的每日请求数，到本周周日为止
}

export interface DashboardSessionMeta {
  id: number;
  cliId: UsageCli;
  accountId: string;
  accountName: string;
  project: string;           // 归一化项目键（normalizePathKey），无 cwd 时为空串
  projectPath: string;
  projectName: string;
}

export interface DashboardDailyRecord {
  s: number;                 // 对应 sessions 中的 id
  date: string;              // 本地日期 YYYY-MM-DD
  model: string;
  modelId?: string;
  subagent?: boolean;
  requests: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  costPriced: boolean;
  pricedTokens?: number;
}

export interface DashboardProjectInfo {
  key: string;
  path: string;
  name: string;
}

export interface DashboardStats {
  generatedAt: number;
  timezone: string;
  earliestDate: string | null;
  accounts: UsageAccountInfo[];
  projects: DashboardProjectInfo[];
  sessions: DashboardSessionMeta[];
  records: DashboardDailyRecord[];
}

export interface UsageAccountRef {
  id: string;
  name: string;
  cliId: string;
  configDir: string;
}

export interface SystemStats {
  cpuPercent: number;
  gpuPercent: number | null;
  memUsedBytes: number;
  memTotalBytes: number;
  netUpBytesPerSec: number | null;
  netDownBytesPerSec: number | null;
}

export type FilePreviewResult =
  | { kind: 'text'; path: string; size: number; content: string }
  | { kind: 'image'; path: string; size: number; dataUrl: string }
  | { kind: 'binary' | 'too-large' | 'error'; path: string; size?: number; message?: string };

export interface DirectoryTreeEntry {
  name: string;
  relPath: string;   // 相对于项目根目录的正斜杠路径
  fullPath: string;  // 解析后的原生绝对路径，供文件预览与在资源管理器中定位
  isDir: boolean;
  dimmed?: boolean;  // 隐藏文件/目录或常见构建/依赖目录（如 node_modules、.git、dist）
}

export interface DirectoryListResult {
  ok: boolean;
  rootPath: string;
  dirPath: string;
  entries: DirectoryTreeEntry[];
  truncated?: boolean;
  totalCount?: number;
  error?: string;
}

export type GitLocalBranchesResult =
  | { ok: true; branches: string[]; currentBranch: string | null }
  | { ok: false; error: string };

export type GitBranchSwitchResult = { ok: true } | { ok: false; error: string; currentBranch?: string };

export type GitConflictFilesResult = { ok: true; files: string[] } | { ok: false; error: string };
export type GitConflictDiffResult = { ok: true; diff: string } | { ok: false; error: string };

export type GitChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

export interface GitStatusEntry {
  path: string;
  originalPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  status: GitChangeStatus;
}

export type GitStatusResult =
  | {
      ok: true;
      branch: string | null;
      entries: GitStatusEntry[];
      hasConflicts: boolean;
      truncated?: boolean;
      totalCount?: number;
    }
  | { ok: false; error: string };

export type GitChangeDiffResult = { ok: true; diff: string } | { ok: false; error: string };

export type GitCommitResult =
  | { ok: true; hash: string; summary: string }
  | { ok: false; error: string };

export interface SessionCreateResult {
  success: boolean;
  reused?: boolean;
  buffer?: string;
  error?: string;
}

export interface SessionSnapshot {
  buffer: string;
  seq: number;
  alive: boolean;
  exitCode?: number;
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  releaseDate?: string;
  releaseUrl: string;
  /** 安装版可应用内直接下载并覆盖安装；开发模式或便携版仅支持检测并跳转浏览器下载 */
  canAutoUpdate: boolean;
  progress?: UpdateProgress;
  error?: string;
  checkedAt?: number;
}

export interface CliInstallerMeta {
  featuredOrder: number;
  powershellCommand: string;
  docsUrl: string;
  requiresGit?: boolean;
  requiresNode?: boolean;
  minNodeVersion?: string;
}

export interface KnownCliInfo {
  id: string;
  name: string;
  command: string;
  aliases?: string[];
  installer?: CliInstallerMeta;
}

export type CliInstallPhase = 'idle' | 'queued' | 'installing' | 'done' | 'error' | 'canceled';

export interface CliInstallOutcome {
  ok: boolean;
  alreadyInstalled?: boolean;
  detectedAfterInstall?: boolean;
  canceled?: boolean;
  error?: string;
}

export type CliInstallEvent =
  | { type: 'status'; cliId: string; status: CliInstallPhase; error?: string; detectedAfterInstall?: boolean }
  | { type: 'log'; cliId: string; chunk: string }
  | { type: 'complete'; results: Record<string, CliInstallOutcome>; installedIds: string[] };

export interface CliInstallBatchResult {
  ok: boolean;
  error?: string;
  results?: Record<string, CliInstallOutcome>;
  installedIds?: string[];
}

export interface CliEnvironmentInfo {
  hasGit: boolean;
  hasNode: boolean;
  nodeVersion?: string;
  platform: string;
}

/** 全部内置主题 ID 单一事实源；新增主题须同步 themes.ts、index.css、index.html 与 TerminalViewport.tsx */
export const THEME_IDS = [
  'light', 'dark', 'bean', 'parchment', 'dusk', 'nord', 'lavender', 'mist', 'forest', 'ink',
  'darcula', 'material', 'monokai', 'mariana', 'breakers', 'solarized-dark', 'solarized-light', 'cobalt',
  'idea-classic-light', 'idea-light', 'idea-dark', 'idea-contrast',
  'kiro-dark', 'kiro-light', 'one-dark',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];
