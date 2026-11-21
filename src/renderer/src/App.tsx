import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { TerminalViewport, TerminalViewportRef } from './components/TerminalViewport';
import { Modal } from './components/Modal';
import { ConfirmDialog, ConfirmOptions } from './components/ConfirmDialog';
import { BrandIcon } from './components/BrandIcon';
import { AppLogo } from './components/AppLogo';
import { CliDef, CustomCli, FolderEntry, TaskSession, QuotaData, AppSettings, ThemeId, HistoryEntry, Account } from './types';
import { BUILTIN_CLIS } from './clis';
import { SUMMARY_CLIS, formatAgo } from './taskSummary';
import { ensureFolder, folderKey, folderName, groupRecent, loadAppState, moveBefore, nextTaskTitle, orderedTasks, scheduleSaveAppState, tasksInFolder } from './workspaceState';
import { accountCli, quotaKey, sanitizeAccounts, toSessionAccount } from './accounts';
import { sanitizeCustomClis, toCliDef } from './customClis';
import { sanitizeMusicStreams } from './musicStreams';
import { getLanguage, isLanguage, setLanguage, systemLanguage, t } from './i18n';
import { THEME_MODE } from './themes';
import { hasVisibleOutput, isTaskAlive } from './taskStatus';
import { playTaskDoneSound } from './taskDoneSound';

// 低频弹窗与代码预览面板（含 highlight.js 词法表）按需异步分包加载，大幅减小首屏主包解析开销
const NewTaskModal = lazy(() => import('./components/NewTaskModal').then((m) => ({ default: m.NewTaskModal })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })));
const OnboardingModal = lazy(() => import('./components/OnboardingModal').then((m) => ({ default: m.OnboardingModal })));
const HistoryModal = lazy(() => import('./components/HistoryModal').then((m) => ({ default: m.HistoryModal })));
const UsageModal = lazy(() => import('./components/UsageModal').then((m) => ({ default: m.UsageModal })));
const FilePreviewPanel = lazy(() => import('./components/FilePreviewPanel').then((m) => ({ default: m.FilePreviewPanel })));

const DEFAULT_SETTINGS: AppSettings = {
  language: systemLanguage(),
  onboardingDone: false,
  theme: 'system',
  voiceReminderEnabled: true,
  taskDoneSoundEnabled: false,
  taskDoneSoundVolume: 60,
  taskDoneSoundBackgroundOnly: true,
  workReminderHours: 1,
  terminalFontSize: 15,
  terminalLineHeight: 1.3,
  uiScale: 'comfortable',
  terminalCursorStyle: 'bar',
  terminalCursorBlink: true,
  terminalSmoothScroll: false,
  terminalLinkClick: false,
  previewMinimap: true,
  musicDirectory: '',
  musicPlayerVisible: true,
  musicStreams: [],
  clockOffsetHours: 0,
  topbarDateVisible: true,
  accounts: [],
  customClis: [],
};

const workReminderText = (hours: number) => t('主人，您已经工作 {n} 小时了，该休息一下了。', { n: hours });
const appOpenedAt = Date.now();
// 状态点较快回到「空闲」；未读标记与提示音用更长的静默时间确认，避免长推理、工具调用间隙误报
const IDLE_AFTER_MS = 4_000;
const DONE_NOTIFY_AFTER_MS = 10_000;
const STARTUP_GRACE_MS = 5_000;
const DEFAULT_PREVIEW_WIDTH = 420;

// 启动结果转为任务状态，失败时保留原因供侧栏与终端区显示
function startOutcome(result?: { success: boolean; error?: string }): Pick<TaskSession, 'status' | 'errorMessage'> {
  return result?.success ? { status: 'idle', errorMessage: undefined } : { status: 'error', errorMessage: result?.error || t('终端启动失败') };
}

function sameHistoryEntries(a: HistoryEntry[], b: HistoryEntry[]): boolean {
  return a.length === b.length && a.every((item, i) => {
    const other = b[i];
    return item.id === other.id
      && item.cliId === other.cliId
      && item.updatedAt === other.updatedAt
      && item.title === other.title
      && item.cwd === other.cwd
      && item.command === other.command
      && item.accountId === other.accountId
      && item.accountName === other.accountName;
  });
}

function loadSavedSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('onedesktop_settings');
    if (raw) {
      const saved = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...saved, accounts: sanitizeAccounts(saved?.accounts), customClis: sanitizeCustomClis(saved?.customClis), musicStreams: sanitizeMusicStreams(saved?.musicStreams), language: isLanguage(saved?.language) ? saved.language : systemLanguage(), onboardingDone: saved?.onboardingDone === true };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

type DetectedCli = { id: string; name: string; command: string };

// 已检测到、但不在内置列表里的 CLI（如 Antigravity、Pi），自动补成可新建任务的 CLI
// 用户自定义的 CLI 也会出现在检测结果里，但它们来自设置，不能当作自动检测到的 CLI 保存进状态
function mergeDetectedExtras(current: CliDef[], detected: DetectedCli[], custom: CustomCli[]): CliDef[] {
  const extras = detected
    .filter((cli) => !BUILTIN_CLIS.some((builtin) => builtin.id === cli.id) && !current.some((item) => item.id === cli.id) && !custom.some((item) => item.id === cli.id))
    .map((cli): CliDef => ({ id: cli.id, name: cli.name, icon: cli.id, defaultCommand: cli.command }));
  return extras.length ? [...current, ...extras] : current;
}

// 启动时读取已保存的状态（旧的各工作区数据在首次启动时迁移）
const INITIAL_STATE = loadAppState();

