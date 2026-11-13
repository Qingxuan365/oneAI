import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { TerminalViewport, TerminalViewportRef } from './components/TerminalViewport';
import { NewTaskModal, nextTaskTitle } from './components/NewTaskModal';
import { SettingsModal } from './components/SettingsModal';
import { HistoryModal } from './components/HistoryModal';
import { FilePreviewPanel } from './components/FilePreviewPanel';
import { Modal } from './components/Modal';
import { ConfirmDialog, ConfirmOptions } from './components/ConfirmDialog';
import { BrandIcon } from './components/BrandIcon';
import { AppLogo } from './components/AppLogo';
import { CliGroup, TaskSession, QuotaData, AppSettings, ThemeId, HistoryEntry } from './types';
import { THEME_MODE } from './themes';
import { isTaskAlive } from './taskStatus';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  voiceReminderEnabled: true,
  workReminderHours: 1,
  terminalFontSize: 15,
  terminalLineHeight: 1.3,
  uiScale: 'comfortable',
  terminalCursorStyle: 'bar',
  terminalCursorBlink: true,
  musicDirectory: '',
  musicPlayerVisible: true,
  clockOffsetHours: 0,
};

const DEFAULT_WORKSPACE_PATH = 'd:\\GitHub\\OneAI';
const WORKSPACES_STORAGE_KEY = 'oneai_workspaces';
const workReminderText = (hours: number) => `已经工作 ${hours} 个小时了，起来活动一下吧。`;
const appOpenedAt = Date.now();
const IDLE_AFTER_MS = 10_000;

// 启动结果转为任务状态，失败时保留原因供侧栏与终端区显示
function startOutcome(result?: { success: boolean; error?: string }): Pick<TaskSession, 'status' | 'errorMessage'> {
  return result?.success ? { status: 'running', errorMessage: undefined } : { status: 'error', errorMessage: result?.error || '终端启动失败' };
}

function workspaceKey(folder: string): string {
  return folder.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
}

function readWorkspaces(): Record<string, { groups: CliGroup[]; activeTaskId: string | null }> {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKSPACES_STORAGE_KEY) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

// 启动时以主进程落盘文件为准，回填到 localStorage（文件不存在时沿用旧 localStorage 数据）
function hydrateWorkspacesFromDisk() {
  try {
    const raw = window.electronAPI?.loadWorkspaceState?.();
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved?.workspaces && typeof saved.workspaces === 'object') {
      localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(saved.workspaces));
    }
    if (typeof saved?.activeWorkspace === 'string' && saved.activeWorkspace) {
      localStorage.setItem('oneai_active_workspace', saved.activeWorkspace);
    }
  } catch {}
}

// 同时写入主进程文件（同步落盘、原子替换）与 localStorage
function persistWorkspaces(workspaces: ReturnType<typeof readWorkspaces>, activeWorkspace: string) {
  try {
    window.electronAPI?.saveWorkspaceState?.(JSON.stringify({ workspaces, activeWorkspace }));
  } catch {}
  localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces));
  localStorage.setItem('oneai_active_workspace', activeWorkspace);
}

hydrateWorkspacesFromDisk();

function loadSavedSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('onedesktop_settings');
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

