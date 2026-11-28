import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpCircle, BedDouble, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, Folder, FolderOpen, FolderPlus, GitBranch, GripVertical, History, House, LayoutDashboard, Moon, PanelLeftOpen, Pencil, Plus, RotateCcw, Settings, ShieldCheck, SlidersHorizontal, Sun, Trash2, User, X } from 'lucide-react';
import { Account, CliDef, FolderEntry, GitStatusResult, HistoryEntry, MusicStream, TaskSession, UpdateState, WorkScheduleGreetings } from '../types';

const NO_STREAMS: MusicStream[] = [];
// 一个文件夹的任务数超过这个值时，侧栏对屏幕外的任务行启用 content-visibility
const LARGE_FOLDER_TASKS = 30;
// 右键任务菜单按需读取 Git 状态的短缓存：避免重复右键或点选审核 Agent 时重复拉起 git 子进程
const REVIEW_STATUS_CACHE_TTL_MS = 3_000;
const REVIEW_STATUS_CACHE_MAX = 24;

type ReviewGitHint =
  | { kind: 'changes'; count: number; status: GitStatusResult }
  | { kind: 'clean'; status: GitStatusResult }
  | { kind: 'non-git' };
import { TASK_STATUS_META, isTaskAlive } from '../taskStatus';
import { folderKey, folderName, historySessionKey, orderedTasks, RecentFolder } from '../workspaceState';
import { SUMMARY_CLIS, formatAgo, formatClock } from '../taskSummary';
import { BrandIcon } from './BrandIcon';
import { AppLogo } from './AppLogo';
import { MusicPlayer } from './MusicPlayer';
import { version } from '../../../../package.json';
import { t } from '../i18n';
import { sortClisAlphabetically } from '../clis';
import { defaultGreetingText, resolveGreetingSlot } from '../workGreeting';