export const App: React.FC = () => {
  const [tasks, setTasks] = useState<TaskSession[]>(INITIAL_STATE.tasks);
  const [folders, setFolders] = useState<FolderEntry[]>(INITIAL_STATE.folders);
  const [lastFolder, setLastFolder] = useState(INITIAL_STATE.lastFolder);
  const [extraClis, setExtraClis] = useState<CliDef[]>(INITIAL_STATE.extraClis);
  const reorderFolder = useCallback((sourcePath: string, targetPath: string) => {
    setFolders((current) => moveBefore(current, (folder) => folderKey(folder.path), folderKey(sourcePath), folderKey(targetPath)));
  }, []);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(INITIAL_STATE.activeTaskId);
  // 任务只能在所属文件夹内调整顺序
  const reorderTask = useCallback((sourceId: string, targetId: string) => {
    setTasks((current) => {
      const source = current.find((task) => task.id === sourceId);
      const target = current.find((task) => task.id === targetId);
      if (!source || !target || folderKey(source.cwd) !== folderKey(target.cwd)) return current;
      return moveBefore(current, (task) => task.id, sourceId, targetId);
    });
  }, []);
  // 待查看：后台任务输出停下或进程退出后，在侧栏标记，切换过去查看后清除（不持久化）
  const [unreadTaskIds, setUnreadTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const activeTaskIdRef = useRef(activeTaskId);
  activeTaskIdRef.current = activeTaskId;
  const markUnread = useCallback((ids: string[]) => {
    const background = ids.filter((id) => id !== activeTaskIdRef.current);
    if (background.length === 0) return;
    setUnreadTaskIds((prev) => (background.every((id) => prev.has(id)) ? prev : new Set([...prev, ...background])));
  }, []);
  const activeCliId = useMemo(
    () => tasks.find((task) => task.id === activeTaskId)?.groupId ?? null,
    [tasks, activeTaskId],
  );
  useEffect(() => {
    window.electronAPI?.setActiveSession?.(activeTaskId, activeCliId);
  }, [activeTaskId, activeCliId]);
  useEffect(() => {
    if (!activeTaskId || !unreadTaskIds.has(activeTaskId)) return;
    setUnreadTaskIds((prev) => {
      const next = new Set(prev);
      next.delete(activeTaskId);
      return next;
    });
  }, [activeTaskId, unreadTaskIds]);
  const [quotas, setQuotas] = useState<Record<string, QuotaData>>({});
  const [workReminderVisible, setWorkReminderVisible] = useState(false);
  const terminalViewportRef = useRef<TerminalViewportRef>(null);
  // 应用内确认 / 通知弹窗：askConfirm 返回用户的选择
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);
  const confirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const askConfirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    confirmResolveRef.current?.(false);
    confirmResolveRef.current = resolve;
    setConfirmOptions(options);
  }), []);
  const resolveConfirm = (confirmed: boolean) => {
    confirmResolveRef.current?.(confirmed);
    confirmResolveRef.current = null;
    setConfirmOptions(null);
  };
  const notify = useCallback((title: string, message: string) => askConfirm({ title, message, notice: true, confirmLabel: t('知道了') }), [askConfirm]);

  // 关闭窗口时仍有终端进程在运行：先确认，再通知主进程真正关闭
  useEffect(() => window.electronAPI?.onWindowCloseRequest?.(async (aliveCount) => {
    if (await askConfirm({
      title: t('关闭 OneAI'),
      message: t('还有 {n} 个终端进程在运行，关闭窗口会全部终止。', { n: aliveCount }),
      confirmLabel: t('关闭并终止'),
      danger: true,
    })) window.electronAPI?.confirmWindowClose?.();
    else window.electronAPI?.cancelWindowClose?.();
  }), [askConfirm]);
  // 字体与外观设置状态（自动持久化到 localStorage）
  const [settings, setSettings] = useState<AppSettings>(loadSavedSettings);
  // 先于子组件渲染切换界面语言，t() 才能在本次渲染里取到新语言的译文
  setLanguage(settings.language);
  // 任务启动：按任务绑定的账号注入配置目录；账号配置已被删除时拒绝启动，避免悄悄回落到默认账号
  const accountsRef = useRef(settings.accounts);
  accountsRef.current = settings.accounts;
  const earlyExitedIdsRef = useRef<Map<string, number>>(new Map());
  const lastOutputRef = useRef<Map<string, number>>(new Map());
  const startedAtRef = useRef<Map<string, number>>(new Map());
  const resolveTaskLaunch = useCallback((task: TaskSession, cli?: Pick<CliDef, 'defaultCommand' | 'custom'> | null) => {
    const account = task.accountId ? accountsRef.current.find((item) => item.id === task.accountId) : undefined;
    if (task.accountId && !account) {
      return {
        ok: false as const,
        error: t('该任务使用的账号配置已被删除。请关闭任务后重新新建，或在「设置 → 账号」中重新添加该账号。'),
      };
    }
    return {
      ok: true as const,
      options: {
        command: task.command || cli?.defaultCommand,
        cwd: task.cwd,
        shell: cli?.custom,
        account: account && toSessionAccount(account),
      },
    };
  }, []);
  const startSession = useCallback((task: TaskSession, cli: Pick<CliDef, 'defaultCommand' | 'custom'>) => {
    const resolved = resolveTaskLaunch(task, cli);
    if (!resolved.ok) {
      return Promise.resolve({ success: false, error: resolved.error });
    }
    return window.electronAPI.createSession({
      id: task.id,
      ...resolved.options,
    });
  }, [resolveTaskLaunch]);
  useEffect(() => {
    void window.electronAPI?.setQuotaAccounts?.(settings.accounts.map((a) => ({ key: a.id, cliId: a.cliId, configDir: a.configDir })));
  }, [settings.accounts]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const extraClisRef = useRef(extraClis);
  extraClisRef.current = extraClis;
  const customClisRef = useRef(settings.customClis);
  customClisRef.current = settings.customClis;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // 任务完成提示音：开关打开且至少有一个任务不在当前视窗（或窗口失焦）时响一声
  const notifyDoneSound = useCallback((ids: string[]) => {
    const sound = settingsRef.current;
    if (ids.length === 0 || sound.taskDoneSoundEnabled !== true) return;
    const viewing = document.hasFocus() ? activeTaskIdRef.current : null;
    const audible = sound.taskDoneSoundBackgroundOnly === false ? ids : ids.filter((id) => id !== viewing);
    if (audible.length > 0) playTaskDoneSound(sound.taskDoneSoundVolume);
  }, []);
  const voiceReminderEnabledRef = useRef(settings.voiceReminderEnabled);
  voiceReminderEnabledRef.current = settings.voiceReminderEnabled;

  const workReminderHours = Number.isFinite(settings.workReminderHours) ? Math.max(1, Math.min(12, Math.trunc(settings.workReminderHours))) : 1;

  // 从应用启动起算，每满设定的小时数提醒一次（第 N 次提醒时已工作 N × 设定小时）；改动时长后按新间隔排到下一个整倍数时刻，不补弹
  const [workedHours, setWorkedHours] = useState(workReminderHours);
  useEffect(() => {
    const interval = workReminderHours * 60 * 60 * 1000;
    let timer = 0;
    const schedule = () => {
      const elapsed = Date.now() - appOpenedAt;
      const nextCount = Math.floor(elapsed / interval) + 1;
      timer = window.setTimeout(() => {
        const hours = nextCount * workReminderHours;
        setWorkedHours(hours);
        setWorkReminderVisible(true);
        if (voiceReminderEnabledRef.current && 'speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(workReminderText(hours));
          utterance.lang = getLanguage() === 'en' ? 'en-US' : 'zh-CN';
          window.speechSynthesis.speak(utterance);
        }
        schedule();
      }, appOpenedAt + nextCount * interval - Date.now());
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [workReminderHours]);

  const [systemPrefersDark, setSystemPrefersDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const resolvedTheme: ThemeId = settings.theme === 'system'
    ? (systemPrefersDark ? 'dark' : 'light')
    : (settings.theme in THEME_MODE ? settings.theme : 'dark');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemPrefersDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = THEME_MODE[resolvedTheme];
  }, [resolvedTheme]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [filePreview, setFilePreview] = useState<{ cwd: string; path: string; line?: number; openedAt: number } | null>(null);
  const [previewWidth, setPreviewWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('oneai_preview_width'));
      return Number.isFinite(saved) && saved >= 280 && saved <= 2400 ? saved : DEFAULT_PREVIEW_WIDTH;
    } catch { return DEFAULT_PREVIEW_WIDTH; }
  });
  // null 表示尚未检测完成（或非 Electron 预览），此时显示全部分组
  const [installed, setInstalled] = useState<Record<string, boolean> | null>(null);
  const customClis = settings.customClis;
  const allClis = useMemo(() => [...BUILTIN_CLIS, ...extraClis, ...customClis.map(toCliDef)], [extraClis, customClis]);
  const visibleClis = useMemo(
    () => installed ? allClis.filter((cli) => cli.id === 'terminal' || installed[cli.id]) : allClis,
    [allClis, installed],
  );
  // 未安装 CLI 的任务不在侧栏显示，也不参与 Ctrl+Tab / Ctrl+数字
  const visibleTasks = useMemo(() => {
    const ids = new Set(visibleClis.map((cli) => cli.id));
    return tasks.filter((task) => ids.has(task.groupId));
  }, [tasks, visibleClis]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('oneai_sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(() => {
    try {
      const saved = Number(localStorage.getItem('oneai_sidebar_width'));
      return Number.isFinite(saved) && saved >= 240 && saved <= 480 ? saved : null;
    } catch { return null; }
  });

  // 弹窗状态
  const [newTaskContext, setNewTaskContext] = useState<{ folderPath: string; cliId?: string; accountId?: string } | null>(null);
  const isNewTaskOpen = newTaskContext !== null;

  // 动态应用全局 UI 界面缩放比例
  useEffect(() => {
    const scaleMap: Record<AppSettings['uiScale'], string> = {
      compact: '14.5px',      // 90%
      standard: '16px',       // 100%
      comfortable: '17.5px',  // 110% (推荐默认)
      large: '20px',          // 125%
    };
    document.documentElement.style.fontSize = scaleMap[settings.uiScale] || '17.5px';
    try {
      localStorage.setItem('onedesktop_settings', JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    scheduleSaveAppState({ tasks, folders, activeTaskId, lastFolder, extraClis });
  }, [tasks, folders, activeTaskId, lastFolder, extraClis]);

  useEffect(() => {
    try { localStorage.setItem('oneai_sidebar_collapsed', String(isSidebarCollapsed)); } catch {}
  }, [isSidebarCollapsed]);

  useEffect(() => {
    try {
      if (sidebarWidth === null) localStorage.removeItem('oneai_sidebar_width');
      else localStorage.setItem('oneai_sidebar_width', String(sidebarWidth));
    } catch {}
  }, [sidebarWidth]);

  useEffect(() => {
    try { localStorage.setItem('oneai_preview_width', String(previewWidth)); } catch {}
  }, [previewWidth]);

  // 全局快捷键缩放终端字体（Ctrl + / Ctrl - / Ctrl 0）。在捕获阶段处理并阻止继续传播：
  // 冒泡阶段时 xterm 已把 Ctrl+- 转成 \x1f（Ctrl+_，多数 CLI 的「撤销」）发给 CLI。排除 Alt，避免 AltGr 组合被误判
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && ['=', '+', '-', '0'].includes(e.key)) e.stopPropagation();
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setSettings((prev) => ({
            ...prev,
            terminalFontSize: Math.min(24, prev.terminalFontSize + 1),
          }));
        } else if (e.key === '-') {
          e.preventDefault();
          setSettings((prev) => ({
            ...prev,
            terminalFontSize: Math.max(12, prev.terminalFontSize - 1),
          }));
        } else if (e.key === '0') {
          e.preventDefault();
          setSettings((prev) => ({
            ...prev,
            terminalFontSize: 15,
          }));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const allTasks = tasks;

  // 当前激活的任务与对应的 CLI
  const activeTask = useMemo(() => {
    return tasks.find((t) => t.id === activeTaskId) || null;
  }, [tasks, activeTaskId]);

  const currentGroup = useMemo(() => {
    if (!activeTask) return null;
    return allClis.find((cli) => cli.id === activeTask.groupId) || null;
  }, [allClis, activeTask]);

  // 没有活动任务时，新建任务默认使用的文件夹
  const workspacePath = activeTask?.cwd ?? lastFolder;
  useEffect(() => {
    if (activeTask) setLastFolder(activeTask.cwd);
  }, [activeTask?.cwd]);

  // 当前选中 CLI 对应的实时配额
  const currentQuota = useMemo(() => {
    if (!currentGroup) return null;
    return quotas[quotaKey(currentGroup.id, activeTask?.accountId)] || null;
  }, [quotas, currentGroup, activeTask?.accountId]);

  // 初始化拉取各 CLI 真实配额与订阅后台推送
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getAllQuotas().then((all) => {
        if (all) setQuotas(all);
      });
      // 主进程每次刷新都会推送（Claude statusLine 快照一更新就推），多数时候只有 lastUpdated 变化；
      // 内容未变时保留原对象，避免整个界面重渲染
      const contentKey = (all: Record<string, QuotaData>) => JSON.stringify(all, (key, value) => (key === 'lastUpdated' ? undefined : value));
      const unsub = window.electronAPI.onQuotaUpdate((updatedQuotas) => {
        if (!updatedQuotas) return;
        setQuotas((prev) => (contentKey(prev) === contentKey(updatedQuotas) ? prev : updatedQuotas));
      });
      return () => unsub();
    } else {
      // 浏览器独立预览调试降级数据
      setQuotas({
        kimi: {
          cliId: 'kimi',
          cliName: 'Kimi Code',
          model: 'Kimi Coding',
          planType: 'Kimi Coding',
          fiveHourPercent: 100,
          fiveHourResetsIn: '4h 12m',
          sevenDayPercent: 12,
          sevenDayResetsOn: 'Resets Wed',
          lastUpdated: Date.now(),
          status: 'normal',
        },
        codex: {
          cliId: 'codex',
          cliName: 'Codex',
          model: 'Codex',
          planType: 'Plus',
          fiveHourPercent: 100,
          fiveHourResetsIn: '--',
          sevenDayPercent: 100,
          sevenDayResetsOn: '--',
          lastUpdated: Date.now(),
          status: 'normal',
        },
        claude: {
          cliId: 'claude',
          cliName: 'Claude Code',
          model: 'Claude Code',
          planType: 'Pro',
          fiveHourPercent: 100,
          fiveHourResetsIn: '--',
          sevenDayPercent: 100,
          sevenDayResetsOn: '--',
          lastUpdated: Date.now(),
          status: 'normal',
        },
        opencode: {
          cliId: 'opencode',
          cliName: 'OpenCode',
          model: 'Auto',
          fiveHourPercent: 0,
          fiveHourResetsIn: '--',
          sevenDayPercent: 0,
          sevenDayResetsOn: '--',
          lastUpdated: Date.now(),
          status: 'offline',
          message: t('未检测到本地配置'),
        },
        grok: {
          cliId: 'grok',
          cliName: 'Grok Build',
          model: 'Grok',
          planType: 'xAI Premium',
          fiveHourPercent: 100,
          fiveHourResetsIn: '--',
          sevenDayPercent: 100,
          sevenDayResetsOn: '--',
          lastUpdated: Date.now(),
          status: 'normal',
        },
      });
    }
  }, []);

  // 为初始化任务在 Electron 主进程创建真实 CLI 终端 PTY
  useEffect(() => {
    if (window.electronAPI) {
      let disposed = false;
      // 先按 PATH 检测已安装的 CLI，再为初始任务创建 PTY；未安装 CLI 的分组不显示
      window.electronAPI.detectClis(customClisRef.current.map(({ id, command }) => ({ id, command }))).catch(() => null).then((list) => {
        if (disposed) return;
        const detected = list ? Object.fromEntries(list.map((cli) => [cli.id, true])) : null;
        setInstalled(detected);
        if (list) setExtraClis((prev) => mergeDetectedExtras(prev, list, customClisRef.current));
        const isVisibleCli = (id: string) => id === 'terminal' || !detected || Boolean(detected[id]);
        const candidates = tasksRef.current.filter((task) => isVisibleCli(task.groupId));
        const initialTask = candidates.find((task) => task.id === activeTaskId) || candidates[0];
        const initialCli = initialTask && (
          [...BUILTIN_CLIS, ...extraClisRef.current, ...customClisRef.current.map(toCliDef)].find((cli) => cli.id === initialTask.groupId)
          ?? list?.map((cli) => ({ defaultCommand: cli.command, id: cli.id })).find((cli) => cli.id === initialTask.groupId)
        );
        if (initialTask && initialCli) {
          if (initialTask.id !== activeTaskId) setActiveTaskId(initialTask.id);
          earlyExitedIdsRef.current.delete(initialTask.id);
          lastOutputRef.current.set(initialTask.id, Date.now());
          startedAtRef.current.set(initialTask.id, Date.now());
          setTasks((prev) => prev.map((t) => t.id === initialTask.id ? { ...t, status: 'starting', errorMessage: undefined } : t));
          startSession(initialTask, initialCli).then((result) => {
            const exitedEarly = earlyExitedIdsRef.current.has(initialTask.id);
            earlyExitedIdsRef.current.delete(initialTask.id);
            setTasks((prev) => prev.map((t) => {
              if (t.id !== initialTask.id) return t;
              if (result?.success && (exitedEarly || t.status === 'stopped')) return { ...t, status: 'stopped', errorMessage: undefined };
              return { ...t, ...startOutcome(result) };
            }));
          }).catch(() => setTasks((prev) => prev.map((t) => t.id === initialTask.id ? { ...t, status: 'error' } : t)));
        } else {
          setActiveTaskId(null);
        }
      });

      // 监听终端进程退出事件，将对应任务状态翻转为 'stopped'
      const unsub = window.electronAPI.onSessionExit(({ id, exitCode }) => {
        const exited = tasksRef.current.find((t) => t.id === id);
        if (!exited) {
          if (earlyExitedIdsRef.current.size >= 64) {
            const oldest = earlyExitedIdsRef.current.keys().next().value;
            if (oldest !== undefined) earlyExitedIdsRef.current.delete(oldest);
          }
          earlyExitedIdsRef.current.set(id, exitCode);
        }
        if (exited && isTaskAlive(exited.status)) markUnread([id]);
        // 启动中的退出（重启时旧进程退出、启动即失败）不响
        if (exited && (exited.status === 'running' || exited.status === 'idle' || exited.status === 'waiting')) notifyDoneSound([id]);
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'stopped' } : t)));
      });
      return () => { disposed = true; unsub(); };
    }
  }, []);

  // 历史会话：启动后稍等再读（避开启动高峰），之后每 2 分钟刷新（窗口不可见时跳过），账号配置变化时同步更新；「最近任务」由它按文件夹归类
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyAccountsKey = settings.accounts.map((a) => `${a.id}\u0000${a.cliId}\u0000${a.name}\u0000${a.configDir}`).join('\u0001');
  const prevHistoryAccountsKeyRef = useRef(historyAccountsKey);
  useEffect(() => {
    const list = window.electronAPI?.listSessionHistory;
    if (!list) return;
    let disposed = false;
    let lastAt = 0;
    const refresh = (force = false) => {
      if (!force && document.hidden) return;
      lastAt = Date.now();
      void list(accountsRef.current).then((entries) => {
        if (!disposed && Array.isArray(entries)) {
          setHistory((prev) => (sameHistoryEntries(prev, entries) ? prev : entries));
        }
      }).catch(() => {});
    };
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastAt >= 120_000) refresh(true);
    };
    const first = window.setTimeout(() => refresh(true), 1500);
    const timer = window.setInterval(() => refresh(false), 120_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  useEffect(() => {
    if (prevHistoryAccountsKeyRef.current === historyAccountsKey) return;
    prevHistoryAccountsKeyRef.current = historyAccountsKey;
    const list = window.electronAPI?.listSessionHistory;
    if (!list) return;
    let disposed = false;
    void list(settings.accounts).then((entries) => {
      if (!disposed && Array.isArray(entries)) {
        setHistory((prev) => (sameHistoryEntries(prev, entries) ? prev : entries));
      }
    }).catch(() => {});
    return () => { disposed = true; };
  }, [historyAccountsKey, settings.accounts]);
  const recentFolders = useMemo(() => {
    const cliIds = new Set(visibleClis.map((cli) => cli.id));
    return groupRecent(history.filter((entry) => cliIds.has(entry.cliId)), new Set(folders.map((folder) => folderKey(folder.path))));
  }, [history, visibleClis, folders]);

  // Git 分支：只读 .git/HEAD；文件夹列表变化、窗口获得焦点和每 30 秒刷新
  const [gitBranches, setGitBranches] = useState<Record<string, string | null>>({});
  const branchPathsKey = [...folders.map((folder) => folder.path), ...recentFolders.map((recent) => recent.path)].join('\n');
  useEffect(() => {
    const read = window.electronAPI?.getGitBranches;
    if (!read) return;
    const paths = branchPathsKey ? branchPathsKey.split('\n') : [];
    let disposed = false;
    const refresh = () => {
      void read(paths).then((result) => {
        if (disposed) return;
        const next: Record<string, string | null> = {};
        for (const [dir, branch] of Object.entries(result)) next[folderKey(dir)] = branch;
        setGitBranches((prev) => (Object.keys(next).length === Object.keys(prev).length && Object.entries(next).every(([key, value]) => prev[key] === value) ? prev : next));
      }).catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [branchPathsKey]);

  // 原生标题栏已隐藏：把窗口控件覆盖层的底色、符号色、高度及窗口底色同步为当前主题的实际样式，并持久化供下次启动使用
  useEffect(() => {
    const header = document.querySelector('header');
    if (!header || !window.electronAPI?.setTitleBarOverlay) return;
    {
      const toHex = (css: string) => {
        const m = css.match(/\d+(\.\d+)?/g);
        return m && m.length >= 3 ? `#${m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('')}` : null;
      };
      const color = toHex(getComputedStyle(header).backgroundColor);
      const symbolColor = toHex(getComputedStyle(header).color);
      const backgroundColor = toHex(getComputedStyle(document.body).backgroundColor) ?? undefined;
      if (color && symbolColor) {
        window.electronAPI.setTitleBarOverlay({ color, symbolColor, height: Math.round(header.getBoundingClientRect().height), backgroundColor });
      }
    }
  }, [resolvedTheme, settings.uiScale]);

  // 任务行第二行：任务对应会话里最近一条用户消息（仅 Claude / Codex / Kimi），每 5 秒与窗口获得焦点时刷新。
  // 使用账号的任务读该账号的配置目录；任务进入停止态后再补读最后一次摘要，收敛后不再每 5 秒重扫
  const [summaries, setSummaries] = useState<Record<string, { text: string | null }>>({});
  const settledStoppedIdsRef = useRef(new Set<string>());
  const summaryCandidates = useMemo(() => tasks
    .filter((task) => SUMMARY_CLIS.has(task.groupId))
    .flatMap((task) => {
      const account = task.accountId ? settings.accounts.find((item) => item.id === task.accountId) : undefined;
      if (task.accountId && !account) return [];
      return [{ id: task.id, alive: isTaskAlive(task.status), cliId: task.groupId, cwd: task.cwd, createdAt: task.createdAt, historyId: task.historyId, configDir: account?.configDir }];
    }), [tasks, settings.accounts]);
  const summaryKey = JSON.stringify(summaryCandidates);
  useEffect(() => {
    const read = window.electronAPI?.getTaskSummaries;
    if (!read || summaryCandidates.length === 0) return;
    let disposed = false;
    const validIds = new Set(summaryCandidates.map((item) => item.id));
    for (const id of [...settledStoppedIdsRef.current]) {
      if (!validIds.has(id)) settledStoppedIdsRef.current.delete(id);
    }
    for (const item of summaryCandidates) {
      if (item.alive) settledStoppedIdsRef.current.delete(item.id);
    }
    const refresh = () => {
      if (document.hidden) return;
      const stoppedFetchIds: string[] = [];
      const toFetch = summaryCandidates
        .filter((item) => {
          if (item.alive) return true;
          if (settledStoppedIdsRef.current.has(item.id)) return false;
          stoppedFetchIds.push(item.id);
          return true;
        })
        .map(({ alive: _alive, ...rest }) => rest);
      if (toFetch.length === 0) return;
      void read(toFetch).then((fetched) => {
        if (disposed) return;
        for (const id of stoppedFetchIds) {
          if (Object.prototype.hasOwnProperty.call(fetched, id)) settledStoppedIdsRef.current.add(id);
        }
        setSummaries((prev) => {
          const next: Record<string, { text: string | null }> = {};
          let changed = false;
          for (const id of validIds) {
            if (Object.prototype.hasOwnProperty.call(fetched, id)) {
              next[id] = fetched[id];
              if (prev[id]?.text !== fetched[id]?.text || !Object.prototype.hasOwnProperty.call(prev, id)) changed = true;
            } else if (Object.prototype.hasOwnProperty.call(prev, id)) {
              next[id] = prev[id];
            }
          }
          if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev;
          return next;
        });
      }).catch(() => {});
    };
    refresh();
    const onVisible = () => { if (!document.hidden) refresh(); };
    const timer = window.setInterval(refresh, 5_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [summaryKey]);

  // 状态检测：任务启动后默认「空闲」，有持续输出时为「运行中」，连续 IDLE_AFTER_MS 没有输出转为「等待输入」，再有输出又回到运行中；
  // 提示音在转等待输入的那一刻响；静默满 DONE_NOTIFY_AFTER_MS 才标记未读（期间恢复输出则继续等待）。
  // 只能判断输出静默，无法区分「已完成」与「在等待确认」，两者都显示为等待输入。
  useEffect(() => {
    if (!window.electronAPI?.onSessionData) return;
    const lastOutput = lastOutputRef.current;
    const pendingDone = new Set<string>();
    const setStatus = (ids: string[], from: TaskSession['status'], to: TaskSession['status']) => {
      if (ids.length === 0) return;
      setTasks((prev) => prev.map((t) => ids.includes(t.id) && t.status === from ? { ...t, status: to } : t));
    };
    const unsub = window.electronAPI.onSessionData(({ id, data }) => {
      if (!hasVisibleOutput(data)) return;
      const now = Date.now();
      lastOutput.set(id, now);
      // 启动阶段（欢迎横幅、会话恢复等）的输出不算运行中
      if (now - (startedAtRef.current.get(id) ?? 0) < STARTUP_GRACE_MS) return;
      const task = tasksRef.current.find((t) => t.id === id);
      if (task?.status === 'idle' || task?.status === 'waiting') setStatus([id], task.status, 'running');
      if (task && (task.status === 'idle' || task.status === 'waiting' || task.status === 'running')) pendingDone.add(id);
    });
    const timer = window.setInterval(() => {
      const now = Date.now();
      const currentIds = new Set(tasksRef.current.map((t) => t.id));
      for (const id of [...lastOutput.keys()]) {
        if (!currentIds.has(id)) { lastOutput.delete(id); startedAtRef.current.delete(id); }
      }
      for (const id of [...pendingDone]) if (!currentIds.has(id)) pendingDone.delete(id);
      const quietFor = (id: string) => now - (lastOutput.get(id) ?? now);
      const waitingIds = tasksRef.current
        .filter((t) => t.status === 'running' && quietFor(t.id) > IDLE_AFTER_MS)
        .map((t) => t.id);
      const doneIds = [...pendingDone].filter((id) => quietFor(id) > DONE_NOTIFY_AFTER_MS);
      // 尚无输出记录的任务从现在开始计时
      tasksRef.current.forEach((t) => { if (!lastOutput.has(t.id)) lastOutput.set(t.id, now); });
      setStatus(waitingIds, 'running', 'waiting');
      doneIds.forEach((id) => pendingDone.delete(id));
      markUnread(doneIds);
      // 提示音与状态点同步：运行中转等待输入的那一刻响
      notifyDoneSound(waitingIds);
    }, 1000);
    return () => { unsub?.(); window.clearInterval(timer); };
  }, [markUnread, notifyDoneSound]);

  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const allClisRef = useRef(allClis);
  allClisRef.current = allClis;
  const visibleClisRef = useRef(visibleClis);
  visibleClisRef.current = visibleClis;
  const visibleTasksRef = useRef(visibleTasks);
  visibleTasksRef.current = visibleTasks;
  const workspacePathRef = useRef(workspacePath);
  workspacePathRef.current = workspacePath;

  const handleResetSidebarWidth = useCallback(() => setSidebarWidth(null), []);
  const handleResetPreviewWidth = useCallback(() => setPreviewWidth(DEFAULT_PREVIEW_WIDTH), []);
  const handleToggleSidebar = useCallback(() => setIsSidebarCollapsed((collapsed) => !collapsed), []);
  const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
  const handleOpenHistory = useCallback(() => setIsHistoryOpen(true), []);
  const handleOpenUsage = useCallback(() => setIsUsageOpen(true), []);

  // 折叠 / 展开文件夹
  const handleToggleFolder = useCallback((folderPath: string) => {
    setFolders((prev) => prev.map((folder) => (folderKey(folder.path) === folderKey(folderPath) ? { ...folder, isExpanded: !folder.isExpanded } : folder)));
  }, []);

  const handleToggleAllFolders = useCallback((expand: boolean) => {
    setFolders((prev) => prev.map((folder) => ({ ...folder, isExpanded: expand })));
  }, []);

  const handlePinRecentFolder = useCallback((folderPath: string) => {
    setFolders((prev) => ensureFolder(prev, folderPath, true));
    setLastFolder(folderPath);
  }, []);

  // 清理指定文件夹内已停止或启动失败的任务
  const handleClearStoppedTasks = useCallback((folderPath: string) => {
    const key = folderKey(folderPath);
    const doomedIds = new Set(tasksRef.current.filter((task) => folderKey(task.cwd) === key && !isTaskAlive(task.status)).map((task) => task.id));
    if (doomedIds.size === 0) return;
    const remaining = orderedTasks(foldersRef.current, visibleTasksRef.current).filter((task) => !doomedIds.has(task.id));
    setTasks((prev) => prev.filter((task) => !doomedIds.has(task.id)));
    if (activeTaskIdRef.current && doomedIds.has(activeTaskIdRef.current)) {
      const sameFolder = remaining.find((task) => folderKey(task.cwd) === key);
      const next = sameFolder ?? remaining[0] ?? null;
      setActiveTaskId(next?.id ?? null);
      if (next) setFolders((prev) => ensureFolder(prev, next.cwd, true));
    }
  }, []);

  // 选中具体某个子任务
  // startIfStopped 为 false 时只切换视图，不拉起已停止的任务（键盘轮换、关闭后接替）
  const handleSelectTask = useCallback((taskId: string, startIfStopped = true) => {
    const task = tasksRef.current.find((item) => item.id === taskId);
    setActiveTaskId(taskId);
    // 保证该任务所在的文件夹处于展开状态
    if (task) setFolders((prev) => ensureFolder(prev, task.cwd, true));
    const cli = task && allClisRef.current.find((item) => item.id === task.groupId);
    // createSession 对已存在的 PTY 是幂等操作。每次选择都校验一次，避免界面状态
    // 与主进程真实会话脱节后，键盘输入被 writeSession 静默丢弃。
    if (window.electronAPI && task && cli && (startIfStopped || isTaskAlive(task.status))) {
      const restarting = !isTaskAlive(task.status) || task.status === 'starting';
      if (restarting) {
        earlyExitedIdsRef.current.delete(taskId);
        lastOutputRef.current.set(taskId, Date.now());
        startedAtRef.current.set(taskId, Date.now());
        setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: 'starting', errorMessage: undefined } : t));
      }
      startSession(task, cli).then((result) => {
        const exitedEarly = earlyExitedIdsRef.current.has(taskId);
        earlyExitedIdsRef.current.delete(taskId);
        setTasks((prev) => prev.map((t) => {
          if (t.id !== taskId) return t;
          if (result?.success && (exitedEarly || t.status === 'stopped')) return { ...t, status: 'stopped', errorMessage: undefined };
          if (result?.success && t.status === 'idle') return { ...t, errorMessage: undefined };
          return { ...t, ...startOutcome(result) };
        }));
      }).catch(() => setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: 'error' } : t)));
    }
  }, [startSession]);

  // 重新检测已安装的 CLI（含自定义 CLI）：新装了 CLI、增删自定义 CLI 后不必重启应用
  const redetectClis = useCallback(async () => {
    const list = await window.electronAPI?.detectClis(customClisRef.current.map(({ id, command }) => ({ id, command }))).catch(() => null);
    if (!list) return;
    setInstalled(Object.fromEntries(list.map((cli) => [cli.id, true])));
    setExtraClis((prev) => mergeDetectedExtras(prev, list, customClisRef.current));
  }, []);
  // 自定义 CLI 的 id 或命令变化后重新检测（首次检测由启动流程完成）
  const customClisKey = customClis.map((cli) => `${cli.id}\u0000${cli.command}`).join('\u0001');
  const customClisKeyRef = useRef(customClisKey);
  useEffect(() => {
    if (customClisKeyRef.current === customClisKey) return;
    customClisKeyRef.current = customClisKey;
    void redetectClis();
  }, [customClisKey, redetectClis]);

  // 增删改自定义 CLI；被删除的 CLI 的任务一并关闭并移除，避免留下看不见的终端进程
  const handleCustomClisChange = useCallback((next: CustomCli[]) => {
    const removed = new Set(customClisRef.current.filter((cli) => !next.some((item) => item.id === cli.id)).map((cli) => cli.id));
    if (removed.size > 0) {
      const doomed = tasksRef.current.filter((task) => removed.has(task.groupId));
      doomed.forEach((task) => { void window.electronAPI?.killSession(task.id); });
      setTasks((prev) => prev.filter((task) => !removed.has(task.groupId)));
      if (activeTaskIdRef.current && doomed.some((task) => task.id === activeTaskIdRef.current)) {
        setActiveTaskId(orderedTasks(foldersRef.current, visibleTasksRef.current.filter((task) => !removed.has(task.groupId)))[0]?.id ?? null);
      }
    }
    setSettings((prev) => ({ ...prev, customClis: next }));
  }, []);

  // 触发新建任务弹窗：在哪个文件夹里、预选哪个 CLI 与账号
  const handleOpenNewTask = useCallback((folderPath: string, cliId?: string, accountId?: string) => {
    setNewTaskContext({ folderPath, cliId, accountId });
  }, []);

  // 添加文件夹：只把文件夹加入侧栏，不结束任何已在运行的终端
  const handleAddFolder = useCallback(async () => {
    const folder = await window.electronAPI?.selectWorkspaceDirectory?.(workspacePathRef.current);
    if (!folder) return;
    setFolders((prev) => ensureFolder(prev, folder, true));
    setLastFolder(folder);
  }, []);

  // 从侧栏移除文件夹：结束该文件夹里的全部终端并删除这些任务，历史会话不受影响
  const handleRemoveFolder = useCallback(async (folderPath: string) => {
    const doomed = tasksInFolder(tasksRef.current, folderPath);
    const alive = doomed.filter((task) => isTaskAlive(task.status)).length;
    if (!await askConfirm({
      title: t('从侧栏移除文件夹'),
      message: doomed.length === 0
        ? t('把“{name}”从侧栏移除？', { name: folderName(folderPath) })
        : t('“{name}”里的 {n} 个任务会被移除{alive}。文件夹本身和 CLI 的历史会话不受影响。', { name: folderName(folderPath), n: doomed.length, alive: alive > 0 ? t('，其中 {n} 个终端进程会被终止', { n: alive }) : '' }),
      confirmLabel: t('移除'),
      danger: true,
    })) return;
    const doomedIds = new Set(doomed.map((task) => task.id));
    doomed.forEach((task) => window.electronAPI?.killSession(task.id));
    const remaining = orderedTasks(foldersRef.current, visibleTasksRef.current).filter((task) => !doomedIds.has(task.id));
    setTasks((prev) => prev.filter((task) => !doomedIds.has(task.id)));
    setFolders((prev) => prev.filter((folder) => folderKey(folder.path) !== folderKey(folderPath)));
    if (activeTaskIdRef.current && doomedIds.has(activeTaskIdRef.current)) {
      const next = remaining[0];
      setActiveTaskId(next?.id ?? null);
      if (next) setFolders((prev) => ensureFolder(prev, next.cwd, true));
    }
  }, [askConfirm]);

  // 创建子任务
  const handleCreateTask = useCallback(async (groupId: string, title: string, command: string, cwd: string, historyId?: string, accountId?: string): Promise<{ success: boolean; error?: string }> => {
    const newTaskId = `${groupId}-task-${Date.now().toString(36)}`;
    const resolvedCwd = cwd || workspacePathRef.current;
    const account = accountId ? accountsRef.current.find((item) => item.id === accountId) : undefined;
    if (accountId && !account) return { success: false, error: t('所选账号配置不存在，请在「设置 → 账号」中检查。') };
    const isCustomCli = Boolean(allClisRef.current.find((item) => item.id === groupId)?.custom);
    if (window.electronAPI) {
      earlyExitedIdsRef.current.delete(newTaskId);
      const result = await window.electronAPI.createSession({ id: newTaskId, command: command || 'powershell.exe', cwd: resolvedCwd, shell: isCustomCli, account: account && toSessionAccount(account) });
      if (!result.success) {
        earlyExitedIdsRef.current.delete(newTaskId);
        return { success: false, error: result.error || t('终端启动失败') };
      }
    }
    const exitedEarly = earlyExitedIdsRef.current.has(newTaskId);
    earlyExitedIdsRef.current.delete(newTaskId);
    const now = Date.now();
    if (!exitedEarly) {
      lastOutputRef.current.set(newTaskId, now);
      startedAtRef.current.set(newTaskId, now);
    }
    const newTask: TaskSession = {
      id: newTaskId,
      groupId,
      title,
      command: command || 'powershell.exe',
      historyId,
      accountId,
      status: exitedEarly ? 'stopped' : 'idle',
      cwd: resolvedCwd,
      createdAt: now,
    };

    setTasks((prev) => [...prev, newTask]);
    setFolders((prev) => ensureFolder(prev, resolvedCwd, true));
    setActiveTaskId(newTaskId);

    return { success: true };
  }, []);

  // 一键新建：用默认名称、该 CLI 的默认命令在指定文件夹直接启动；失败时转到自定义弹窗修改
  const quickCreatingRef = useRef(new Set<string>());
  const handleQuickNewTask = useCallback(async (folderPath: string, cliId: string, accountId?: string) => {
    const cli = allClisRef.current.find((item) => item.id === cliId);
    const lockKey = `${folderKey(folderPath)}:${cliId}:${accountId ?? ''}`;
    if (!cli || quickCreatingRef.current.has(lockKey)) return;
    quickCreatingRef.current.add(lockKey);
    try {
      const result = await handleCreateTask(cliId, nextTaskTitle(tasksInFolder(tasksRef.current, folderPath)), cli.defaultCommand, folderPath, undefined, accountId);
      if (!result.success) {
        await notify(t('任务启动失败'), t('{reason}。可以在接下来的窗口中修改启动命令或工作目录。', { reason: result.error || t('终端启动失败') }));
        handleOpenNewTask(folderPath, cliId, accountId);
      }
    } finally {
      quickCreatingRef.current.delete(lockKey);
    }
  }, [handleCreateTask, notify, handleOpenNewTask]);

  const handleSidebarNewTask = useCallback((folderPath: string, cliId: string, accountId?: string) => {
    void handleQuickNewTask(folderPath, cliId, accountId);
  }, [handleQuickNewTask]);

  // 关闭具体子任务
  const handleCloseTask = useCallback(async (taskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const task = tasksRef.current.find((item) => item.id === taskId);
    if (task && isTaskAlive(task.status) && !await askConfirm({
      title: t('关闭任务'),
      message: t('关闭“{title}”会终止此终端及其中运行的命令。', { title: task.title }),
      confirmLabel: t('关闭并终止'),
      danger: true,
    })) return;

    if (window.electronAPI) {
      window.electronAPI.killSession(taskId);
    }

    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    if (activeTaskIdRef.current === taskId) {
      // 优先切到同一文件夹内的相邻任务，再回退到侧栏里的其他任务。
      const ordered = orderedTasks(foldersRef.current, visibleTasksRef.current);
      const mates = task ? ordered.filter((item) => folderKey(item.cwd) === folderKey(task.cwd)) : [];
      const index = mates.findIndex((item) => item.id === taskId);
      const remainingMates = mates.filter((item) => item.id !== taskId);
      const sameFolderTask = index >= 0 ? remainingMates[index] || remainingMates[index - 1] : undefined;
      const nextTask = sameFolderTask || ordered.filter((t) => t.id !== taskId)[0];
      setActiveTaskId(nextTask?.id || null);
      if (nextTask) setFolders((prev) => ensureFolder(prev, nextTask.cwd, true));
    }
  }, [askConfirm]);

  const handleRenameTask = useCallback((taskId: string, title: string) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, title } : t));
  }, []);

  // 设置 → 账号 → 登录：在该账号环境下新开一个终端任务运行 CLI 自带的登录命令，凭据由 CLI 自己写入账号目录
  const handleLoginAccount = useCallback(async (account: Account) => {
    const cli = accountCli(account.cliId);
    if (!cli || !visibleClisRef.current.some((item) => item.id === account.cliId)) {
      void notify(t('无法登录'), t('本机未检测到 {name} 命令。', { name: cli?.name ?? account.cliId }));
      return;
    }
    const result = await handleCreateTask(account.cliId, t('登录 {name}', { name: account.name }), cli.loginCommand, workspacePathRef.current, undefined, account.id);
    if (result.success) setIsSettingsOpen(false);
    else void notify(t('登录任务启动失败'), result.error || t('终端启动失败'));
  }, [handleCreateTask, notify]);

  // 手动刷新当前选中 CLI 的真实配额
  const currentGroupRef = useRef(currentGroup);
  currentGroupRef.current = currentGroup;
  const activeTaskRef = useRef(activeTask);
  activeTaskRef.current = activeTask;
  const handleRefreshQuota = useCallback(async () => {
    if (window.electronAPI) {
      const grp = currentGroupRef.current;
      const latest = await window.electronAPI.refreshQuota(grp ? quotaKey(grp.id, activeTaskRef.current?.accountId) : undefined);
      if (latest) setQuotas(latest);
    }
  }, []);

  // 重启指定任务，未指定时为当前任务
  const handleRestartSession = useCallback(async (taskId: string | null = activeTaskIdRef.current) => {
    const task = tasksRef.current.find((item) => item.id === taskId);
    if (!taskId || !task || task.status === 'starting') return;
    if (isTaskAlive(task.status) && !await askConfirm({
      title: t('重启终端'),
      message: t('重启“{title}”会终止当前终端命令。', { title: task.title }),
      confirmLabel: t('重启'),
      danger: true,
    })) return;
    const cli = allClisRef.current.find((item) => item.id === task.groupId);
    const resolved = resolveTaskLaunch(task, cli);
    if (!resolved.ok) {
      void window.electronAPI?.killSession(taskId);
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: 'error', errorMessage: resolved.error } : t));
      return;
    }
    earlyExitedIdsRef.current.delete(taskId);
    lastOutputRef.current.set(taskId, Date.now());
    startedAtRef.current.set(taskId, Date.now());
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: 'starting', errorMessage: undefined } : t));
    const result = await terminalViewportRef.current?.restartActiveTerminal(taskId, resolved.options);
    const exitedEarly = earlyExitedIdsRef.current.has(taskId);
    earlyExitedIdsRef.current.delete(taskId);
    setTasks((prev) => prev.map((t) => {
      if (t.id !== taskId) return t;
      if (result?.success && (exitedEarly || t.status === 'stopped')) return { ...t, status: 'stopped', errorMessage: undefined };
      return { ...t, ...startOutcome(result) };
    }));
  }, [askConfirm, resolveTaskLaunch]);

  // 侧栏右键「重启」：已停止的任务切过去并启动，存活的任务原地重启
  const handleRestartTask = useCallback((taskId: string) => {
    const task = tasksRef.current.find((item) => item.id === taskId);
    if (!task) return;
    if (isTaskAlive(task.status)) void handleRestartSession(taskId);
    else handleSelectTask(taskId);
  }, [handleRestartSession, handleSelectTask]);

  const handleOpenDirectory = useCallback((dir: string) => {
    void window.electronAPI?.openDirectory?.(dir).then((ok) => {
      if (!ok) void notify(t('无法打开目录'), t('{dir} 不存在或无法访问。', { dir }));
    });
  }, [notify]);

  const handleRemoveFolderVoid = useCallback((dir: string) => { void handleRemoveFolder(dir); }, [handleRemoveFolder]);
  const handleAddFolderVoid = useCallback(() => { void handleAddFolder(); }, [handleAddFolder]);
  const handleOpenSearch = useCallback(() => terminalViewportRef.current?.openSearch(), []);
  const handleClearScreen = useCallback(() => terminalViewportRef.current?.clearActiveTerminal(), []);
  const handleRestartActive = useCallback(() => handleRestartSession(), [handleRestartSession]);
  const handleExportLogs = useCallback(async (mode: 'copy' | 'save') => (
    terminalViewportRef.current?.exportActiveTerminalLog(mode) || { success: false, error: t('没有活动终端') }
  ), []);
  const handlePreviewFile = useCallback((cwd: string, path: string, line?: number) => {
    setFilePreview({ cwd, path, line, openedAt: Date.now() });
  }, []);
  const handleClosePreview = useCallback(() => setFilePreview(null), []);

  // 从历史会话恢复：已有对应任务则直接切换，否则用 CLI 自带的恢复命令新建任务
  const handleResumeHistory = useCallback(async (entry: HistoryEntry) => {
    const cli = visibleClisRef.current.find((item) => item.id === entry.cliId);
    if (!cli) {
      void notify(t('无法恢复会话'), t('本机未检测到 {name} 命令。', { name: entry.cliId }));
      return;
    }
    setIsHistoryOpen(false);
    const existing = tasksRef.current.find((task) => task.historyId === entry.id && (task.accountId ?? undefined) === (entry.accountId ?? undefined));
    if (existing) {
      handleSelectTask(existing.id);
      return;
    }
    const result = await handleCreateTask(cli.id, entry.title, entry.command, entry.cwd, entry.id, entry.accountId);
    if (!result.success) void notify(t('恢复会话失败'), result.error || t('终端启动失败'));
  }, [handleCreateTask, handleSelectTask, notify]);

  const handleResumeHistoryVoid = useCallback((entry: HistoryEntry) => { void handleResumeHistory(entry); }, [handleResumeHistory]);

  // 全局快捷键。在捕获阶段处理并阻止继续传播，避免同一按键再被 xterm 发往 CLI；
  // 只占用终端程序基本不用的组合（Ctrl+Tab、Ctrl+数字、Ctrl+Shift+字母、Ctrl+,）。
  const shortcutRef = useRef<(e: KeyboardEvent) => boolean>(() => false);
  shortcutRef.current = (e) => {
    if (!e.ctrlKey || e.altKey || e.metaKey) return false;
    if (isNewTaskOpen || isSettingsOpen || isHistoryOpen || isUsageOpen || workReminderVisible || confirmOptions) return false;
    const ordered = orderedTasks(folders, visibleTasks);
    const key = e.key.toLowerCase();
    if (key === 'tab') {
      if (ordered.length < 2) return true;
      const index = ordered.findIndex((task) => task.id === activeTaskId);
      const next = index < 0
        ? ordered[e.shiftKey ? ordered.length - 1 : 0]
        : ordered[(index + (e.shiftKey ? -1 : 1) + ordered.length) % ordered.length];
      handleSelectTask(next.id, false);
      return true;
    }
    if (!e.shiftKey && e.code.startsWith('Digit') && e.code !== 'Digit0') {
      const target = ordered[Number(e.code.slice(5)) - 1];
      if (target) handleSelectTask(target.id, false);
      return true;
    }
    if (!e.shiftKey && key === ',') { setIsSettingsOpen(true); return true; }
    if (!e.shiftKey) return false;
    if (key === 't' || key === 'n') {
      // 沿用当前任务的 CLI（以及仍有效的账号），在当前文件夹新建
      const cli = currentGroup && visibleClis.some((item) => item.id === currentGroup.id) ? currentGroup : visibleClis[0];
      if (cli) {
        const inheritedAccountId = activeTask && cli.id === activeTask.groupId && activeTask.accountId && settings.accounts.some((a) => a.id === activeTask.accountId && a.cliId === cli.id)
          ? activeTask.accountId
          : undefined;
        if (key === 't') void handleQuickNewTask(workspacePath, cli.id, inheritedAccountId);
        else handleOpenNewTask(workspacePath, cli.id, inheritedAccountId);
      }
      return true;
    }
    if (key === 'w') {
      if (activeTask && visibleClis.some((cli) => cli.id === activeTask.groupId)) void handleCloseTask(activeTask.id);
      return true;
    }
    if (key === 'b') { setIsSidebarCollapsed((collapsed) => !collapsed); return true; }
    if (key === 'h') { setIsHistoryOpen(true); return true; }
    if (key === 'u') { setIsUsageOpen(true); return true; }
    return false;
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shortcutRef.current(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const emptyFolder = useMemo(
    () => ({ name: folderName(workspacePath), branch: gitBranches[folderKey(workspacePath)] }),
    [workspacePath, gitBranches],
  );

  // 没有活动任务时的引导：仅在当前没有活动任务时构建 JSX，避免常规运行期间每次状态更新无谓重算
  const hasActiveTask = Boolean(activeTask);
  const workspaceBranch = gitBranches[folderKey(workspacePath)];
  const emptyState = useMemo(() => {
    if (hasActiveTask) return undefined;
    const recentForEmpty = [...history].filter((entry) => visibleClis.some((cli) => cli.id === entry.cliId)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
    return (
      <div className={`w-full text-center ${visibleClis.length <= 4 ? 'max-w-md' : 'max-w-lg'}`}>
        <AppLogo size={44} className="mx-auto" />
        <h2 className="mt-4 text-lg font-semibold text-fg">{t('开始一个任务')}</h2>
        <div className="mt-2 flex items-center justify-center gap-2 text-ui text-fg-subtle" data-empty-folder-line>
          <span>{t('在「{name}」', { name: folderName(workspacePath) })}</span>
          {workspaceBranch && <span className="rounded-full border border-violet/30 bg-violet/10 px-1.5 text-2xs text-violet">{workspaceBranch}</span>}
          <button type="button" onClick={handleAddFolderVoid} className="rounded px-1 text-xs text-accent hover:underline">{t('换文件夹')}</button>
        </div>
        {recentForEmpty.length > 0 && (
          <div className="mt-5 text-left" data-empty-recent>
            <p className="mb-1.5 px-1 text-xs font-medium text-fg-faint">{t('继续上次')}</p>
            <div className="space-y-1">
              {recentForEmpty.map((entry) => (
                <button
                  key={`${entry.cliId}:${entry.accountId ?? 'default'}:${entry.id}`}
                  type="button"
                  onClick={() => void handleResumeHistory(entry)}
                  title={`${entry.title}
${entry.cwd}`}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-left text-ui text-fg-muted transition-colors hover:border-accent/60 hover:bg-hover hover:text-fg"
                >
                  <BrandIcon icon={entry.cliId} size={16} />
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                  {entry.accountName && <span className="shrink-0 rounded border border-line px-1 text-2xs text-fg-subtle">{entry.accountName}</span>}
                  <span className="shrink-0 text-xs text-fg-faint">{folderName(entry.cwd)} · {formatAgo(entry.updatedAt)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="mt-5 px-1 text-left text-xs font-medium text-fg-faint">{t('新建任务')}</p>
        <div className={`mt-1.5 grid grid-cols-2 gap-2.5 ${visibleClis.length <= 4 ? '' : 'sm:grid-cols-3'}`}>
          {visibleClis.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => void handleQuickNewTask(workspacePath, group.id)}
              onContextMenu={(e) => { e.preventDefault(); handleOpenNewTask(workspacePath, group.id); }}
              title={t('启动 {name}（右键可自定义命令与目录）', { name: group.name })}
              className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-left text-ui font-medium text-fg-muted transition-colors hover:border-accent/60 hover:bg-hover hover:text-fg"
            >
              <BrandIcon icon={group.icon} size={18} />
              <span className="truncate">{group.name}</span>
            </button>
          ))}
        </div>
        <p className="relative left-1/2 mt-6 w-max -translate-x-1/2 whitespace-nowrap text-xs text-fg-faint">
          <kbd className="rounded border border-line-strong bg-muted px-1.5 py-0.5 font-mono">Ctrl + Shift + T</kbd> {t('新建任务')}
          <span className="mx-2">·</span>
          <kbd className="rounded border border-line-strong bg-muted px-1.5 py-0.5 font-mono">Ctrl + Shift + N</kbd> {t('自定义新建')}
          <span className="mx-2">·</span>
          <kbd className="rounded border border-line-strong bg-muted px-1.5 py-0.5 font-mono">Ctrl + Shift + H</kbd> {t('全部历史会话')}
        </p>
      </div>
    );
  }, [hasActiveTask, history, visibleClis, workspacePath, workspaceBranch, settings.language, handleAddFolderVoid, handleResumeHistory, handleQuickNewTask, handleOpenNewTask]);

  // 低频弹窗首次打开前不加载分包、不挂载；首次打开后保持挂载交由 isOpen 控制显隐，保留选项卡与筛选词等内部状态
  const everOpenedModalsRef = useRef({ newTask: false, history: false, usage: false, settings: false });
  if (isNewTaskOpen) everOpenedModalsRef.current.newTask = true;
  if (isHistoryOpen) everOpenedModalsRef.current.history = true;
  if (isUsageOpen) everOpenedModalsRef.current.usage = true;
  if (isSettingsOpen) everOpenedModalsRef.current.settings = true;
  const openHistoryIds = useMemo(
    () => new Set(tasks.flatMap((task) => (task.historyId ? [`${task.accountId ?? 'default'}:${task.historyId}`, ...(!task.accountId ? [task.historyId] : [])] : []))),
    [tasks],
  );
  const accountTaskCounts = useMemo(
    () => tasks.reduce<Record<string, number>>((counts, task) => {
      if (task.accountId) counts[task.accountId] = (counts[task.accountId] ?? 0) + 1;
      return counts;
    }, {}),
    [tasks],
  );
  const fallbackKnownClis = useMemo(
    () => [...BUILTIN_CLIS, ...extraClis].filter((cli) => cli.id !== 'terminal').map((cli) => ({ id: cli.id, name: cli.name, command: cli.defaultCommand })),
    [extraClis],
  );

  return (
    <div className="workbench-ui flex h-screen w-screen bg-canvas text-fg overflow-hidden">
      {/* 左侧：CLI 品牌 Logo + 多任务树状菜单 */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        width={sidebarWidth}
        onResizeWidth={setSidebarWidth}
        onResetWidth={handleResetSidebarWidth}
        onToggleCollapse={handleToggleSidebar}
        onToggleAllFolders={handleToggleAllFolders}
        onClearStoppedTasks={handleClearStoppedTasks}
        onPinRecentFolder={handlePinRecentFolder}
        clis={visibleClis}
        folders={folders}
        tasks={visibleTasks}
        accounts={settings.accounts}
        gitBranches={gitBranches}
        summaries={summaries}
        clockOffsetHours={settings.clockOffsetHours}
        recentFolders={recentFolders}
        activeTaskId={activeTaskId}
        onAddFolder={handleAddFolderVoid}
        onSelectTask={handleSelectTask}
        onToggleFolder={handleToggleFolder}
        onReorderFolder={reorderFolder}
        onNewTask={handleSidebarNewTask}
        onCustomNewTask={handleOpenNewTask}
        onCloseTask={handleCloseTask}
        onRenameTask={handleRenameTask}
        onReorderTask={reorderTask}
        onRestartTask={handleRestartTask}
        onOpenFolder={handleOpenDirectory}
        onRemoveFolder={handleRemoveFolderVoid}
        onResumeHistory={handleResumeHistoryVoid}
        onOpenHistory={handleOpenHistory}
        unreadTaskIds={unreadTaskIds}
        onOpenSettings={handleOpenSettings}
        musicDirectory={settings.musicDirectory}
        musicStreams={settings.musicStreams}
        showMusicPlayer={settings.musicPlayerVisible}
        language={settings.language}
      />

      {/* 右侧：顶栏（单行横排纯文字额度） + 终端主视窗 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <Topbar
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
          currentGroup={currentGroup}
          activeTask={activeTask}
          emptyFolder={emptyFolder}
          accountName={activeTask?.accountId ? (settings.accounts.find((a) => a.id === activeTask.accountId)?.name ?? t('账号已删除')) : undefined}
          quota={currentQuota}
          clockOffsetHours={settings.clockOffsetHours}
          dateVisible={settings.topbarDateVisible !== false}
          onRefreshQuota={handleRefreshQuota}
          onOpenSearch={handleOpenSearch}
          onClearScreen={handleClearScreen}
          onRestartSession={handleRestartActive}
          onOpenHistory={handleOpenHistory}
          onOpenUsage={handleOpenUsage}
          onExportLogs={handleExportLogs}
          language={settings.language}
        />

        {/* 多实例保活终端容器（切换时不销毁，display: none 保活） */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <TerminalViewport
            theme={resolvedTheme}
            ref={terminalViewportRef}
            tasks={allTasks}
            activeTaskId={activeTaskId}
            fontSize={settings.terminalFontSize}
            lineHeight={settings.terminalLineHeight}
            cursorStyle={settings.terminalCursorStyle}
            cursorBlink={settings.terminalCursorBlink}
            smoothScroll={settings.terminalSmoothScroll === true}
            linkClick={settings.terminalLinkClick === true}
            emptyState={emptyState}
            onPreviewFile={handlePreviewFile}
            language={settings.language}
          />
          {filePreview && (
            <Suspense fallback={null}>
              <FilePreviewPanel
                cwd={filePreview.cwd}
                filePath={filePreview.path}
                line={filePreview.line}
                openedAt={filePreview.openedAt}
                minimap={settings.previewMinimap}
                width={previewWidth}
                onResize={setPreviewWidth}
                onResetWidth={handleResetPreviewWidth}
                onClose={handleClosePreview}
                language={settings.language}
              />
            </Suspense>
          )}
        </div>
      </div>

      {/* 新建子任务弹窗 */}
      {everOpenedModalsRef.current.newTask && (
        <Suspense fallback={null}>
          <NewTaskModal
            isOpen={isNewTaskOpen}
            onClose={() => setNewTaskContext(null)}
            clis={visibleClis}
            initialCliId={newTaskContext?.cliId}
            initialAccountId={newTaskContext?.accountId}
            folderPath={newTaskContext?.folderPath ?? workspacePath}
            tasks={tasks}
            accounts={settings.accounts}
            onCreate={(cliId, title, command, cwd, accountId) => handleCreateTask(cliId, title, command, cwd, undefined, accountId)}
          />
        </Suspense>
      )}

      {everOpenedModalsRef.current.history && (
        <Suspense fallback={null}>
          <HistoryModal
            isOpen={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            onResume={handleResumeHistory}
            initialEntries={history}
            openHistoryIds={openHistoryIds}
            accounts={settings.accounts}
          />
        </Suspense>
      )}

      {everOpenedModalsRef.current.usage && (
        <Suspense fallback={null}>
          <UsageModal isOpen={isUsageOpen} onClose={() => setIsUsageOpen(false)} accounts={settings.accounts} />
        </Suspense>
      )}

      {/* 首次启动引导：选择语言，认识各入口；完成后不再弹出 */}
      {!settings.onboardingDone && (
        <Suspense fallback={null}>
          <OnboardingModal
            isOpen={!settings.onboardingDone}
            language={settings.language}
            onLanguageChange={(language) => setSettings((prev) => ({ ...prev, language }))}
            detectedClis={installed ? visibleClis.filter((cli) => cli.id !== 'terminal').map((cli) => ({ id: cli.id, name: cli.name, icon: cli.icon })) : null}
            defaultFolder={workspacePath}
            onAddFolder={handleAddFolderVoid}
            onFinish={() => setSettings((prev) => ({ ...prev, onboardingDone: true }))}
          />
        </Suspense>
      )}

      {/* 外观与字体大小设置弹窗 */}
      {everOpenedModalsRef.current.settings && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onUpdateSettings={setSettings}
            onResetDefault={async () => {
              if (!await askConfirm({
                title: t('恢复默认设置'),
                message: t('将还原外观、终端、时间、提醒与音乐播放器的设置（含音乐目录）。账号、自定义 CLI、在线音乐和界面语言保留。'),
                confirmLabel: t('恢复默认'),
                danger: true,
              })) return;
              setSettings((prev) => ({ ...DEFAULT_SETTINGS, accounts: prev.accounts, customClis: prev.customClis, musicStreams: prev.musicStreams, language: prev.language, onboardingDone: prev.onboardingDone }));
            }}
            onLoginAccount={(account) => void handleLoginAccount(account)}
            fallbackKnownClis={fallbackKnownClis}
            installed={installed}
            onCustomClisChange={handleCustomClisChange}
            onRedetectClis={redetectClis}
            accountTaskCounts={accountTaskCounts}
          />
        </Suspense>
      )}
      <Modal
        isOpen={workReminderVisible}
        onClose={() => setWorkReminderVisible(false)}
        titleId="work-reminder-title"
        title={t('休息提醒')}
        widthClass="max-w-sm"
        footer={<button type="button" autoFocus onClick={() => setWorkReminderVisible(false)} className="btn-primary">{t('知道了')}</button>}
      >
        <p className="text-ui leading-relaxed text-fg-muted">{workReminderText(workedHours)}</p>
      </Modal>
      <ConfirmDialog options={confirmOptions} onResolve={resolveConfirm} />
    </div>
  );
};
export default App;