// 初始化默认 CLI 分组（绑定各 AI CLI 的真实执行命令）
const INITIAL_GROUPS: CliGroup[] = [
  {
    id: 'codex',
    name: 'Codex',
    icon: 'codex',
    defaultCommand: 'codex',
    isExpanded: true,
    tasks: [
      {
        id: 'codex-task-1',
        groupId: 'codex',
        title: 'Task 1: Codex CLI',
        status: 'running',
        cwd: 'd:\\GitHub\\OneAI',
        createdAt: Date.now() - 1000 * 60 * 30,
      },
    ],
  },
  {
    id: 'claude',
    name: 'Claude Code',
    icon: 'claude',
    defaultCommand: 'claude',
    isExpanded: false,
    tasks: [
      {
        id: 'claude-task-1',
        groupId: 'claude',
        title: 'Task 1: Claude CLI',
        status: 'running',
        cwd: 'd:\\GitHub\\OneAI',
        createdAt: Date.now() - 1000 * 60 * 15,
      },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi Code',
    icon: 'kimi',
    defaultCommand: 'kimi',
    isExpanded: true,
    tasks: [
      {
        id: 'kimi-task-1',
        groupId: 'kimi',
        title: 'Task 1: Kimi CLI',
        status: 'running',
        cwd: 'd:\\GitHub\\OneAI',
        createdAt: Date.now() - 1000 * 60 * 5,
      },
    ],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    icon: 'opencode',
    defaultCommand: 'opencode',
    isExpanded: false,
    tasks: [
      {
        id: 'opencode-task-1',
        groupId: 'opencode',
        title: 'Task 1: OpenCode CLI',
        status: 'running',
        cwd: 'd:\\GitHub\\OneAI',
        createdAt: Date.now() - 1000 * 60 * 1,
      },
    ],
  },
  {
    id: 'grok',
    name: 'Grok Build',
    icon: 'grok',
    defaultCommand: 'grok',
    isExpanded: false,
    tasks: [
      {
        id: 'grok-task-1',
        groupId: 'grok',
        title: 'Task 1: Grok Build',
        status: 'running',
        cwd: 'd:\\GitHub\\OneAI',
        createdAt: Date.now() - 1000 * 60 * 2,
      },
    ],
  },
  {
    id: 'terminal',
    name: '系统终端',
    icon: 'terminal',
    defaultCommand: 'powershell.exe',
    isExpanded: false,
    tasks: [
      {
        id: 'terminal-task-1',
        groupId: 'terminal',
        title: 'Task 1: PowerShell',
        status: 'running',
        cwd: 'd:\\GitHub\\OneAI',
        createdAt: Date.now(),
      },
    ],
  },
];

const LEGACY_DEFAULT_ORDER = ['kimi', 'codex', 'claude', 'opencode', 'grok', 'terminal'];

function loadWorkspace(folder: string): { groups: CliGroup[]; activeTaskId: string | null } {
  try {
    const saved = readWorkspaces()[workspaceKey(folder)]
      || (workspaceKey(folder) === workspaceKey(DEFAULT_WORKSPACE_PATH)
        ? JSON.parse(localStorage.getItem('oneai_workspace') || 'null')
        : null);
    if (saved?.groups && Array.isArray(saved.groups)) {
      // 旧版默认顺序（kimi 在前）视为用户未手动排序，改用当前默认顺序；手动拖拽过的顺序继续保留
      const builtinIds = new Set(INITIAL_GROUPS.map((group) => group.id));
      const savedBuiltinOrder = saved.groups.map((item: CliGroup) => item.id).filter((id: string) => builtinIds.has(id));
      const savedOrder: string[] = savedBuiltinOrder.join() === LEGACY_DEFAULT_ORDER.join()
        ? INITIAL_GROUPS.map((group) => group.id)
        : saved.groups.map((item: CliGroup) => item.id);
      const groups = [...INITIAL_GROUPS].sort((a, b) => {
        const aIndex = savedOrder.indexOf(a.id);
        const bIndex = savedOrder.indexOf(b.id);
        return (aIndex < 0 ? Infinity : aIndex) - (bIndex < 0 ? Infinity : bIndex);
      }).map((base) => {
        const stored = saved.groups.find((item: CliGroup) => item.id === base.id);
        return stored ? {
          ...base,
          isExpanded: Boolean(stored.isExpanded),
          tasks: Array.isArray(stored.tasks) ? stored.tasks.map((task: TaskSession) => ({
            ...task,
            status: 'stopped' as const,
          })) : [],
        } : { ...base, tasks: [] };
      });
      // 保留自动检测生成的扩展分组（不在内置列表中）
      for (const stored of saved.groups as CliGroup[]) {
        if (INITIAL_GROUPS.some((base) => base.id === stored.id) || !stored.defaultCommand) continue;
        groups.push({
          ...stored,
          tasks: Array.isArray(stored.tasks) ? stored.tasks.map((task: TaskSession) => ({ ...task, status: 'stopped' as const })) : [],
        });
      }
      const taskIds = new Set(groups.flatMap((group: CliGroup) => group.tasks.map((task: TaskSession) => task.id)));
      return { groups, activeTaskId: saved.activeTaskId && taskIds.has(saved.activeTaskId) ? saved.activeTaskId : groups.flatMap((g) => g.tasks)[0]?.id || null };
    }
  } catch {}
  if (workspaceKey(folder) !== workspaceKey(DEFAULT_WORKSPACE_PATH)) {
    return { groups: INITIAL_GROUPS.map((group) => ({ ...group, tasks: [] })), activeTaskId: null };
  }
  return {
    groups: INITIAL_GROUPS.map((group) => ({
      ...group,
      tasks: group.tasks.map((task) => ({ ...task, status: 'stopped' as const })),
    })),
    activeTaskId: 'codex-task-1',
  };
}

type DetectedCli = { id: string; name: string; command: string };

// 已安装但没有对应分组的 CLI，自动补一个通用分组
function withDetectedExtras(groups: CliGroup[], detected: DetectedCli[]): CliGroup[] {
  const extras: CliGroup[] = detected
    .filter((cli) => !groups.some((g) => g.id === cli.id))
    .map((cli) => ({ id: cli.id, name: cli.name, icon: cli.id, defaultCommand: cli.command, isExpanded: false, tasks: [] }));
  return extras.length ? [...groups, ...extras] : groups;
}

const INITIAL_WORKSPACE_PATH = localStorage.getItem('oneai_active_workspace') || DEFAULT_WORKSPACE_PATH;
const INITIAL_WORKSPACE = loadWorkspace(INITIAL_WORKSPACE_PATH);

export const App: React.FC = () => {
  const [workspacePath, setWorkspacePath] = useState(INITIAL_WORKSPACE_PATH);
  const [groups, setGroups] = useState<CliGroup[]>(INITIAL_WORKSPACE.groups);
  const reorderGroup = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setGroups((current) => {
      const sourceIndex = current.findIndex((group) => group.id === sourceId);
      const targetIndex = current.findIndex((group) => group.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [source] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, source);
      return next;
    });
  }, []);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(INITIAL_WORKSPACE.activeTaskId);
  const reorderTask = useCallback((groupId: string, sourceId: string, targetId: string) => {
    setGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      const sourceIndex = group.tasks.findIndex((task) => task.id === sourceId);
      const targetIndex = group.tasks.findIndex((task) => task.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return group;
      const tasks = [...group.tasks];
      const [source] = tasks.splice(sourceIndex, 1);
      tasks.splice(targetIndex, 0, source);
      return { ...group, tasks };
    }));
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
  const notify = useCallback((title: string, message: string) => askConfirm({ title, message, notice: true, confirmLabel: '知道了' }), [askConfirm]);

  // 关闭窗口时仍有终端进程在运行：先确认，再通知主进程真正关闭
  useEffect(() => window.electronAPI?.onWindowCloseRequest?.(async (aliveCount) => {
    if (await askConfirm({
      title: '关闭 OneAI',
      message: `还有 ${aliveCount} 个终端进程在运行，关闭窗口会全部终止。`,
      confirmLabel: '关闭并终止',
      danger: true,
    })) window.electronAPI?.confirmWindowClose?.();
    else window.electronAPI?.cancelWindowClose?.();
  }), [askConfirm]);
  // 字体与外观设置状态（自动持久化到 localStorage）
  const [settings, setSettings] = useState<AppSettings>(loadSavedSettings);
  const voiceReminderEnabledRef = useRef(settings.voiceReminderEnabled);
  voiceReminderEnabledRef.current = settings.voiceReminderEnabled;

  const workReminderHours = Number.isFinite(settings.workReminderHours) ? Math.max(1, Math.min(12, Math.trunc(settings.workReminderHours))) : 1;

  // 从应用启动起算，满设定小时数时提醒一次；改小到已经过去的时长时不补弹
  useEffect(() => {
    const remaining = appOpenedAt + workReminderHours * 60 * 60 * 1000 - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => {
      setWorkReminderVisible(true);
      if (voiceReminderEnabledRef.current && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(workReminderText(workReminderHours));
        utterance.lang = 'zh-CN';
        window.speechSynthesis.speak(utterance);
      }
    }, remaining);
    return () => {
      window.clearTimeout(timer);
    };
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
  const [filePreview, setFilePreview] = useState<{ cwd: string; path: string; line?: number; openedAt: number } | null>(null);
  const [previewWidth, setPreviewWidth] = useState(420);
  // null 表示尚未检测完成（或非 Electron 预览），此时显示全部分组
  const [installed, setInstalled] = useState<Record<string, boolean> | null>(null);
  // 启动时的检测结果，切换工作文件夹后用它重新补齐扩展分组
  const detectedClisRef = useRef<DetectedCli[]>([]);
  const visibleGroups = useMemo(
    () => installed ? groups.filter((g) => g.id === 'terminal' || installed[g.id]) : groups,
    [groups, installed],
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('oneai_sidebar_collapsed') === 'true'; } catch { return false; }
  });

  // 弹窗状态
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [selectedGroupIdForNewTask, setSelectedGroupIdForNewTask] = useState<string | null>(null);

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
    try {
      const workspaces = readWorkspaces();
      workspaces[workspaceKey(workspacePath)] = { groups, activeTaskId };
      persistWorkspaces(workspaces, workspacePath);
    } catch (error) {
      console.warn('[OneAI] 无法保存工作区状态', error);
    }
  }, [groups, activeTaskId, workspacePath]);

  useEffect(() => {
    try { localStorage.setItem('oneai_sidebar_collapsed', String(isSidebarCollapsed)); } catch {}
  }, [isSidebarCollapsed]);

  // 全局快捷键缩放终端字体（Ctrl + / Ctrl - / Ctrl 0）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
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
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 所有子任务扁平数组
  const allTasks = useMemo(() => {
    return groups.flatMap((g) => g.tasks);
  }, [groups]);

  // 当前激活的任务与对应的 CLI 组
  const activeTask = useMemo(() => {
    return allTasks.find((t) => t.id === activeTaskId) || null;
  }, [allTasks, activeTaskId]);

  const currentGroup = useMemo(() => {
    if (!activeTask) return null;
    return groups.find((g) => g.id === activeTask.groupId) || null;
  }, [groups, activeTask]);

  // 当前选中 CLI 对应的实时配额
  const currentQuota = useMemo(() => {
    if (!currentGroup) return null;
    return quotas[currentGroup.id] || null;
  }, [quotas, currentGroup]);

  // 初始化拉取各 CLI 真实配额与订阅后台推送
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getAllQuotas().then((all) => {
        if (all) setQuotas(all);
      });
      const unsub = window.electronAPI.onQuotaUpdate((updatedQuotas) => {
        if (updatedQuotas) setQuotas(updatedQuotas);
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
          message: '未检测到本地配置',
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
      window.electronAPI.detectClis().catch(() => null).then((list) => {
        if (disposed) return;
        const detected = list ? Object.fromEntries(list.map((cli) => [cli.id, true])) : null;
        setInstalled(detected);
        detectedClisRef.current = list || [];
        setGroups((prev) => withDetectedExtras(prev, detectedClisRef.current));
        const visible = detected ? groups.filter((g) => g.id === 'terminal' || detected[g.id]) : groups;
        const initialGroup = visible.find((group) => group.tasks.some((task) => task.id === activeTaskId))
          || visible.find((group) => group.tasks.length > 0);
        const initialTask = initialGroup?.tasks.find((task) => task.id === activeTaskId) || initialGroup?.tasks[0];
        if (initialGroup && initialTask) {
          if (initialTask.id !== activeTaskId) setActiveTaskId(initialTask.id);
          setGroups((prev) => prev.map((g) => ({ ...g, tasks: g.tasks.map((t) => t.id === initialTask.id ? { ...t, status: 'starting' } : t) })));
          window.electronAPI.createSession({ id: initialTask.id, command: initialTask.command || initialGroup.defaultCommand, cwd: initialTask.cwd }).then((result) => {
            setGroups((prev) => prev.map((g) => ({ ...g, tasks: g.tasks.map((t) => t.id === initialTask.id ? { ...t, ...startOutcome(result) } : t) })));
          }).catch(() => setGroups((prev) => prev.map((g) => ({ ...g, tasks: g.tasks.map((t) => t.id === initialTask.id ? { ...t, status: 'error' } : t) }))));
        } else {
          setActiveTaskId(null);
        }
      });

      // 监听终端进程退出事件，将对应任务状态翻转为 'stopped'
      const unsub = window.electronAPI.onSessionExit(({ id }) => {
        const exited = groupsRef.current.flatMap((g) => g.tasks).find((t) => t.id === id);
        if (exited && isTaskAlive(exited.status)) markUnread([id]);
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            tasks: g.tasks.map((t) =>
              t.id === id ? { ...t, status: 'stopped' } : t
            ),
          }))
        );
      });
      return () => { disposed = true; unsub(); };
    }
  }, []);

  // 空闲检测：运行中的任务连续 IDLE_AFTER_MS 没有输出标为「空闲」，再有输出立即回到「运行中」。
  // 只能判断输出静默，无法区分「已完成」与「在等待确认」。
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  useEffect(() => {
    if (!window.electronAPI?.onSessionData) return;
    const lastOutput = new Map<string, number>();
    const setStatus = (ids: string[], from: TaskSession['status'], to: TaskSession['status']) => {
      if (ids.length === 0) return;
      setGroups((prev) => prev.map((g) => ({
        ...g,
        tasks: g.tasks.map((t) => ids.includes(t.id) && t.status === from ? { ...t, status: to } : t),
      })));
    };
    const unsub = window.electronAPI.onSessionData(({ id }) => {
      lastOutput.set(id, Date.now());
      const task = groupsRef.current.flatMap((g) => g.tasks).find((t) => t.id === id);
      if (task?.status === 'idle') setStatus([id], 'idle', 'running');
    });
    const timer = window.setInterval(() => {
      const now = Date.now();
      const idleIds = groupsRef.current.flatMap((g) => g.tasks)
        .filter((t) => t.status === 'running' && now - (lastOutput.get(t.id) ?? now) > IDLE_AFTER_MS)
        .map((t) => t.id);
      // 尚无输出记录的任务从现在开始计时
      groupsRef.current.flatMap((g) => g.tasks).forEach((t) => { if (!lastOutput.has(t.id)) lastOutput.set(t.id, now); });
      setStatus(idleIds, 'running', 'idle');
      markUnread(idleIds);
    }, 2000);
    return () => { unsub?.(); window.clearInterval(timer); };
  }, []);

  // 切换折叠/展开 CLI 分组
  const handleToggleGroup = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, isExpanded: !g.isExpanded } : g))
    );
  };

  // 选中具体某个子任务
  // startIfStopped 为 false 时只切换视图，不拉起已停止的任务（键盘轮换、关闭后接替）
  const handleSelectTask = (taskId: string, groupId: string, startIfStopped = true) => {
    setActiveTaskId(taskId);
    // 保证该分组处于展开状态
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, isExpanded: true } : g))
    );
    const task = allTasks.find((item) => item.id === taskId);
    const group = groups.find((item) => item.id === groupId);
    // createSession 对已存在的 PTY 是幂等操作。每次选择都校验一次，避免界面状态
    // 与主进程真实会话脱节后，键盘输入被 writeSession 静默丢弃。
    if (window.electronAPI && task && group && (startIfStopped || isTaskAlive(task.status))) {
      if (!isTaskAlive(task.status) || task.status === 'starting') {
        setGroups((prev) => prev.map((g) => ({ ...g, tasks: g.tasks.map((t) => t.id === taskId ? { ...t, status: 'starting' } : t) })));
      }
      window.electronAPI.createSession({ id: taskId, command: task.command || group.defaultCommand, cwd: task.cwd }).then((result) => {
        setGroups((prev) => prev.map((g) => ({ ...g, tasks: g.tasks.map((t) => t.id === taskId ? { ...t, ...startOutcome(result) } : t) })));
      }).catch(() => setGroups((prev) => prev.map((g) => ({ ...g, tasks: g.tasks.map((t) => t.id === taskId ? { ...t, status: 'error' } : t) }))));
    }
  };

  // 触发新建子任务弹窗
  const handleOpenNewTask = (groupId: string) => {
    setSelectedGroupIdForNewTask(groupId);
    setIsNewTaskOpen(true);
  };

  const handleSwitchWorkspace = async () => {
    const folder = await window.electronAPI?.selectWorkspaceDirectory?.(workspacePath);
    if (!folder || workspaceKey(folder) === workspaceKey(workspacePath)) return;

    const runningCount = allTasks.filter((task) => isTaskAlive(task.status)).length;
    if (runningCount > 0 && !await askConfirm({
      title: '切换工作文件夹',
      message: `切换会结束当前文件夹的 ${runningCount} 个终端进程，任务列表会保留。`,
      confirmLabel: '结束并切换',
      danger: true,
    })) return;

    try {
      const workspaces = readWorkspaces();
      workspaces[workspaceKey(workspacePath)] = { groups, activeTaskId };
      persistWorkspaces(workspaces, folder);
      await Promise.all(allTasks.map((task) => window.electronAPI.killSession(task.id)));
      const next = loadWorkspace(folder);
      setWorkspacePath(folder);
      setGroups(withDetectedExtras(next.groups, detectedClisRef.current));
      setActiveTaskId(next.activeTaskId);
      setIsNewTaskOpen(false);
      setUnreadTaskIds(new Set());

      const nextGroup = next.groups.find((group) => group.tasks.some((task) => task.id === next.activeTaskId));
      const nextTask = nextGroup?.tasks.find((task) => task.id === next.activeTaskId);
      if (nextTask && nextGroup) {
        setGroups((prev) => prev.map((group) => ({ ...group, tasks: group.tasks.map((task) => task.id === nextTask.id ? { ...task, status: 'starting' } : task) })));
        const result = await window.electronAPI.createSession({ id: nextTask.id, command: nextTask.command || nextGroup.defaultCommand, cwd: nextTask.cwd });
        setGroups((prev) => prev.map((group) => ({ ...group, tasks: group.tasks.map((task) => task.id === nextTask.id ? { ...task, ...startOutcome(result) } : task) })));
      }
    } catch (error) {
      void notify('切换工作文件夹失败', error instanceof Error ? error.message : '未知错误');
    }
  };

  // 创建子任务
  const handleCreateTask = useCallback(async (groupId: string, title: string, command: string, cwd: string, historyId?: string): Promise<{ success: boolean; error?: string }> => {
    const newTaskId = `${groupId}-task-${Date.now().toString(36)}`;
    const resolvedCwd = cwd || workspacePath;
    if (window.electronAPI) {
      const result = await window.electronAPI.createSession({ id: newTaskId, command: command || 'powershell.exe', cwd: resolvedCwd });
      if (!result.success) return { success: false, error: result.error || '终端启动失败' };
    }
    const newTask: TaskSession = {
      id: newTaskId,
      groupId,
      title,
      command: command || 'powershell.exe',
      historyId,
      status: 'running',
      cwd: resolvedCwd,
      createdAt: Date.now(),
    };

    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, isExpanded: true, tasks: [...g.tasks, newTask] }
          : g
      )
    );

    setActiveTaskId(newTaskId);

    return { success: true };
  }, [workspacePath]);

  // 一键新建：用默认名称、分组默认命令和当前工作文件夹直接启动；失败时转到自定义弹窗修改
  const quickCreatingRef = useRef(new Set<string>());
  const handleQuickNewTask = async (groupId: string) => {
    const group = groups.find((item) => item.id === groupId);
    if (!group || quickCreatingRef.current.has(groupId)) return;
    quickCreatingRef.current.add(groupId);
    try {
      const result = await handleCreateTask(groupId, nextTaskTitle(group), group.defaultCommand, workspacePath);
      if (!result.success) {
        await notify('任务启动失败', `${result.error || '终端启动失败'}。可以在接下来的窗口中修改启动命令或工作目录。`);
        handleOpenNewTask(groupId);
      }
    } finally {
      quickCreatingRef.current.delete(groupId);
    }
  };

  // 关闭具体子任务
  const handleCloseTask = useCallback(async (taskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const task = allTasks.find((item) => item.id === taskId);
    if (task && isTaskAlive(task.status) && !await askConfirm({
      title: '关闭任务',
      message: `关闭“${task.title}”会终止此终端及其中运行的命令。`,
      confirmLabel: '关闭并终止',
      danger: true,
    })) return;

    if (window.electronAPI) {
      window.electronAPI.killSession(taskId);
    }

    setGroups((prev) => {
      const updated = prev.map((g) => ({
        ...g,
        tasks: g.tasks.filter((t) => t.id !== taskId),
      }));
      return updated;
    });

    if (activeTaskId === taskId) {
      // 优先切到同一 CLI 分组内的相邻任务，再回退到其他分组。
      const sourceGroup = groups.find((group) => group.id === task?.groupId);
      const groupIndex = sourceGroup?.tasks.findIndex((item) => item.id === taskId) ?? -1;
      const remainingInGroup = sourceGroup?.tasks.filter((item) => item.id !== taskId) || [];
      const sameGroupTask = groupIndex >= 0
        ? remainingInGroup[groupIndex] || remainingInGroup[groupIndex - 1]
        : undefined;
      const remaining = visibleGroups.flatMap((g) => g.tasks).filter((t) => t.id !== taskId);
      const nextTask = sameGroupTask || remaining[0];
      setActiveTaskId(nextTask?.id || null);
      if (nextTask) setGroups((prev) => prev.map((group) => group.id === nextTask.groupId ? { ...group, isExpanded: true } : group));
    }
  }, [activeTaskId, allTasks, groups, visibleGroups, askConfirm]);

  const handleRenameTask = useCallback((taskId: string, title: string) => {
    setGroups((prev) => prev.map((g) => ({ ...g, tasks: g.tasks.map((t) => t.id === taskId ? { ...t, title } : t) })));
  }, []);

  // 手动刷新当前选中 CLI 的真实配额
  const handleRefreshQuota = async () => {
    if (window.electronAPI) {
      const latest = await window.electronAPI.refreshQuota(currentGroup?.id);
      if (latest) setQuotas(latest);
    }
  };

  // 重启指定任务，未指定时为当前任务
  const handleRestartSession = useCallback(async (taskId: string | null = activeTaskId) => {
    const task = allTasks.find((item) => item.id === taskId);
    if (!taskId || !task || task.status === 'starting') return;
    if (isTaskAlive(task.status) && !await askConfirm({
      title: '重启终端',
      message: `重启“${task.title}”会终止当前终端命令。`,
      confirmLabel: '重启',
      danger: true,
    })) return;
    setGroups((prev) => prev.map((g) => ({ ...g, tasks: g.tasks.map((t) => t.id === taskId ? { ...t, status: 'starting' } : t) })));
    const result = await terminalViewportRef.current?.restartActiveTerminal(taskId);
    setGroups((prev) => prev.map((g) => ({ ...g, tasks: g.tasks.map((t) => t.id === taskId ? { ...t, ...startOutcome(result) } : t) })));
  }, [activeTaskId, allTasks, askConfirm]);

  // 侧栏右键「重启」：已停止的任务切过去并启动，存活的任务原地重启
  const handleRestartTask = (taskId: string) => {
    const task = allTasks.find((item) => item.id === taskId);
    if (!task) return;
    if (isTaskAlive(task.status)) void handleRestartSession(taskId);
    else handleSelectTask(taskId, task.groupId);
  };

  const handleOpenTaskDirectory = async (taskId: string) => {
    const task = allTasks.find((item) => item.id === taskId);
    if (!task) return;
    if (!await window.electronAPI?.openDirectory?.(task.cwd)) void notify('无法打开目录', `${task.cwd} 不存在或无法访问。`);
  };

  // 从历史会话恢复：已有对应任务则直接切换，否则用 CLI 自带的恢复命令新建任务
  const handleResumeHistory = async (entry: HistoryEntry) => {
    const group = groups.find((g) => g.id === entry.cliId);
    if (!group || !visibleGroups.includes(group)) {
      void notify('无法恢复会话', `本机未检测到 ${entry.cliId} 命令。`);
      return;
    }
    setIsHistoryOpen(false);
    const existing = allTasks.find((task) => task.historyId === entry.id);
    if (existing) {
      handleSelectTask(existing.id, group.id);
      return;
    }
    const result = await handleCreateTask(group.id, entry.title, entry.command, entry.cwd, entry.id);
    if (!result.success) void notify('恢复会话失败', result.error || '终端启动失败');
  };

  const currentGroupForModal =groups.find((g) => g.id === selectedGroupIdForNewTask) || null;

  // 全局快捷键。在捕获阶段处理并阻止继续传播，避免同一按键再被 xterm 发往 CLI；
  // 只占用终端程序基本不用的组合（Ctrl+Tab、Ctrl+数字、Ctrl+Shift+字母、Ctrl+,）。
  const shortcutRef = useRef<(e: KeyboardEvent) => boolean>(() => false);
  shortcutRef.current = (e) => {
    if (!e.ctrlKey || e.altKey || e.metaKey) return false;
    if (isNewTaskOpen || isSettingsOpen || isHistoryOpen || workReminderVisible || confirmOptions) return false;
    const tasks = visibleGroups.flatMap((group) => group.tasks);
    const key = e.key.toLowerCase();
    if (key === 'tab') {
      if (tasks.length < 2) return true;
      const index = tasks.findIndex((task) => task.id === activeTaskId);
      const next = index < 0
        ? tasks[e.shiftKey ? tasks.length - 1 : 0]
        : tasks[(index + (e.shiftKey ? -1 : 1) + tasks.length) % tasks.length];
      handleSelectTask(next.id, next.groupId, false);
      return true;
    }
    if (!e.shiftKey && e.code.startsWith('Digit') && e.code !== 'Digit0') {
      const target = tasks[Number(e.code.slice(5)) - 1];
      if (target) handleSelectTask(target.id, target.groupId, false);
      return true;
    }
    if (!e.shiftKey && key === ',') { setIsSettingsOpen(true); return true; }
    if (!e.shiftKey) return false;
    if (key === 't' || key === 'n') {
      const group = (currentGroup && visibleGroups.includes(currentGroup) ? currentGroup : visibleGroups[0]);
      if (group) {
        if (key === 't') void handleQuickNewTask(group.id);
        else handleOpenNewTask(group.id);
      }
      return true;
    }
    if (key === 'w') {
      if (activeTask && visibleGroups.some((group) => group.id === activeTask.groupId)) void handleCloseTask(activeTask.id);
      return true;
    }
    if (key === 'b') { setIsSidebarCollapsed((collapsed) => !collapsed); return true; }
    if (key === 'h') { setIsHistoryOpen(true); return true; }
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

  // 没有活动任务时的引导：列出本机可用的 CLI，点击即进入新建任务
  const emptyState = (
    <div className={`w-full text-center ${visibleGroups.length <= 4 ? 'max-w-md' : 'max-w-lg'}`}>
      <AppLogo size={44} className="mx-auto" />
      <h2 className="mt-4 text-lg font-semibold text-fg">开始一个任务</h2>
      <p className="mt-1.5 text-ui text-fg-subtle">点击 CLI 直接在当前工作文件夹中启动，右键可自定义命令与目录。</p>
      <div className={`mt-6 grid grid-cols-2 gap-2.5 ${visibleGroups.length <= 4 ? '' : 'sm:grid-cols-3'}`}>
        {visibleGroups.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => void handleQuickNewTask(group.id)}
            onContextMenu={(e) => { e.preventDefault(); handleOpenNewTask(group.id); }}
            title={`启动 ${group.name}（右键可自定义命令与目录）`}
            className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-left text-ui font-medium text-fg-muted transition-colors hover:border-accent/60 hover:bg-hover hover:text-fg"
          >
            <BrandIcon icon={group.icon} size={18} />
            <span className="truncate">{group.name}</span>
          </button>
        ))}
      </div>
      <p className="mt-6 text-xs text-fg-faint">
        <kbd className="rounded border border-line-strong bg-muted px-1.5 py-0.5 font-mono">Ctrl + Shift + T</kbd> 新建任务
        <span className="mx-2">·</span>
        <kbd className="rounded border border-line-strong bg-muted px-1.5 py-0.5 font-mono">Ctrl + Shift + H</kbd> 恢复历史会话
      </p>
    </div>
  );

  return (
    <div className="workbench-ui flex h-screen w-screen bg-canvas text-fg overflow-hidden">
      {/* 左侧：CLI 品牌 Logo + 多任务树状菜单 */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        groups={visibleGroups}
        workspacePath={workspacePath}
        onSwitchWorkspace={handleSwitchWorkspace}
        activeTaskId={activeTaskId}
        onSelectTask={handleSelectTask}
        onToggleGroup={handleToggleGroup}
        onReorderGroup={reorderGroup}
        onNewTask={(groupId) => void handleQuickNewTask(groupId)}
        onCustomNewTask={handleOpenNewTask}
        onCloseTask={handleCloseTask}
        onRenameTask={handleRenameTask}
        onReorderTask={reorderTask}
        onRestartTask={handleRestartTask}
        onOpenTaskDirectory={(taskId) => void handleOpenTaskDirectory(taskId)}
        unreadTaskIds={unreadTaskIds}
        onOpenSettings={() => setIsSettingsOpen(true)}
        musicDirectory={settings.musicDirectory}
        showMusicPlayer={settings.musicPlayerVisible}
      />

      {/* 右侧：顶栏（单行横排纯文字额度） + 终端主视窗 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <Topbar
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
          currentGroup={currentGroup}
          activeTask={activeTask}
          quota={currentQuota}
          clockOffsetHours={settings.clockOffsetHours}
          onRefreshQuota={handleRefreshQuota}
          onOpenSearch={() => terminalViewportRef.current?.openSearch()}
          onClearScreen={() => terminalViewportRef.current?.clearActiveTerminal()}
          onRestartSession={() => handleRestartSession()}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onExportLogs={async (mode) => terminalViewportRef.current?.exportActiveTerminalLog(mode) || { success: false, error: '没有活动终端' }}
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
            emptyState={emptyState}
            onPreviewFile={(cwd, path, line) => setFilePreview({ cwd, path, line, openedAt: Date.now() })}
          />
          {filePreview && (
            <FilePreviewPanel
              cwd={filePreview.cwd}
              filePath={filePreview.path}
              line={filePreview.line}
              openedAt={filePreview.openedAt}
              width={previewWidth}
              onResize={setPreviewWidth}
              onClose={() => setFilePreview(null)}
            />
          )}
        </div>
      </div>

      {/* 新建子任务弹窗 */}
      <NewTaskModal
        group={currentGroupForModal}
        workspacePath={workspacePath}
        isOpen={isNewTaskOpen}
        onClose={() => setIsNewTaskOpen(false)}
        onCreate={handleCreateTask}
      />

      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onResume={handleResumeHistory}
      />

      {/* 外观与字体大小设置弹窗 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        onResetDefault={() => setSettings(DEFAULT_SETTINGS)}
      />
      <Modal
        isOpen={workReminderVisible}
        onClose={() => setWorkReminderVisible(false)}
        titleId="work-reminder-title"
        title="休息提醒"
        widthClass="max-w-sm"
        footer={<button type="button" autoFocus onClick={() => setWorkReminderVisible(false)} className="btn-primary">知道了</button>}
      >
        <p className="text-ui leading-relaxed text-fg-muted">{workReminderText(workReminderHours)}</p>
      </Modal>
      <ConfirmDialog options={confirmOptions} onResolve={resolveConfirm} />
    </div>
  );
};
export default App;