function FolderTaskPulses({ runningIds, layoutKey }: { runningIds: string; layoutKey: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const gradientId = useId();
  const [routes, setRoutes] = useState<Array<{ id: string; x: number; y: number }>>([]);

  useLayoutEffect(() => {
    const list = svg.current?.parentElement;
    if (!list) return;
    const running = new Set(runningIds.split('\0'));
    const rows = Array.from(list.children).filter((node): node is HTMLElement =>
      node instanceof HTMLElement && running.has(node.dataset.taskId ?? ''));
    const measure = () => {
      const next = rows.map((row) => ({
        id: row.dataset.taskId!,
        x: row.offsetLeft + 2,
        y: 5 + row.offsetTop + row.offsetHeight / 2,
      }));
      setRoutes((previous) => previous.length === next.length
        && previous.every((route, i) => route.id === next[i].id && route.x === next[i].x && route.y === next[i].y)
        ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    rows.forEach((row) => observer.observe(row));
    const syncPlayback = () => {
      const node = svg.current;
      if (!node || typeof node.pauseAnimations !== 'function') return;
      const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
      if (document.hidden || !focused) node.pauseAnimations();
      else node.unpauseAnimations();
    };
    syncPlayback();
    window.addEventListener('focus', syncPlayback);
    window.addEventListener('blur', syncPlayback);
    document.addEventListener('visibilitychange', syncPlayback);
    return () => {
      observer.disconnect();
      window.removeEventListener('focus', syncPlayback);
      window.removeEventListener('blur', syncPlayback);
      document.removeEventListener('visibilitychange', syncPlayback);
    };
  }, [runningIds, layoutKey]);

  const yMax = Math.max(0, ...routes.map((route) => route.y));
  const xMax = Math.max(1, ...routes.map((route) => route.x));
  return (
    <svg ref={svg} width={xMax + 1} height={yMax + 1} data-folder-task-pulses aria-hidden="true"
      className="pointer-events-none absolute -left-px -top-[5px] !mt-0 overflow-visible text-accent"
      fill="none" stroke={`url(#${gradientId})`} strokeWidth="1.5" strokeLinecap="round">
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x2="14" y2="24" spreadMethod="repeat">
          <stop offset="0" className="folder-task-flow-base" />
          <stop offset=".42" className="folder-task-flow-highlight" />
          <stop offset=".68" className="folder-task-flow-middle" />
          <stop offset="1" className="folder-task-flow-base" />
          <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="14 24"
            dur="1.4s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      <path d={`M 1 0 V ${yMax}`} className="folder-task-flow-line" />
      {routes.map(({ id, x, y }) => (
        <path key={id} data-folder-task-pulse={id} d={`M 1 ${y} H ${x}`} className="folder-task-flow-line" />
      ))}
    </svg>
  );
}

interface SidebarProps {
  isCollapsed: boolean;
  /** 本机已安装、可以新建任务的 CLI */
  clis: CliDef[];
  folders: FolderEntry[];
  /** 可见任务（已过滤掉未安装 CLI 的任务），按全局顺序 */
  tasks: TaskSession[];
  accounts?: Account[];
  /** 各文件夹的 Git 分支，键为 folderKey；不在仓库内或尚未读到时缺省 */
  gitBranches?: Record<string, string | null>;
  /** 任务行第二行：任务会话里最近一条用户消息；text 为 null 表示新会话，缺省表示尚未读到（仅 Claude / Codex / Kimi 任务显示这一行） */
  summaries?: Record<string, { text: string | null }>;
  /** 「新会话 · 时间」与左上角问候语使用的时钟偏移（小时），与状态栏时钟一致 */
  clockOffsetHours?: number;
  /** 工作时间段（HH:MM），用于驱动左上角按时段切换的提示语 */
  workStartTime?: string;
  workEndTime?: string;
  /** 各时段自定义提示语，空串使用默认提示语 */
  greetingMessages?: Partial<WorkScheduleGreetings>;
  /** 由历史会话归类出的「最近任务」文件夹 */
  recentFolders?: RecentFolder[];
  activeTaskId: string | null;
  /** Dashboard 主视图是否处于激活状态 */
  isDashboardActive?: boolean;
  /** 后台有新结果、尚未切过去查看的任务 */
  unreadTaskIds?: ReadonlySet<string>;
  /** 自定义侧栏宽度（px）；缺省时随 uiScale 使用 w-80 */
  width?: number | null;
  onResizeWidth?: (width: number) => void;
  onResetWidth?: () => void;
  onToggleCollapse?: () => void;
  onToggleAllFolders?: (expand: boolean) => void;
  onClearStoppedTasks?: (folderPath: string) => void;
  onPinRecentFolder?: (folderPath: string) => void;
  onAddFolder: () => void;
  onOpenDashboard?: () => void;
  onOpenHome?: () => void;
  onSelectTask: (taskId: string) => void;
  onToggleFolder: (folderPath: string) => void;
  onReorderFolder: (sourcePath: string, targetPath: string) => void;
  /** 一键新建：用该 CLI 的默认命令在文件夹里直接启动；accountId 缺省为默认账号 */
  onNewTask: (folderPath: string, cliId: string, accountId?: string) => void;
  /** 打开新建任务弹窗，自定义 CLI、名称、命令与目录 */
  onCustomNewTask?: (folderPath: string, cliId?: string) => void;
  /** 同一文件夹内调整任务顺序 */
  onReorderTask?: (sourceId: string, targetId: string) => void;
  onRestartTask?: (taskId: string) => void;
  onOpenFolder?: (folderPath: string) => void;
  onRemoveFolder?: (folderPath: string) => void;
  onCloseTask: (taskId: string, e: React.MouseEvent) => void;
  onRenameTask?: (taskId: string, title: string) => void;
  /** 一键审核：把指定任务当前完成的功能交给另一个 CLI Agent 审核；可复用右键菜单已按需读到的 Git 状态 */
  onReviewTask?: (taskId: string, cliId: string, accountId?: string, prefetchedGitStatus?: GitStatusResult | null) => void;
  onResumeHistory?: (entry: HistoryEntry) => void;
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
  /** 应用更新状态与被用户忽略的版本；有可用/下载中/已就绪更新时在版本号旁显示提示徽标 */
  updateState?: UpdateState | null;
  ignoredUpdateVersion?: string;
  onOpenUpdate?: () => void;
  musicDirectory?: string;
  musicStreams?: MusicStream[];
  showMusicPlayer?: boolean;
  /** 传入当前语言，使 React.memo 在切换语言时同步重绘 */
  language?: string;
}

const BranchBadge: React.FC<{ branch?: string | null }> = ({ branch }) => (branch ? (
  <span
    className="flex max-w-[7rem] shrink-0 items-center gap-1 rounded-full border border-violet/30 bg-violet/10 px-1.5 text-2xs text-violet"
    title={t('Git 分支：{branch}', { branch })}
    data-git-branch
  >
    <GitBranch size={10} className="shrink-0" aria-hidden="true" />
    <span className="truncate font-mono">{branch}</span>
  </span>
) : null);

type MenuState = { x: number; y: number; kind: 'new' | 'folder' | 'task' | 'recent-folder'; folderPath?: string; taskId?: string; focusFirst?: boolean };

function clampSidebarWidth(width: number): number {
  const max = Math.max(240, Math.min(480, Math.floor(window.innerWidth * 0.45)));
  return Math.max(240, Math.min(max, Math.round(width)));
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  isCollapsed,
  clis,
  folders,
  tasks,
  accounts = [],
  gitBranches = {},
  summaries = {},
  clockOffsetHours = 0,
  workStartTime,
  workEndTime,
  greetingMessages,
  recentFolders = [],
  activeTaskId,
  isDashboardActive = false,
  unreadTaskIds,
  width,
  onResizeWidth,
  onResetWidth,
  onToggleCollapse,
  onToggleAllFolders,
  onClearStoppedTasks,
  onPinRecentFolder,
  onAddFolder,
  onOpenDashboard,
  onOpenHome,
  onSelectTask,
  onToggleFolder,
  onReorderFolder,
  onNewTask,
  onCustomNewTask,
  onReorderTask,
  onRestartTask,
  onOpenFolder,
  onRemoveFolder,
  onCloseTask,
  onRenameTask,
  onReviewTask,
  onResumeHistory,
  onOpenHistory,
  onOpenSettings,
  updateState = null,
  ignoredUpdateVersion = '',
  onOpenUpdate,
  musicDirectory = '',
  musicStreams = NO_STREAMS,
  showMusicPlayer = true,
}) => {
  const asideRef = useRef<HTMLElement | null>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const cancelResizeRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    if (asideRef.current) asideRef.current.style.width = !isCollapsed && width ? `${width}px` : '';
  }, [isCollapsed, width]);
  useLayoutEffect(() => {
    if (isCollapsed || !asideRef.current || !resizeHandleRef.current) return;
    const aside = asideRef.current;
    const handle = resizeHandleRef.current;
    const updateWidth = () => handle.setAttribute('aria-valuenow', String(Math.round(aside.getBoundingClientRect().width)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(aside);
    return () => {
      observer.disconnect();
      cancelResizeRef.current?.();
    };
  }, [isCollapsed, onResizeWidth]);
  // 仅当跨时段（slot 或 icon 变化）时才更新 state，避免每分钟无谓触发整个侧栏重渲染
  const [greetingSlot, setGreetingSlot] = useState(() => resolveGreetingSlot(clockOffsetHours, workStartTime, workEndTime));
  const greetingText = greetingMessages?.[greetingSlot.slot]?.trim() || defaultGreetingText(greetingSlot.slot);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [openRecent, setOpenRecent] = useState<ReadonlySet<string>>(() => new Set());
  // 文件夹拖拽排序：以手柄拖动整行；任务拖拽排序：只在所属文件夹内
  const [draggedFolder, setDraggedFolder] = useState<string | null>(null);
  const [folderDropTarget, setFolderDropTarget] = useState<string | null>(null);
  const [folderDropPosition, setFolderDropPosition] = useState<'before' | 'after'>('before');
  const [draggedTask, setDraggedTask] = useState<{ id: string; folder: string } | null>(null);
  const [taskDropTargetId, setTaskDropTargetId] = useState<string | null>(null);
  const [recentCollapsed, setRecentCollapsed] = useState(() => {
    try { return localStorage.getItem('oneai_recent_collapsed') === 'true'; } catch { return false; }
  });
  const toggleRecentSection = () => {
    setRecentCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('oneai_recent_collapsed', String(next)); } catch {}
      return next;
    });
  };
  const taskButtons = useRef(new Map<string, HTMLButtonElement>());
  const finishingRef = useRef(false);

  useEffect(() => {
    const sync = () => {
      const next = resolveGreetingSlot(clockOffsetHours, workStartTime, workEndTime);
      setGreetingSlot((prev) => (prev.slot === next.slot && prev.icon === next.icon ? prev : next));
    };
    sync();
    const timer = window.setInterval(sync, 60_000);
    return () => window.clearInterval(timer);
  }, [clockOffsetHours, workStartTime, workEndTime]);

  // 结束重命名：Esc 取消、Enter / 失焦保存；键盘结束时把焦点还给任务行，避免落到 body
  const finishRename = (save: boolean, refocus: boolean) => {
    if (!editing || finishingRef.current) return;
    finishingRef.current = true;
    const { id, draft } = editing;
    const title = draft.trim();
    if (save && title) onRenameTask?.(id, title);
    setEditing(null);
    requestAnimationFrame(() => {
      finishingRef.current = false;
      if (refocus) taskButtons.current.get(id)?.focus();
    });
  };

  // 切换、恢复或快捷键选中任务后，保证当前任务行在侧栏可见区域内（含折叠窄条与刚展开侧栏时）
  const activeTask = tasks.find((task) => task.id === activeTaskId);
  const activeFolderExpanded = Boolean(activeTask && folders.some((folder) => folder.isExpanded && folderKey(folder.path) === folderKey(activeTask.cwd)));
  useEffect(() => {
    if (!activeTaskId || (!isCollapsed && !activeFolderExpanded)) return;
    document.querySelector(`[data-task-id="${CSS.escape(activeTaskId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeTaskId, activeFolderExpanded, isCollapsed]);

  // 与 App 中 Ctrl+数字 的任务顺序一致：按侧栏从上到下，前 9 个带序号；单遍建立文件夹映射，避免渲染中 O(folders × tasks) 重复计算
  const { taskOrder, tasksByFolder } = useMemo(() => {
    const byFolder = new Map<string, TaskSession[]>();
    for (const task of tasks) {
      const key = folderKey(task.cwd);
      const list = byFolder.get(key);
      if (list) list.push(task);
      else byFolder.set(key, [task]);
    }
    const order = new Map<string, number>();
    orderedTasks(folders, tasks).forEach((task, index) => order.set(task.id, index + 1));
    return { taskOrder: order, tasksByFolder: byFolder };
  }, [folders, tasks]);
  const tasksOf = (folderPath: string) => tasksByFolder.get(folderKey(folderPath)) ?? [];
  const cliMap = useMemo(() => new Map(clis.map((cli) => [cli.id, cli])), [clis]);
  const newTaskClis = useMemo(() => sortClisAlphabetically(clis), [clis]);
  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const cliOf = (task: TaskSession) => cliMap.get(task.groupId);
  const accountOf = (task: TaskSession) => (task.accountId ? accountMap.get(task.accountId) : undefined);

  const runningCount = tasks.filter((task) => isTaskAlive(task.status)).length;
  const allFoldersExpanded = folders.length > 0 && folders.every((folder) => folder.isExpanded);
  const showUpdateBadge = Boolean(
    onOpenUpdate && updateState && (
      updateState.phase === 'downloaded'
      || updateState.phase === 'downloading'
      || (updateState.phase === 'available' && updateState.latestVersion && updateState.latestVersion !== ignoredUpdateVersion)
    ),
  );
  const updateBadgeText = updateState?.phase === 'downloaded'
    ? t('重启更新')
    : updateState?.phase === 'downloading'
      ? `${updateState.progress?.percent ?? 0}%`
      : updateState?.latestVersion
        ? `v${updateState.latestVersion}`
        : '';
  const updateBadgeTitle = updateState?.phase === 'downloaded'
    ? t('新版本 v{version} 已下载完成，点击重启并安装', { version: updateState.latestVersion ?? '' })
    : updateState?.phase === 'downloading'
      ? t('正在下载新版本（{percent}%）', { percent: updateState.progress?.percent ?? 0 })
      : t('发现新版本 v{version}，点击查看更新', { version: updateState?.latestVersion ?? '' });

  // 右键菜单：新建任务（文件夹「+」）、文件夹行、任务行、最近任务文件夹共用
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [reviewSubmenuOpen, setReviewSubmenuOpen] = useState(false);
  const reviewSubmenuOpenRef = useRef(false);
  reviewSubmenuOpenRef.current = reviewSubmenuOpen;
  const reviewTriggerRef = useRef<HTMLButtonElement>(null);
  const reviewSubmenuRef = useRef<HTMLDivElement>(null);
  const [reviewSubmenuPos, setReviewSubmenuPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    setReviewSubmenuOpen(false);
    setReviewSubmenuPos(null);
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const close = () => { setReviewSubmenuOpen(false); setMenu(null); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (reviewSubmenuOpenRef.current) {
          setReviewSubmenuOpen(false);
          requestAnimationFrame(() => {
            if (reviewTriggerRef.current?.isConnected) reviewTriggerRef.current.focus();
          });
          return;
        }
        const trigger = menuTriggerRef.current;
        close();
        requestAnimationFrame(() => {
          if (trigger?.isConnected) trigger.focus();
        });
      }
    };
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) { setMenuPos(null); return; }
    const rect = menuRef.current.getBoundingClientRect();
    setMenuPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)),
    });
  }, [menu]);
  useLayoutEffect(() => {
    if (!reviewSubmenuOpen || !menuRef.current || !reviewSubmenuRef.current) {
      setReviewSubmenuPos(null);
      return;
    }
    const parentRect = menuRef.current.getBoundingClientRect();
    const triggerRect = reviewTriggerRef.current?.getBoundingClientRect() ?? parentRect;
    const subRect = reviewSubmenuRef.current.getBoundingClientRect();
    const fitsRight = parentRect.right + 4 + subRect.width <= window.innerWidth - 8;
    const left = fitsRight
      ? parentRect.right + 4
      : Math.max(8, parentRect.left - subRect.width - 4);
    const top = Math.max(8, Math.min(triggerRect.top - 4, window.innerHeight - subRect.height - 8));
    setReviewSubmenuPos({ left, top });
  }, [reviewSubmenuOpen, menuPos]);
  useEffect(() => {
    if (!menu || !menuRef.current) return;
    const target = menu.focusFirst
      ? menuRef.current.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? menuRef.current
      : menuRef.current;
    requestAnimationFrame(() => target.focus());
  }, [menu]);
  const menuTask = menu?.taskId ? tasks.find((task) => task.id === menu.taskId) : undefined;
  const reviewClis = useMemo(() => newTaskClis.filter((cli) => cli.id !== 'terminal'), [newTaskClis]);
  const canShowReview = Boolean(onReviewTask && reviewClis.length > 0 && menuTask && menuTask.groupId !== 'terminal');
  const reviewTargetCwd = menu?.kind === 'task' && canShowReview && menuTask ? menuTask.cwd : null;
  const reviewTargetKnownNonGit = reviewTargetCwd
    ? Object.prototype.hasOwnProperty.call(gitBranches, folderKey(reviewTargetCwd)) && gitBranches[folderKey(reviewTargetCwd)] === null
    : false;
  const reviewStatusCacheRef = useRef(new Map<string, { at: number; hint: ReviewGitHint }>());
  const [reviewGitHint, setReviewGitHint] = useState<ReviewGitHint | null>(null);
  useEffect(() => {
    if (!reviewTargetCwd) {
      setReviewGitHint(null);
      return;
    }
    if (reviewTargetKnownNonGit) {
      setReviewGitHint({ kind: 'non-git' });
      return;
    }
    const key = folderKey(reviewTargetCwd);
    const cached = reviewStatusCacheRef.current.get(key);
    if (cached && Date.now() - cached.at < REVIEW_STATUS_CACHE_TTL_MS) {
      setReviewGitHint(cached.hint);
      return;
    }
    const readStatus = window.electronAPI?.readGitStatus;
    if (!readStatus) {
      setReviewGitHint(null);
      return;
    }
    setReviewGitHint(null);
    let cancelled = false;
    void readStatus(reviewTargetCwd).then((res) => {
      if (cancelled) return;
      const hint: ReviewGitHint = res && res.ok
        ? (() => {
            const count = res.totalCount ?? res.entries.length;
            return count > 0
              ? { kind: 'changes', count, status: res }
              : { kind: 'clean', status: res };
          })()
        : { kind: 'non-git' };
      const cache = reviewStatusCacheRef.current;
      if (cache.size >= REVIEW_STATUS_CACHE_MAX) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }
      cache.set(key, { at: Date.now(), hint });
      setReviewGitHint(hint);
    }).catch(() => {
      if (!cancelled) setReviewGitHint({ kind: 'non-git' });
    });
    return () => { cancelled = true; };
  }, [reviewTargetCwd, reviewTargetKnownNonGit]);
  const reviewPrefetchedStatus: GitStatusResult | null | undefined = reviewGitHint
    ? (reviewGitHint.kind === 'non-git' ? null : reviewGitHint.status)
    : undefined;
  const reviewStatusBadge = reviewGitHint?.kind === 'changes'
    ? t('{n} 个改动', { n: reviewGitHint.count })
    : reviewGitHint?.kind === 'clean'
      ? t('审最近提交')
      : null;
  const reviewButtonTitle = reviewGitHint?.kind === 'changes'
    ? t('当前工作区有 {n} 个未提交改动', { n: reviewGitHint.count })
    : reviewGitHint?.kind === 'clean'
      ? t('当前工作区无未提交改动，将审核最近一次提交（HEAD）')
      : undefined;
  const menuItemClass = 'flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-hover focus-visible:bg-hover focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40';
  const accountedClis = (cliId: string) => accounts.filter((account) => account.cliId === cliId);

  const handleReviewSubmenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = reviewSubmenuRef.current
      ? [...reviewSubmenuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
      : [];
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      setReviewSubmenuOpen(false);
      reviewTriggerRef.current?.focus();
      return;
    }
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      items[(currentIndex + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      items[(currentIndex <= 0 ? items.length : currentIndex) - 1]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      items[items.length - 1]?.focus();
    }
  };

  const openNewMenu = (e: React.MouseEvent, folderPath: string) => {
    e.stopPropagation();
    if (menu?.kind === 'new' && menu.folderPath === folderPath) {
      setMenu(null);
      return;
    }
    menuTriggerRef.current = e.currentTarget as HTMLElement;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: rect.left, y: rect.bottom + 4, kind: 'new', folderPath, focusFirst: e.detail === 0 });
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = menuRef.current
      ? [...menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
      : [];
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      items[(currentIndex + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      items[(currentIndex <= 0 ? items.length : currentIndex) - 1]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      items[items.length - 1]?.focus();
    }
  };

  const startSidebarResize = (e: React.MouseEvent) => {
    if (!onResizeWidth || e.button !== 0) return;
    e.preventDefault();
    cancelResizeRef.current?.();
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'col-resize';
    const aside = asideRef.current;
    const previousWidth = aside?.style.width ?? '';
    let latestWidth: number | null = null;
    const onMove = (ev: MouseEvent) => {
      latestWidth = clampSidebarWidth(ev.clientX);
      if (aside) aside.style.width = `${latestWidth}px`;
    };
    const cancel = () => {
      document.body.style.cursor = prevCursor;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', onKey);
      cancelResizeRef.current = null;
      if (aside?.isConnected) aside.style.width = previousWidth;
    };
    const onUp = (ev: MouseEvent) => {
      if (ev.button !== 0) return;
      cancel();
      if (latestWidth !== null) onResizeWidth(latestWidth);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cancel();
    };
    cancelResizeRef.current = cancel;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', onKey);
  };

  const cliMenuItemClass = 'cli-menu-neon-item flex items-center gap-2 px-2.5 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-40';
  const newTaskItems = (folderPath: string) => (
    <>
      {newTaskClis.map((cli, idx) => (
        <React.Fragment key={cli.id}>
          {idx > 0 && accountedClis(newTaskClis[idx - 1].id).length > 0 && <div className="my-1 border-t border-line/60" role="separator" />}
          <button type="button" role="menuitem" data-cli-menu-item={cli.id} className={cliMenuItemClass}
            onClick={() => { setMenu(null); onNewTask(folderPath, cli.id); }}>
            <span className="cli-menu-neon-ring" aria-hidden="true" data-cli-menu-neon />
            <BrandIcon icon={cli.icon} size={14} /><span className="truncate">{cli.name}</span>
          </button>
          {accountedClis(cli.id).map((account) => (
            <button key={account.id} type="button" role="menuitem" data-cli-menu-item={`${cli.id}:${account.id}`} className={`${cliMenuItemClass} pl-7 text-fg-subtle`}
              onClick={() => { setMenu(null); onNewTask(folderPath, cli.id, account.id); }}>
              <span className="cli-menu-neon-ring" aria-hidden="true" data-cli-menu-neon />
              <User size={12} /><span className="truncate">{t('用 {name} 新建', { name: account.name })}</span>
            </button>
          ))}
        </React.Fragment>
      ))}
      {onCustomNewTask && (
        <button type="button" role="menuitem" className={`${menuItemClass} mt-0.5 border-t border-line`}
          onClick={() => { setMenu(null); onCustomNewTask(folderPath); }}>
          <SlidersHorizontal size={13} />{t('自定义命令与目录…')}
        </button>
      )}
    </>
  );

  const menuVisible = Boolean(
    menu && (
      menu.kind === 'task'
        ? menuTask
        : (menu.kind === 'new' || menu.kind === 'folder' || menu.kind === 'recent-folder') && menu.folderPath
    ),
  );
  const fallbackPos = menu
    ? { left: Math.max(8, Math.min(menu.x, window.innerWidth - 232)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 200)) }
    : { left: 8, top: 8 };
  const folderHasStopped = menu?.kind === 'folder' && menu.folderPath
    ? tasksOf(menu.folderPath).some((task) => !isTaskAlive(task.status))
    : false;
  const menuNode = menuVisible && menu && (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      style={menuPos ?? fallbackPos}
      className={`glass-popover fixed z-50 max-h-[calc(100vh-16px)] ${menu.kind === 'task' ? 'w-60' : 'w-56'} overflow-y-auto overflow-x-hidden rounded-xl border border-line-strong/80 py-1 text-ui text-fg outline-none`}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleMenuKeyDown}
    >
      {(menu.kind === 'new' || menu.kind === 'folder') && menu.folderPath && newTaskItems(menu.folderPath)}
      {menu.kind === 'folder' && menu.folderPath && (
        <>
          <div className="my-1 border-t border-line" role="separator" />
          {onOpenFolder && (
            <button type="button" role="menuitem" className={menuItemClass}
              onClick={() => { setMenu(null); onOpenFolder(menu.folderPath!); }}>
              <FolderOpen size={13} />{t('在资源管理器中打开')}
            </button>
          )}
          <button type="button" role="menuitem" className={menuItemClass}
            onClick={() => { void window.electronAPI?.writeClipboardText?.(menu.folderPath!); setMenu(null); }}>
            <Copy size={13} />{t('复制路径')}
          </button>
          {onClearStoppedTasks && folderHasStopped && (
            <button type="button" role="menuitem" className={menuItemClass}
              onClick={() => { setMenu(null); onClearStoppedTasks(menu.folderPath!); }}>
              <Trash2 size={13} />{t('清理已停止任务')}
            </button>
          )}
          {onRemoveFolder && (
            <button type="button" role="menuitem" className={`${menuItemClass} text-danger`}
              onClick={() => { setMenu(null); onRemoveFolder(menu.folderPath!); }}>
              <X size={13} />{t('从侧栏移除文件夹')}
            </button>
          )}
        </>
      )}
      {menu.kind === 'recent-folder' && menu.folderPath && (
        <>
          {onPinRecentFolder && (
            <button type="button" role="menuitem" className={menuItemClass}
              onClick={() => { setMenu(null); onPinRecentFolder(menu.folderPath!); }}>
              <FolderPlus size={13} />{t('加入工作区')}
            </button>
          )}
          {onOpenFolder && (
            <button type="button" role="menuitem" className={menuItemClass}
              onClick={() => { setMenu(null); onOpenFolder(menu.folderPath!); }}>
              <FolderOpen size={13} />{t('在资源管理器中打开')}
            </button>
          )}
          <button type="button" role="menuitem" className={menuItemClass}
            onClick={() => { void window.electronAPI?.writeClipboardText?.(menu.folderPath!); setMenu(null); }}>
            <Copy size={13} />{t('复制路径')}
          </button>
        </>
      )}
      {menu.kind === 'task' && menuTask && (
        <>
          {canShowReview && (
            <>
              <button
                ref={reviewTriggerRef}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={reviewSubmenuOpen}
                data-task-review-trigger
                data-review-git-state={reviewGitHint?.kind ?? 'idle'}
                title={reviewButtonTitle}
                className={`${menuItemClass} justify-between ${reviewSubmenuOpen ? 'bg-hover text-fg' : ''}`}
                onMouseEnter={() => setReviewSubmenuOpen(true)}
                onClick={() => setReviewSubmenuOpen((open) => !open)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    e.stopPropagation();
                    setReviewSubmenuOpen(true);
                    requestAnimationFrame(() => {
                      reviewSubmenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
                    });
                  }
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ShieldCheck size={13} className="shrink-0 text-accent" />
                  <span className="truncate">{t('一键审核')}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {reviewStatusBadge && (
                    <span
                      data-task-review-badge
                      className={`rounded px-1.5 py-0.5 text-2xs leading-none ${
                        reviewGitHint?.kind === 'changes'
                          ? 'bg-accent/15 text-accent'
                          : 'bg-hover text-fg-faint'
                      }`}
                    >
                      {reviewStatusBadge}
                    </span>
                  )}
                  <ChevronRight size={13} className="shrink-0 text-fg-faint" aria-hidden="true" />
                </span>
              </button>
              <div className="my-1 border-t border-line" role="separator" />
            </>
          )}
          {!isCollapsed && onRenameTask && (
            <button type="button" role="menuitem" className={menuItemClass}
              onMouseEnter={() => setReviewSubmenuOpen(false)}
              onClick={() => { setEditing({ id: menuTask.id, draft: menuTask.title }); setMenu(null); }}>
              <Pencil size={13} />{t('重命名')}
            </button>
          )}
          {onRestartTask && (
            <button type="button" role="menuitem" className={menuItemClass} disabled={menuTask.status === 'starting'}
              onMouseEnter={() => setReviewSubmenuOpen(false)}
              onClick={() => { setMenu(null); onRestartTask(menuTask.id); }}>
              <RotateCcw size={13} />{isTaskAlive(menuTask.status) ? t('重启终端') : t('启动终端')}
            </button>
          )}
          <button type="button" role="menuitem" className={menuItemClass}
            onMouseEnter={() => setReviewSubmenuOpen(false)}
            onClick={() => { void window.electronAPI?.writeClipboardText?.(menuTask.cwd); setMenu(null); }}>
            <Copy size={13} />{t('复制工作目录')}
          </button>
          {onOpenFolder && (
            <button type="button" role="menuitem" className={menuItemClass}
              onMouseEnter={() => setReviewSubmenuOpen(false)}
              onClick={() => { setMenu(null); onOpenFolder(menuTask.cwd); }}>
              <FolderOpen size={13} />{t('在资源管理器中打开')}
            </button>
          )}
          <div className="my-1 border-t border-line" role="separator" />
          <button type="button" role="menuitem" className={`${menuItemClass} text-danger`}
            onMouseEnter={() => setReviewSubmenuOpen(false)}
            onClick={(e) => { setMenu(null); onCloseTask(menuTask.id, e); }}>
            <X size={13} />{t('关闭任务')}
          </button>
        </>
      )}
    </div>
  );
  const reviewSubmenuNode = menuVisible && menu?.kind === 'task' && menuTask && reviewSubmenuOpen && canShowReview && onReviewTask && (
    <div
      ref={reviewSubmenuRef}
      role="menu"
      aria-label={t('选择审核 Agent')}
      data-task-review-submenu
      tabIndex={-1}
      style={reviewSubmenuPos ?? {
        left: Math.min((menuPos ?? fallbackPos).left + 244, window.innerWidth - 232),
        top: (menuPos ?? fallbackPos).top,
      }}
      className="glass-popover fixed z-50 max-h-[calc(100vh-16px)] w-56 overflow-y-auto overflow-x-hidden rounded-xl border border-line-strong/80 py-1 text-ui text-fg outline-none"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleReviewSubmenuKeyDown}
    >
      <div className="px-3 py-1 text-2xs font-medium text-fg-faint">{t('选择审核 Agent')}</div>
      {reviewClis.map((cli, idx) => (
        <React.Fragment key={cli.id}>
          {idx > 0 && accountedClis(reviewClis[idx - 1].id).length > 0 && <div className="my-1 border-t border-line/60" role="separator" />}
          <button
            type="button"
            role="menuitem"
            data-review-cli={cli.id}
            className={cliMenuItemClass}
            onClick={() => { setReviewSubmenuOpen(false); setMenu(null); onReviewTask(menuTask.id, cli.id, undefined, reviewPrefetchedStatus); }}
          >
            <span className="cli-menu-neon-ring" aria-hidden="true" data-cli-menu-neon />
            <BrandIcon icon={cli.icon} size={14} />
            <span className="truncate">{cli.name}</span>
          </button>
          {accountedClis(cli.id).map((account) => (
            <button
              key={account.id}
              type="button"
              role="menuitem"
              data-review-cli={`${cli.id}:${account.id}`}
              className={`${cliMenuItemClass} pl-7 text-fg-subtle`}
              onClick={() => { setReviewSubmenuOpen(false); setMenu(null); onReviewTask(menuTask.id, cli.id, account.id, reviewPrefetchedStatus); }}
            >
              <span className="cli-menu-neon-ring" aria-hidden="true" data-cli-menu-neon />
              <User size={12} />
              <span className="truncate">{t('用 {name} 审核', { name: account.name })}</span>
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  );

  const isHomeActive = !isDashboardActive && activeTaskId === null;
  const homeButton = onOpenHome && (
    <button
      type="button"
      data-home-nav
      onClick={onOpenHome}
      aria-current={isHomeActive ? 'page' : undefined}
      aria-label={t('主页')}
      title={t('主页')}
      className={`flex shrink-0 items-center justify-center rounded-lg transition-all duration-150 ${
        isCollapsed ? 'h-9 w-9' : 'h-8 gap-2 px-2.5 text-ui'
      } ${
        isHomeActive ? 'bg-selected/90 font-medium text-accent shadow-sm' : 'text-fg-muted hover:bg-hover/80 hover:text-fg'
      }`}
    >
      <House size={isCollapsed ? 16 : 15} aria-hidden="true" />
      {!isCollapsed && <span>{t('主页')}</span>}
    </button>
  );

  // 折叠后保留窄条：每个文件夹一个按钮（点击新建任务）及其下的任务序号按钮（带品牌标与状态点，支持切换、右键菜单与中键关闭），底部保留添加文件夹、设置与展开入口
  if (isCollapsed) {
    return (
      <aside ref={asideRef} id="oneai-sidebar" aria-label={t('任务列表（已折叠）')} className="glass-surface flex h-full w-12 shrink-0 select-none flex-col items-center border-r border-line/70">
        <div className="window-drag glass-panel flex h-11 w-full shrink-0 items-center justify-center border-b border-line/70">
          <AppLogo size={20} />
        </div>

        {(onOpenDashboard || onOpenHome) && (
          <div className="flex w-full shrink-0 flex-col items-center gap-1 border-b border-line/70 py-1.5">
            {onOpenDashboard && <button
              type="button"
              data-dashboard-nav
              onClick={onOpenDashboard}
              aria-current={isDashboardActive ? 'page' : undefined}
              title={t('数据面板 (Ctrl+Shift+D)')}
              aria-label={t('数据面板')}
              className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 ${
                isDashboardActive ? 'bg-selected/90 text-accent shadow-sm' : 'text-fg-subtle hover:bg-hover/80 hover:text-fg'
              }`}
            >
              <LayoutDashboard size={16} />
            </button>}
            {homeButton}
          </div>
        )}

        <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
          {folders.map((folder) => {
            const key = folderKey(folder.path);
            const name = folderName(folder.path);
            const branch = gitBranches[key];
            return (
              <React.Fragment key={key}>
                <button
                  type="button"
                  data-folder-strip
                  onClick={(e) => openNewMenu(e, folder.path)}
                  onContextMenu={(e) => { e.preventDefault(); openNewMenu(e, folder.path); }}
                  title={t('{name}{branch} -- 点击在此文件夹新建任务', { name, branch: branch ? t('（{text}）', { text: branch }) : '' })}
                  aria-label={t('在 {name} 中新建任务', { name })}
                  aria-haspopup="menu"
                  aria-expanded={menu?.kind === 'new' && menu.folderPath === folder.path}
                  className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-hover/80"
                >
                  <Folder size={17} className="text-accent" />
                  <Plus size={10} className="absolute bottom-0.5 right-0.5 rounded-full bg-surface text-fg-faint group-hover:text-accent" aria-hidden="true" />
                </button>
                {tasksOf(folder.path).map((task) => {
                  const order = taskOrder.get(task.id) ?? 0;
                  const isActive = !isDashboardActive && task.id === activeTaskId;
                  const isRunning = task.status === 'running';
                  const statusMeta = TASK_STATUS_META[task.status];
                  const isUnread = !isActive && Boolean(unreadTaskIds?.has(task.id));
                  const account = accountOf(task);
                  const cli = cliOf(task);
                  const label = t('{cli}{account}：{title}', { cli: cli?.name ?? task.groupId, account: task.accountId ? t('（{text}）', { text: account?.name ?? t('账号已删除') }) : '', title: task.title });
                  return (
                    <button
                      key={task.id}
                      type="button"
                      data-task-id={task.id}
                      onClick={() => onSelectTask(task.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        menuTriggerRef.current = e.currentTarget;
                        setMenu({ x: e.clientX, y: e.clientY, kind: 'task', taskId: task.id });
                      }}
                      onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
                      onAuxClick={(e) => { if (e.button === 1) onCloseTask(task.id, e); }}
                      aria-current={isActive ? 'true' : undefined}
                      title={`${t('{label}（{status}）', { label, status: `${statusMeta.label}${isUnread ? t('，待查看') : ''}` })}${order <= 9 ? ` Ctrl+${order}` : ''}`}
                      aria-label={t('{label}，{status}', { label, status: `${statusMeta.label}${isUnread ? t('，待查看') : ''}` })}
                      className={`relative flex h-9 w-9 shrink-0 items-center justify-center ${order >= 10 ? 'gap-0.5' : 'gap-1'} rounded-lg font-mono text-xs tabular-nums transition-all duration-150 ${isActive ? 'bg-selected/90 font-medium text-fg shadow-sm' : isUnread ? 'bg-accent font-semibold text-canvas hover:bg-accent/85' : 'text-fg-subtle hover:bg-hover/80 hover:text-fg'} ${isRunning ? 'task-neon-running' : ''}`}
                    >
                      {isRunning && <span className="task-neon-ring" aria-hidden="true" data-task-neon="running" />}
                      {order < 100 && <BrandIcon icon={cli?.icon ?? task.groupId} size={11} />}
                      <span>{order}</span>
                      <span className={`absolute right-0.5 top-0.5 z-[2] h-1.5 w-1.5 rounded-full ${statusMeta.dot} ${isUnread ? 'ring-1 ring-canvas' : ''}`} aria-hidden="true" />
                    </button>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        <div className="glass-panel flex w-full shrink-0 flex-col items-center gap-1 border-t border-line/70 py-2">
          {showUpdateBadge && onOpenUpdate && (
            <button
              type="button"
              data-update-badge
              onClick={onOpenUpdate}
              className="icon-btn relative h-8 w-8 text-accent"
              title={updateBadgeTitle}
              aria-label={updateBadgeTitle}
            >
              <ArrowUpCircle size={15} />
              <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${updateState?.phase === 'downloaded' ? 'bg-success' : 'bg-accent'}`} aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={onAddFolder} className="icon-btn h-8 w-8" title={t('添加文件夹')} aria-label={t('添加文件夹')}>
            <FolderPlus size={15} className="text-accent" />
          </button>
          <button type="button" onClick={onOpenSettings} className="icon-btn h-8 w-8" title={t('设置 (Ctrl+,)')} aria-label={t('设置')}>
            <Settings size={15} />
          </button>
          {onToggleCollapse && (
            <button type="button" onClick={onToggleCollapse} className="icon-btn h-8 w-8" title={`${t('展开左侧导航栏')} (Ctrl+Shift+B)`} aria-label={t('展开左侧导航栏')}>
              <PanelLeftOpen size={15} />
            </button>
          )}
        </div>
        {menuNode}
      {reviewSubmenuNode}
        {/* 与展开状态使用同一个 key：两种状态的根都是同一个 aside，React 会复用这个播放器实例，折叠时只隐藏、播放不中断 */}
        {showMusicPlayer && <MusicPlayer key="music-player" directory={musicDirectory} streams={musicStreams} hidden />}
      </aside>
    );
  }

  return (
    <aside ref={asideRef} id="oneai-sidebar" style={width ? { width } : undefined} className={`glass-surface relative flex ${width ? '' : 'w-80'} border-r border-line/70 flex-col h-full select-none shrink-0 text-fg-muted`}>
      {/* 侧边栏顶部：应用品牌、版本号、标语与问候语 */}
      <div className="window-drag glass-panel shrink-0 border-b border-line/70 px-3.5 pb-3 pt-4 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
          <AppLogo size={34} />
          <div className="flex min-w-0 items-baseline gap-1.5" data-sidebar-brand-title>
            <span className="text-2xl font-semibold leading-none tracking-tight text-fg">OneAI</span>
            <span data-sidebar-version className="shrink-0 font-mono text-2xs leading-none text-fg-faint">v{version}</span>
            {showUpdateBadge && onOpenUpdate && (
              <button
                type="button"
                data-update-badge
                onClick={onOpenUpdate}
                title={updateBadgeTitle}
                aria-label={updateBadgeTitle}
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                className={`inline-flex shrink-0 items-center gap-1 self-center rounded-full border px-1.5 py-0 font-mono text-2xs leading-4 transition-colors ${
                  updateState?.phase === 'downloaded'
                    ? 'border-success/40 bg-success/15 text-success hover:bg-success/25'
                    : 'border-accent/40 bg-accent/15 text-accent hover:bg-accent/25'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${updateState?.phase === 'downloaded' ? 'bg-success' : 'bg-accent'}`} aria-hidden="true" />
                <span>{updateBadgeText}</span>
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-ui text-fg-subtle">All agents in one.</p>
        <div className="mt-0.5 flex min-w-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap text-2xs text-fg-faint" aria-live="polite">
          {greetingSlot.icon === 'day' ? <Sun size={12} className="text-warning shrink-0" aria-hidden="true" />
            : greetingSlot.icon === 'evening' ? <Moon size={12} className="text-fg-muted shrink-0" aria-hidden="true" />
              : <BedDouble size={12} className="text-accent shrink-0" aria-hidden="true" />}
          <span data-sidebar-greeting className="min-w-0 truncate">{greetingText}</span>
        </div>
      </div>

      {(onOpenDashboard || onOpenHome) && (
        <div className="flex shrink-0 items-center gap-1 border-b border-line/70 px-2.5 py-2">
          {onOpenDashboard && <button
            type="button"
            data-dashboard-nav
            onClick={onOpenDashboard}
            aria-current={isDashboardActive ? 'page' : undefined}
            title={t('数据面板 (Ctrl+Shift+D)')}
            className={`relative flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-left text-ui transition-all duration-150 ${
              isDashboardActive
                ? 'bg-selected/90 font-medium text-fg shadow-sm'
                : 'text-fg-muted hover:bg-hover/80 hover:text-fg'
            }`}
          >
            {isDashboardActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
            <LayoutDashboard size={15} className={`shrink-0 ${isDashboardActive ? 'text-accent' : 'text-fg-subtle'}`} aria-hidden="true" />
            <span className="truncate">{t('数据面板')}</span>
          </button>}
          {homeButton}
        </div>
      )}

      {/* 文件夹与任务树 */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-surface/85 px-2 pb-1.5 pt-3 text-2xs text-fg-faint backdrop-blur-md">
          <span className="font-semibold tracking-wider">{t('当前任务')}<span className="ml-1.5 tabular-nums">{tasks.length}</span></span>
          <span className="flex items-center gap-1.5">
            {runningCount > 0 && <span className="tabular-nums">{t('{n} 个运行中', { n: runningCount })}</span>}
            {folders.length > 0 && onToggleAllFolders && (
              <button
                type="button"
                onClick={() => onToggleAllFolders(!allFoldersExpanded)}
                className="icon-btn h-5 w-5 text-fg-faint enabled:hover:text-fg"
                title={allFoldersExpanded ? t('折叠所有文件夹') : t('展开所有文件夹')}
                aria-label={allFoldersExpanded ? t('折叠所有文件夹') : t('展开所有文件夹')}
              >
                {allFoldersExpanded ? <ChevronsDownUp size={12} /> : <ChevronsUpDown size={12} />}
              </button>
            )}
          </span>
        </div>

        {folders.length === 0 && (
          <div className="px-2 py-3">
            <p className="text-xs leading-relaxed text-fg-faint">{t('还没有文件夹。点击下方「添加文件夹」，再在文件夹里新建任务。')}</p>
            <button
              type="button"
              onClick={onAddFolder}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong py-2 text-xs font-medium text-fg-muted transition-colors hover:border-accent hover:bg-hover hover:text-accent"
            >
              <FolderPlus size={14} className="text-accent" />
              <span>{t('添加文件夹')}</span>
            </button>
          </div>
        )}

        <div className="space-y-0.5">
          {folders.map((folder) => {
            const key = folderKey(folder.path);
            const name = folderName(folder.path);
            const folderTasks = tasksOf(folder.path);
            const hasActiveChild = !isDashboardActive && folderTasks.some((task) => task.id === activeTaskId);
            const unreadCount = folderTasks.filter((task) => task.id !== activeTaskId && unreadTaskIds?.has(task.id)).length;
            const hasError = folderTasks.some((task) => task.status === 'error');
            const hasRunning = folderTasks.some((task) => task.status === 'running' || task.status === 'starting');
            const runningIds = folder.isExpanded ? folderTasks.filter((task) => task.status === 'running').map((task) => task.id).join('\0') : '';
            const dropEdge = folderDropTarget === key ? folderDropPosition : null;

            return (
              <div key={key} data-folder-row data-folder-key={key}
                className={`relative rounded-md transition-opacity ${draggedFolder === key ? 'opacity-50' : ''} ${draggedTask && draggedTask.folder !== key ? 'opacity-55' : ''}`}
                onDragOver={(e) => {
                  if (draggedTask && draggedTask.folder !== key) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'none';
                    return;
                  }
                  if (!draggedFolder || draggedFolder === key) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setFolderDropTarget(key);
                  setFolderDropPosition(folders.findIndex((f) => folderKey(f.path) === draggedFolder) < folders.findIndex((f) => folderKey(f.path) === key) ? 'after' : 'before');
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setFolderDropTarget((current) => (current === key ? null : current));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const source = folders.find((f) => folderKey(f.path) === draggedFolder);
                  if (source && draggedFolder !== key) onReorderFolder(source.path, folder.path);
                  setDraggedFolder(null);
                  setFolderDropTarget(null);
                }}>
                {dropEdge && <div aria-hidden="true" className={`pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-accent ${dropEdge === 'before' ? 'top-0' : 'bottom-0'}`} />}
                {/* 一级文件夹行：排序手柄、展开按钮与新建按钮为同级按钮，均可键盘操作 */}
                <div
                  onContextMenu={(e) => {
                    e.preventDefault();
                    menuTriggerRef.current = e.target instanceof Element
                      ? e.target.closest('button') ?? e.currentTarget.querySelector('button[aria-expanded]')
                      : null;
                    setMenu({ x: e.clientX, y: e.clientY, kind: 'folder', folderPath: folder.path });
                  }}
                  className={`group flex items-center rounded-lg pr-1 text-ui transition-colors ${
                    hasActiveChild && !folder.isExpanded
                      ? 'bg-selected/65 text-fg'
                      : `hover:bg-hover/80 hover:text-fg ${hasActiveChild ? 'text-fg' : 'text-fg-muted'}`
                  }`}
                >
                  <button type="button" draggable data-keep-focus
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', key);
                      const row = e.currentTarget.closest('[data-folder-row]');
                      if (row) e.dataTransfer.setDragImage(row, 16, 16);
                      setDraggedFolder(key);
                    }}
                    onDragEnd={() => { setDraggedFolder(null); setFolderDropTarget(null); }}
                    onKeyDown={(e) => {
                      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                      e.preventDefault();
                      const index = folders.findIndex((item) => folderKey(item.path) === key);
                      const neighbor = folders[index + (e.key === 'ArrowUp' ? -1 : 1)];
                      if (neighbor) onReorderFolder(folder.path, neighbor.path);
                    }}
                    className="flex h-8 w-4 shrink-0 cursor-grab items-center justify-center rounded-sm text-fg-faint opacity-40 transition-opacity hover:text-accent focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
                    title={t('拖动排序 {name}；或按 Alt + 上下方向键', { name })}
                    aria-label={t('排序 {name}，按 Alt 加上下方向键移动', { name })}
                  ><GripVertical size={12} /></button>

                  <button
                    type="button"
                    onClick={() => onToggleFolder(folder.path)}
                    aria-expanded={folder.isExpanded}
                    title={folder.path}
                    className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm text-left"
                  >
                    <ChevronRight size={13} className={`shrink-0 text-fg-faint transition-transform ${folder.isExpanded ? 'rotate-90' : ''}`} aria-hidden="true" />
                    {folder.isExpanded ? <FolderOpen size={15} className="shrink-0 text-accent" aria-hidden="true" /> : <Folder size={15} className="shrink-0 text-accent" aria-hidden="true" />}
                    <span className="truncate font-medium">{name}</span>
                    <BranchBadge branch={gitBranches[key]} />
                    {folderTasks.length > 0 && (
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        {!folder.isExpanded && (hasError || hasRunning) && (
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${hasError ? 'bg-danger' : 'bg-success'}`}
                            title={hasError ? t('含启动失败任务') : t('含运行中任务')}
                            aria-hidden="true"
                          />
                        )}
                        <span
                          className={`rounded-full px-1.5 text-2xs tabular-nums ${unreadCount > 0 && !folder.isExpanded ? 'bg-accent/15 font-medium text-accent' : 'bg-muted text-fg-subtle'}`}
                          title={unreadCount > 0 ? t('{n} 个任务，{u} 个待查看', { n: folderTasks.length, u: unreadCount }) : t('{n} 个任务', { n: folderTasks.length })}
                        >{folderTasks.length}</span>
                      </span>
                    )}
                  </button>

                  {/* 在该文件夹新建任务：弹出 CLI 菜单 */}
                  <button
                    type="button"
                    onClick={(e) => openNewMenu(e, folder.path)}
                    className="icon-btn ml-0.5 h-6 w-6 text-fg-faint enabled:hover:text-accent"
                    title={t('在 {name} 中新建任务', { name })}
                    aria-label={t('在 {name} 中新建任务', { name })}
                    aria-haspopup="menu"
                    aria-expanded={menu?.kind === 'new' && menu.folderPath === folder.path}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* 二级：该文件夹里的任务 */}
                {folder.isExpanded && (
                  <div className="relative ml-[1.4rem] mt-0.5 space-y-1.5 border-l border-line pl-1.5">
                    {folderTasks.length === 0 && (
                      <button
                        type="button"
                        onClick={(e) => openNewMenu(e, folder.path)}
                        className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-xs text-fg-faint transition-colors hover:bg-hover hover:text-fg-muted"
                      >
                        <Plus size={12} />
                        <span>{t('新建任务')}</span>
                      </button>
                    )}

                    {folderTasks.map((task) => {
                      const isActive = !isDashboardActive && task.id === activeTaskId;
                      const isRunning = task.status === 'running';
                      const statusMeta = TASK_STATUS_META[task.status];
                      const isUnread = !isActive && Boolean(unreadTaskIds?.has(task.id));
                      const cli = cliOf(task);
                      const account = accountOf(task);
                      // 第二行：最近一条用户消息；还没有消息时显示「新会话 · 时间」；尚未读到时占位，避免读到后行高跳动
                      const hasSummary = SUMMARY_CLIS.has(task.groupId);
                      const summary = summaries[task.id];
                      const summaryLine = !hasSummary ? '' : summary ? (summary.text ?? t('新会话 · {time}', { time: formatClock(task.createdAt, clockOffsetHours) })) : '\u00a0';
                      const dropEdge = taskDropTargetId === task.id && draggedTask
                        ? (folderTasks.findIndex((t) => t.id === draggedTask.id) < folderTasks.findIndex((t) => t.id === task.id) ? 'after' : 'before')
                        : null;

                      if (editing?.id === task.id) {
                        return (
                          <div
                            key={task.id}
                            data-task-id={task.id}
                            className={`relative flex items-center rounded-md bg-selected/60 text-ui ${isRunning ? 'task-neon-running' : ''}`}
                          >
                            {isRunning && <span className="task-neon-ring" aria-hidden="true" data-task-neon="running" />}
                            {isActive && !isRunning && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
                            <div className={`flex min-w-0 flex-1 flex-col justify-center pl-2.5 pr-2 ${hasSummary ? 'min-h-[2.75rem] gap-0.5 py-1' : 'h-8'}`}>
                              <div className="flex w-full min-w-0 items-center gap-2">
                                <BrandIcon icon={cli?.icon ?? task.groupId} size={16} />
                                <input
                                  autoFocus
                                  value={editing.draft}
                                  aria-label={t('重命名 {title}', { title: task.title })}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => setEditing({ id: task.id, draft: e.target.value })}
                                  onBlur={() => finishRename(true, false)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') finishRename(true, true);
                                    else if (e.key === 'Escape') { e.stopPropagation(); finishRename(false, true); }
                                  }}
                                  className="h-5 min-w-0 flex-1 rounded border border-accent bg-canvas px-1.5 py-0 text-ui font-normal leading-none text-fg outline-none select-text"
                                />
                              </div>
                              {hasSummary && (
                                <span data-task-summary className="block w-full min-w-0 truncate pl-6 text-xs font-normal text-fg-faint opacity-50">{summaryLine}</span>
                              )}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={task.id}
                          data-task-id={task.id}
                          // 一个文件夹里任务很多时，屏幕外的行跳过布局与绘制（行高由浏览器记住）；任务少时保持原样，行高始终精确
                          style={folderTasks.length > LARGE_FOLDER_TASKS ? { contentVisibility: 'auto', containIntrinsicSize: 'auto 40px' } : undefined}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            menuTriggerRef.current = taskButtons.current.get(task.id) ?? null;
                            setMenu({ x: e.clientX, y: e.clientY, kind: 'task', taskId: task.id });
                          }}
                          // 鼠标中键关闭任务；按下时阻止默认行为，避免出现自动滚动光标
                          onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
                          onAuxClick={(e) => { if (e.button === 1) onCloseTask(task.id, e); }}
                          draggable={Boolean(onReorderTask)}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', task.id);
                            setDraggedTask({ id: task.id, folder: key });
                          }}
                          onDragEnd={() => { setDraggedTask(null); setTaskDropTargetId(null); }}
                          onDragOver={(e) => {
                            if (!draggedTask || draggedTask.id === task.id) return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (draggedTask.folder !== key) {
                              e.dataTransfer.dropEffect = 'none';
                              return;
                            }
                            e.dataTransfer.dropEffect = 'move';
                            setTaskDropTargetId(task.id);
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) setTaskDropTargetId((current) => (current === task.id ? null : current));
                          }}
                          onDrop={(e) => {
                            if (!draggedTask || draggedTask.folder !== key) return;
                            e.preventDefault();
                            e.stopPropagation();
                            onReorderTask?.(draggedTask.id, task.id);
                            setDraggedTask(null);
                            setTaskDropTargetId(null);
                          }}
                          className={`group/task relative flex items-center rounded-lg text-ui transition-all duration-150 ${
                            isActive
                              ? 'bg-selected/90 font-medium text-fg shadow-sm'
                              : isUnread
                                ? 'font-medium text-fg hover:bg-hover/80'
                                : 'text-fg-subtle hover:bg-hover/80 hover:text-fg'
                          } ${isRunning ? 'task-neon-running' : ''} ${draggedTask?.id === task.id ? 'opacity-50' : draggedTask && draggedTask.folder !== key ? 'opacity-45' : ''} ${
                            dropEdge === 'before' ? 'shadow-[inset_0_2px_0_rgb(var(--color-accent))]' : dropEdge === 'after' ? 'shadow-[inset_0_-2px_0_rgb(var(--color-accent))]' : ''
                          }`}
                        >
                          {isRunning && <span className="task-neon-ring" aria-hidden="true" data-task-neon="running" />}
                          {isActive && !isRunning && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
                          <button
                            type="button"
                            data-keep-focus
                            ref={(node) => { if (node) taskButtons.current.set(task.id, node); else taskButtons.current.delete(task.id); }}
                            onClick={() => onSelectTask(task.id)}
                            onDoubleClick={() => onRenameTask && setEditing({ id: task.id, draft: task.title })}
                            onKeyDown={(e) => {
                              if (e.key === 'F2' && onRenameTask) setEditing({ id: task.id, draft: task.title });
                              if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && onReorderTask) {
                                e.preventDefault();
                                const index = folderTasks.findIndex((item) => item.id === task.id);
                                const neighbor = folderTasks[index + (e.key === 'ArrowUp' ? -1 : 1)];
                                if (neighbor) onReorderTask(task.id, neighbor.id);
                              }
                            }}
                            aria-current={isActive ? 'true' : undefined}
                            title={`${task.title}${task.errorMessage ? ` -- ${t('启动失败：{reason}', { reason: task.errorMessage })}` : ''}${onRenameTask ? t('（双击或按 F2 重命名）') : ''}`}
                            className={`flex min-w-0 flex-1 flex-col justify-center rounded-md pl-2.5 pr-1 text-left ${hasSummary ? 'min-h-[2.75rem] gap-0.5 py-1' : 'h-8'}`}
                          >
                            <div className="flex w-full min-w-0 items-center gap-2">
                            <BrandIcon icon={cli?.icon ?? task.groupId} size={16} />
                            <span className="truncate">{task.title}</span>
                            <span className="sr-only">{t('，')}{cli?.name ?? task.groupId}</span>
                            {/* 任务状态：圆点 + 文字，紧跟在标题后 */}
                            <span className={`flex shrink-0 items-center gap-1 text-2xs font-normal ${task.status === 'error' ? 'text-danger' : 'text-fg-faint'}`} title={statusMeta.hint}>
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusMeta.dot}`} aria-hidden="true" />
                              {statusMeta.label}
                            </span>
                            <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
                              {task.accountId && (
                                <span
                                  className={`${isUnread || task.status === 'error' ? 'max-w-[4.5rem]' : 'max-w-[5.5rem]'} truncate rounded border px-1 text-2xs font-normal ${account ? 'border-line-strong text-fg-subtle' : 'border-danger/40 text-danger'}`}
                                  title={account ? t('账号：{name}', { name: account.name }) : t('该任务使用的账号配置已被删除')}
                                >{account?.name ?? t('账号已删除')}</span>
                              )}
                              {isUnread && (
                                <span className="rounded-full bg-accent/15 px-1.5 text-2xs font-medium text-accent" title={t('后台有新结果，点击查看')}>
                                  {t('待查看')}
                                </span>
                              )}
                              {(taskOrder.get(task.id) ?? 99) <= 9 && (
                                <span className="font-mono text-2xs font-normal text-fg-faint" title={t('Ctrl+{n} 切换到此任务', { n: taskOrder.get(task.id) ?? '' })} aria-hidden="true">{taskOrder.get(task.id)}</span>
                              )}
                            </span>
                            </div>
                            {hasSummary && (
                              <span data-task-summary className="block w-full min-w-0 truncate pl-6 text-xs font-normal text-fg-faint" title={summaryLine.trim() ? summaryLine : undefined}>{summaryLine}</span>
                            )}
                          </button>

                          {/* 关闭任务按钮：当前任务常显，其余在悬停或聚焦时出现，平常不占用标题与摘要宽度 */}
                          <button
                            type="button"
                            onClick={(e) => onCloseTask(task.id, e)}
                            className={`icon-btn h-6 text-fg-faint transition-opacity enabled:hover:text-danger ${hasSummary ? 'self-start mt-1.5' : ''} ${
                              isActive
                                ? 'mr-1 w-6 opacity-100'
                                : 'mr-0 w-0 overflow-hidden opacity-0 pointer-events-none group-hover/task:mr-1 group-hover/task:w-6 group-hover/task:opacity-100 group-hover/task:pointer-events-auto group-focus-within/task:mr-1 group-focus-within/task:w-6 group-focus-within/task:opacity-100 group-focus-within/task:pointer-events-auto'
                            }`}
                            title={isTaskAlive(task.status) ? t('关闭并终止此终端') : t('移除此终端任务')}
                            aria-label={t('关闭 {title}', { title: task.title })}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })}
                    {runningIds && <FolderTaskPulses runningIds={runningIds} layoutKey={folderTasks.map((task) => task.id).join('\0')} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 最近任务：由历史会话按文件夹归类，已在上面显示的文件夹不重复；点击会话即恢复为当前任务 */}
        {recentFolders.length > 0 && (
          <div data-recent-section>
            <div className="sticky top-0 z-10 flex items-center justify-between bg-surface/85 px-2 pb-1.5 pt-4 text-2xs text-fg-faint backdrop-blur-md">
              <button
                type="button"
                onClick={toggleRecentSection}
                title={recentCollapsed ? t('展开最近任务') : t('收起最近任务')}
                aria-label={recentCollapsed ? t('展开最近任务') : t('收起最近任务')}
                className="flex items-center gap-1 rounded px-0.5 font-semibold tracking-wider hover:text-fg"
              >
                <ChevronRight size={11} className={`shrink-0 transition-transform ${recentCollapsed ? '' : 'rotate-90'}`} aria-hidden="true" />
                <span>{t('最近任务')}<span className="ml-1.5 tabular-nums">{recentFolders.length}</span></span>
              </button>
              {onOpenHistory && (
                <button type="button" onClick={onOpenHistory} className="flex items-center gap-1 rounded px-1 hover:text-accent" title={t('查看所有历史会话 (Ctrl+Shift+H)')} aria-label={t('查看所有历史会话')}>
                  <History size={11} aria-hidden="true" />{t('全部')}
                </button>
              )}
            </div>
            {!recentCollapsed && (
              <div className="space-y-0.5">
                {recentFolders.map((recent) => {
                  const isOpen = openRecent.has(recent.key);
                  return (
                    <div key={recent.key} data-recent-key={recent.key}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        title={recent.path}
                        onClick={() => setOpenRecent((prev) => {
                          const next = new Set(prev);
                          if (next.has(recent.key)) next.delete(recent.key); else next.add(recent.key);
                          return next;
                        })}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          menuTriggerRef.current = e.currentTarget;
                          setMenu({ x: e.clientX, y: e.clientY, kind: 'recent-folder', folderPath: recent.path });
                        }}
                        className="flex h-8 w-full items-center gap-2 rounded-lg pl-4 pr-2 text-left text-ui text-fg-muted transition-colors hover:bg-hover/80 hover:text-fg"
                      >
                        <ChevronRight size={13} className={`shrink-0 text-fg-faint transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
                        <Folder size={15} className="shrink-0 text-fg-subtle" aria-hidden="true" />
                        <span className="truncate font-medium">{folderName(recent.path)}</span>
                        <BranchBadge branch={gitBranches[recent.key]} />
                        <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-2xs tabular-nums text-fg-subtle" title={t('{n} 个历史会话', { n: recent.total })}>{recent.total}</span>
                      </button>
                      {isOpen && (
                        <div className="ml-[1.4rem] mt-0.5 space-y-0.5 border-l border-line pl-1.5">
                          {recent.entries.map((entry) => (
                            <button
                              key={historySessionKey(entry.cliId, entry.accountId, entry.id)}
                              type="button"
                              data-history-id={entry.id}
                              onClick={() => onResumeHistory?.(entry)}
                              title={`${entry.title}\n${t('恢复此会话')}`}
                              className="flex h-8 w-full items-center gap-2 rounded-lg pl-2.5 pr-2 text-left text-ui text-fg-subtle transition-colors hover:bg-hover/80 hover:text-fg"
                            >
                              <BrandIcon icon={entry.cliId} size={14} />
                              <span className="truncate">{entry.title}</span>
                              {entry.accountName && <span className="shrink-0 rounded border border-line px-1 text-2xs text-fg-subtle">{entry.accountName}</span>}
                              <span className="ml-auto shrink-0 text-2xs text-fg-faint">{formatAgo(entry.updatedAt)}</span>
                            </button>
                          ))}
                          {recent.total > recent.entries.length && onOpenHistory && (
                            <button type="button" onClick={onOpenHistory} className="flex h-7 w-full items-center rounded-lg px-2.5 text-xs text-fg-faint hover:bg-hover/80 hover:text-fg-muted">
                              {t('还有 {n} 个，查看全部…', { n: recent.total - recent.entries.length })}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showMusicPlayer && <MusicPlayer key="music-player" directory={musicDirectory} streams={musicStreams} />}

      {/* 侧边栏底部：添加文件夹与设置 */}
      <div className="glass-panel flex h-16 shrink-0 items-center gap-1 border-t border-line/70 px-2">
        <button
          type="button"
          onClick={onAddFolder}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ui font-medium text-fg-muted transition-colors hover:bg-hover/80 hover:text-fg"
          title={t('把另一个本地文件夹加入侧栏；不会结束已在运行的终端')}
        >
          <FolderPlus size={15} className="shrink-0 text-accent" />
          <span className="truncate">{t('添加文件夹')}</span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="icon-btn h-8 w-8"
          title={t('设置 (Ctrl+,)')}
          aria-label={t('设置')}
        >
          <Settings size={15} />
        </button>
      </div>
      {menuNode}
      {reviewSubmenuNode}
      {onResizeWidth && (
        <div
          ref={resizeHandleRef}
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={t('调整侧栏宽度')}
          aria-valuemin={240}
          aria-valuemax={480}
          title={t('拖动或按左右方向键调整侧栏宽度，双击或按 Enter 恢复默认')}
          onMouseDown={startSidebarResize}
          onDoubleClick={() => onResetWidth?.()}
          onKeyDown={(e) => {
            if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              onResetWidth?.();
            } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && asideRef.current) {
              e.preventDefault();
              const step = e.key === 'ArrowLeft' ? -16 : 16;
              onResizeWidth(clampSidebarWidth(asideRef.current.getBoundingClientRect().width + step));
            }
          }}
          className="absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize transition-colors hover:bg-accent/35 focus-visible:bg-accent/50 active:bg-accent/50"
        />
      )}
    </aside>
  );
});

Sidebar.displayName = 'Sidebar';
