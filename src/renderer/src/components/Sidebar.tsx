import React, { useEffect, useRef, useState } from 'react';
import { BedDouble, ChevronRight, ChevronsUpDown, Copy, FolderGit2, FolderOpen, GripVertical, Moon, Pencil, Plus, RotateCcw, Settings, SlidersHorizontal, Sun, X } from 'lucide-react';
import { CliGroup } from '../types';
import { TASK_STATUS_META, isTaskAlive } from '../taskStatus';
import { BrandIcon } from './BrandIcon';
import { AppLogo } from './AppLogo';
import { MusicPlayer } from './MusicPlayer';

interface SidebarProps {
  isCollapsed: boolean;
  groups: CliGroup[];
  workspacePath: string;
  onSwitchWorkspace: () => void;
  activeTaskId: string | null;
  onSelectTask: (taskId: string, groupId: string) => void;
  onToggleGroup: (groupId: string) => void;
  onReorderGroup: (sourceId: string, targetId: string) => void;
  /** 一键新建：用默认名称、命令和当前工作文件夹直接启动 */
  onNewTask: (groupId: string) => void;
  /** 打开新建任务弹窗，自定义名称、命令与目录 */
  onCustomNewTask?: (groupId: string) => void;
  onReorderTask?: (groupId: string, sourceId: string, targetId: string) => void;
  onRestartTask?: (taskId: string) => void;
  onOpenTaskDirectory?: (taskId: string) => void;
  /** 后台有新结果、尚未切过去查看的任务 */
  unreadTaskIds?: ReadonlySet<string>;
  onCloseTask: (taskId: string, e: React.MouseEvent) => void;
  onRenameTask?: (taskId: string, title: string) => void;
  onOpenSettings?: () => void;
  musicDirectory?: string;
  showMusicPlayer?: boolean;
}

function getGreeting(): { text: string; period: 'day' | 'evening' | 'midnight' } {
  const hour = new Date().getHours();
  if (hour < 5) return { text: '午夜好，早休息。', period: 'midnight' };
  if (hour < 11) return { text: '早上好，你最棒。', period: 'day' };
  if (hour < 13) return { text: '中午好，你最棒。', period: 'day' };
  if (hour < 18) return { text: '下午好，你最棒。', period: 'day' };
  return { text: '晚上好，你最棒。', period: 'evening' };
}

export const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  groups,
  workspacePath,
  onSwitchWorkspace,
  activeTaskId,
  onSelectTask,
  onToggleGroup,
  onReorderGroup,
  onNewTask,
  onCustomNewTask,
  onReorderTask,
  onRestartTask,
  onOpenTaskDirectory,
  unreadTaskIds,
  onCloseTask,
  onRenameTask,
  onOpenSettings,
  musicDirectory = '',
  showMusicPlayer = true,
}) => {
  const [greeting, setGreeting] = useState(getGreeting);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const taskButtons = useRef(new Map<string, HTMLButtonElement>());
  const finishingRef = useRef(false);
  const [dropPosition, setDropPosition] = useState<'before' | 'after'>('before');
  // 任务只在所属分组内拖拽排序
  const [draggedTask, setDraggedTask] = useState<{ id: string; groupId: string } | null>(null);
  const [taskDropTargetId, setTaskDropTargetId] = useState<string | null>(null);

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

  // 切换、恢复或快捷键选中任务后，保证当前任务行在侧栏可见区域内
  const activeGroupExpanded = groups.some((g) => g.isExpanded && g.tasks.some((t) => t.id === activeTaskId));
  useEffect(() => {
    if (!activeTaskId || !activeGroupExpanded) return;
    document.querySelector(`[data-task-id="${CSS.escape(activeTaskId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeTaskId, activeGroupExpanded]);

  // 与 App 中 Ctrl+数字 的任务顺序一致：按分组顺序展平，前 9 个带序号
  const taskOrder = new Map<string, number>();
  groups.flatMap((g) => g.tasks).forEach((t, i) => taskOrder.set(t.id, i + 1));

  const runningCount = groups.reduce(
    (count, group) => count + group.tasks.filter((task) => isTaskAlive(task.status)).length,
    0,
  );
  const pathParts = workspacePath.replace(/[\\/]+$/, '').split(/[\\/]/);
  const folderName = pathParts.pop() || workspacePath;
  const folderParent = pathParts.join('\\');

  // 右键菜单：任务行与分组行共用，taskId 为空时是分组菜单
  const [menu, setMenu] = useState<{ x: number; y: number; taskId?: string; groupId: string } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  const menuTask = menu?.taskId ? groups.flatMap((g) => g.tasks).find((t) => t.id === menu.taskId) : undefined;
  const menuGroup = menu && !menu.taskId ? groups.find((g) => g.id === menu.groupId) : undefined;
  const menuItemClass = 'flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-hover';

  // 折叠后保留窄条：各 CLI 图标（点击新建任务）、其下的任务序号按钮（带状态点，可直接切换），底部保留工作目录与设置
  if (isCollapsed) {
    return (
      <aside id="oneai-sidebar" aria-label="任务列表（已折叠）" className="flex h-full w-12 shrink-0 select-none flex-col items-center border-r border-line bg-surface">
        <div className="flex h-11 w-full shrink-0 items-center justify-center border-b border-line bg-panel">
          <AppLogo size={20} />
        </div>

        <div className="flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto py-2">
          {groups.map((group) => (
            <React.Fragment key={group.id}>
              <button
                type="button"
                onClick={() => onNewTask(group.id)}
                onContextMenu={(e) => { e.preventDefault(); onCustomNewTask?.(group.id); }}
                title={`新建 ${group.name} 任务（右键可自定义命令与目录）`}
                aria-label={`新建 ${group.name} 任务`}
                className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-hover [&:not(:first-child)]:mt-2"
              >
                <BrandIcon icon={group.icon} size={18} />
                <Plus size={10} className="absolute bottom-0.5 right-0.5 rounded-full bg-surface text-fg-faint group-hover:text-accent" aria-hidden="true" />
              </button>
              {group.tasks.map((task) => {
                const order = taskOrder.get(task.id) ?? 0;
                const isActive = task.id === activeTaskId;
                const statusMeta = TASK_STATUS_META[task.status];
                const isUnread = !isActive && Boolean(unreadTaskIds?.has(task.id));
                return (
                  <button
                    key={task.id}
                    type="button"
                    data-task-id={task.id}
                    onClick={() => onSelectTask(task.id, group.id)}
                    aria-current={isActive ? 'true' : undefined}
                    title={`${group.name}：${task.title}（${statusMeta.label}${isUnread ? '，待查看' : ''}）${order <= 9 ? ` Ctrl+${order}` : ''}`}
                    aria-label={`${group.name}：${task.title}，${statusMeta.label}${isUnread ? '，待查看' : ''}`}
                    className={`relative flex h-7 w-9 shrink-0 items-center justify-center rounded-md font-mono text-xs tabular-nums transition-colors ${isActive ? 'bg-selected font-medium text-fg' : isUnread ? 'bg-accent font-semibold text-canvas hover:bg-accent/85' : 'text-fg-subtle hover:bg-hover hover:text-fg'}`}
                  >
                    {order}
                    {!isUnread && <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} aria-hidden="true" />}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        <div className="flex w-full shrink-0 flex-col items-center gap-1 border-t border-line bg-panel py-2">
          <button
            type="button"
            onClick={onSwitchWorkspace}
            className="icon-btn h-8 w-8"
            title={`切换工作文件夹：${workspacePath}`}
            aria-label="切换工作文件夹"
          >
            <FolderGit2 size={15} className="text-accent" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="icon-btn h-8 w-8"
            title="设置 (Ctrl+,)"
            aria-label="设置"
          >
            <Settings size={15} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside id="oneai-sidebar" className={`flex w-80 bg-surface border-r border-line flex-col h-full select-none shrink-0 text-fg-muted`}>
      {/* 侧边栏顶部：应用品牌与问候语 */}
      <div className="h-11 shrink-0 px-3.5 border-b border-line flex items-center justify-between bg-panel">
        <div className="flex items-center gap-2 shrink-0">
          <AppLogo size={20} />
          <span className="text-sm font-semibold tracking-wide text-fg">OneAI</span>
        </div>
        <span className="flex items-center gap-1 text-2xs text-fg-subtle whitespace-nowrap ml-2" aria-live="polite">
          {greeting.period === 'day' ? <Sun size={12} className="text-warning shrink-0" aria-hidden="true" />
            : greeting.period === 'evening' ? <Moon size={12} className="text-fg-muted shrink-0" aria-hidden="true" />
              : <BedDouble size={12} className="text-accent shrink-0" aria-hidden="true" />}
          {greeting.text}
        </span>
      </div>

      {/* CLI 分组与多子任务树状列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="flex items-center justify-between px-2 pb-1.5 pt-3 text-2xs text-fg-faint">
          <span className="font-semibold tracking-wider">CLI 分组</span>
          {runningCount > 0 && <span className="tabular-nums">{runningCount} 个运行中</span>}
        </div>

        <div className="space-y-0.5">
          {groups.map((group) => {
            const hasActiveChild = group.tasks.some((t) => t.id === activeTaskId);
            const unreadCount = group.tasks.filter((t) => t.id !== activeTaskId && unreadTaskIds?.has(t.id)).length;

            return (
              <div key={group.id} data-group-row className={`rounded-md border-y-2 border-transparent ${dropTargetId === group.id ? (dropPosition === 'after' ? 'border-b-accent' : 'border-t-accent') : ''}`}
                onDragOver={(e) => {
                  if (!draggedGroupId || draggedGroupId === group.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDropTargetId(group.id);
                  setDropPosition(groups.findIndex((g) => g.id === draggedGroupId) < groups.findIndex((g) => g.id === group.id) ? 'after' : 'before');
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedGroupId) onReorderGroup(draggedGroupId, group.id);
                  setDraggedGroupId(null);
                  setDropTargetId(null);
                }}>
                {/* 一级 CLI 分组行：排序手柄、展开按钮与新建按钮为同级按钮，均可键盘操作 */}
                <div
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, groupId: group.id });
                  }}
                  className={`group flex items-center rounded-md pr-1 text-ui transition-colors ${
                    hasActiveChild && !group.isExpanded
                      ? 'bg-selected/60 text-fg'
                      : `hover:bg-hover hover:text-fg ${hasActiveChild ? 'text-fg' : 'text-fg-muted'}`
                  }`}
                >
                  <button type="button" draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', group.id);
                      const row = e.currentTarget.closest('[data-group-row]');
                      if (row) e.dataTransfer.setDragImage(row, 16, 16);
                      setDraggedGroupId(group.id);
                    }}
                    onDragEnd={() => { setDraggedGroupId(null); setDropTargetId(null); }}
                    onKeyDown={(e) => {
                      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                      e.preventDefault();
                      const index = groups.findIndex((item) => item.id === group.id);
                      const neighbor = groups[index + (e.key === 'ArrowUp' ? -1 : 1)];
                      if (neighbor) onReorderGroup(group.id, neighbor.id);
                    }}
                    className="flex h-8 w-4 shrink-0 cursor-grab items-center justify-center rounded-sm text-fg-faint opacity-40 transition-opacity hover:text-accent focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
                    title={`拖动排序 ${group.name}；或按 Alt + 上下方向键`}
                    aria-label={`排序 ${group.name}，按 Alt 加上下方向键移动`}
                  ><GripVertical size={12} /></button>

                  <button
                    type="button"
                    onClick={() => onToggleGroup(group.id)}
                    aria-expanded={group.isExpanded}
                    className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm text-left"
                  >
                    <ChevronRight size={13} className={`shrink-0 text-fg-faint transition-transform ${group.isExpanded ? 'rotate-90' : ''}`} aria-hidden="true" />
                    {/* 大模型品牌专属 Logo 图标 */}
                    <BrandIcon icon={group.icon} size={16} />
                    <span className="truncate font-medium">{group.name}</span>
                    {group.tasks.length > 0 && (
                      <span
                        className={`ml-auto shrink-0 rounded-full px-1.5 text-2xs tabular-nums ${unreadCount > 0 && !group.isExpanded ? 'bg-accent/15 font-medium text-accent' : 'bg-muted text-fg-subtle'}`}
                        title={unreadCount > 0 ? `${group.tasks.length} 个任务，${unreadCount} 个待查看` : `${group.tasks.length} 个任务`}
                      >{group.tasks.length}</span>
                    )}
                  </button>

                  {/* 快捷添加该 CLI 子任务 */}
                  <button
                    type="button"
                    onClick={() => onNewTask(group.id)}
                    className="icon-btn ml-0.5 h-6 w-6 text-fg-faint enabled:hover:text-accent"
                    title={`新建 ${group.name} 任务（右键可自定义命令与目录）`}
                    aria-label={`新建 ${group.name} 任务`}
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* 二级：该 CLI 下的并发多子任务列表 */}
                {group.isExpanded && (
                  <div className="ml-[1.4rem] mt-0.5 space-y-0.5 border-l border-line pl-1.5">
                    {group.tasks.length === 0 && (
                      <button
                        type="button"
                        onClick={() => onNewTask(group.id)}
                        className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-xs text-fg-faint transition-colors hover:bg-hover hover:text-fg-muted"
                      >
                        <Plus size={12} />
                        <span>新建任务</span>
                      </button>
                    )}

                    {group.tasks.map((task) => {
                      const isActive = task.id === activeTaskId;
                      const statusMeta = TASK_STATUS_META[task.status];
                      const isUnread = !isActive && Boolean(unreadTaskIds?.has(task.id));
                      const dropEdge = taskDropTargetId === task.id && draggedTask
                        ? (group.tasks.findIndex((t) => t.id === draggedTask.id) < group.tasks.findIndex((t) => t.id === task.id) ? 'after' : 'before')
                        : null;

                      if (editing?.id === task.id) {
                        return (
                          <input
                            key={task.id}
                            autoFocus
                            value={editing.draft}
                            aria-label={`重命名 ${task.title}`}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setEditing({ id: task.id, draft: e.target.value })}
                            onBlur={() => finishRename(true, false)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') finishRename(true, true);
                              else if (e.key === 'Escape') { e.stopPropagation(); finishRename(false, true); }
                            }}
                            className="h-8 w-full rounded-md border border-accent bg-canvas px-2 text-ui text-fg outline-none select-text"
                          />
                        );
                      }

                      return (
                        <div
                          key={task.id}
                          data-task-id={task.id}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenu({ x: e.clientX, y: e.clientY, taskId: task.id, groupId: group.id });
                          }}
                          // 鼠标中键关闭任务；按下时阻止默认行为，避免出现自动滚动光标
                          onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
                          onAuxClick={(e) => { if (e.button === 1) onCloseTask(task.id, e); }}
                          draggable={Boolean(onReorderTask)}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', task.id);
                            setDraggedTask({ id: task.id, groupId: group.id });
                          }}
                          onDragEnd={() => { setDraggedTask(null); setTaskDropTargetId(null); }}
                          onDragOver={(e) => {
                            if (!draggedTask || draggedTask.groupId !== group.id || draggedTask.id === task.id) return;
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            setTaskDropTargetId(task.id);
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) setTaskDropTargetId((current) => (current === task.id ? null : current));
                          }}
                          onDrop={(e) => {
                            if (!draggedTask || draggedTask.groupId !== group.id) return;
                            e.preventDefault();
                            e.stopPropagation();
                            onReorderTask?.(group.id, draggedTask.id, task.id);
                            setDraggedTask(null);
                            setTaskDropTargetId(null);
                          }}
                          className={`group/task relative flex items-center rounded-md text-ui transition-colors ${
                            isActive
                              ? 'bg-selected font-medium text-fg'
                              : isUnread
                                ? 'font-medium text-fg hover:bg-hover'
                                : 'text-fg-subtle hover:bg-hover hover:text-fg'
                          } ${draggedTask?.id === task.id ? 'opacity-50' : ''} ${
                            dropEdge === 'before' ? 'shadow-[inset_0_2px_0_rgb(var(--color-accent))]' : dropEdge === 'after' ? 'shadow-[inset_0_-2px_0_rgb(var(--color-accent))]' : ''
                          }`}
                        >
                          {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
                          <button
                            type="button"
                            ref={(node) => { if (node) taskButtons.current.set(task.id, node); else taskButtons.current.delete(task.id); }}
                            onClick={() => onSelectTask(task.id, group.id)}
                            onDoubleClick={() => onRenameTask && setEditing({ id: task.id, draft: task.title })}
                            onKeyDown={(e) => {
                              if (e.key === 'F2' && onRenameTask) setEditing({ id: task.id, draft: task.title });
                              if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && onReorderTask) {
                                e.preventDefault();
                                const index = group.tasks.findIndex((item) => item.id === task.id);
                                const neighbor = group.tasks[index + (e.key === 'ArrowUp' ? -1 : 1)];
                                if (neighbor) onReorderTask(group.id, task.id, neighbor.id);
                              }
                            }}
                            aria-current={isActive ? 'true' : undefined}
                            title={`${task.title}${task.errorMessage ? ` -- 启动失败：${task.errorMessage}` : ''}${onRenameTask ? '（双击或按 F2 重命名）' : ''}`}
                            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md pl-2.5 pr-1 text-left"
                          >
                            {/* 任务状态指示灯小圆点 */}
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusMeta.dot}`} title={statusMeta.hint} aria-hidden="true" />
                            <span className="truncate">{task.title}</span>
                            <span className="sr-only">，{statusMeta.label}</span>
                            {task.status === 'error' && <span className="text-2xs text-danger shrink-0" aria-hidden="true">启动失败</span>}
                            <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
                              {isUnread && (
                                <span className="rounded-full bg-accent/15 px-1.5 text-2xs font-medium text-accent" title="后台有新结果，点击查看">
                                  待查看
                                </span>
                              )}
                              {(taskOrder.get(task.id) ?? 99) <= 9 && (
                                <span className="font-mono text-2xs font-normal text-fg-faint" title={`Ctrl+${taskOrder.get(task.id)} 切换到此任务`} aria-hidden="true">{taskOrder.get(task.id)}</span>
                              )}
                            </span>
                          </button>

                          {/* 关闭任务按钮：当前任务常显，其余在悬停或聚焦时出现 */}
                          <button
                            type="button"
                            onClick={(e) => onCloseTask(task.id, e)}
                            className={`icon-btn mr-1 h-6 w-6 text-fg-faint transition-opacity enabled:hover:text-danger group-hover/task:opacity-100 group-focus-within/task:opacity-100 ${isActive ? 'opacity-100' : 'opacity-0'}`}
                            title={isTaskAlive(task.status) ? '关闭并终止此终端' : '移除此终端任务'}
                            aria-label={`关闭 ${task.title}`}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showMusicPlayer && <MusicPlayer directory={musicDirectory} />}

      {/* 侧边栏底部：当前项目工作目录与设置 */}
      <div className="flex shrink-0 items-center gap-1 border-t border-line bg-panel p-2">
        <button
          type="button"
          onClick={onSwitchWorkspace}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover"
          title={`切换工作文件夹：${workspacePath}`}
        >
          <FolderGit2 size={15} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-ui font-medium leading-tight text-fg">{folderName}</span>
            {folderParent && <span className="block truncate font-mono text-2xs leading-tight text-fg-faint">{folderParent}</span>}
          </span>
          <ChevronsUpDown size={13} className="shrink-0 text-fg-faint" />
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="icon-btn h-8 w-8"
          title="设置 (Ctrl+,)"
          aria-label="设置"
        >
          <Settings size={15} />
        </button>
      </div>
      {menu && (menuTask || menuGroup) && (
        <div
          role="menu"
          style={{ left: Math.min(menu.x, window.innerWidth - 216), top: Math.min(menu.y, window.innerHeight - (menuTask ? 184 : 84)) }}
          className="fixed z-50 w-52 rounded-md border border-line-strong bg-elevated py-1 text-ui text-fg shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {menuGroup && (
            <>
              <button type="button" role="menuitem" className={menuItemClass}
                onClick={() => { setMenu(null); onNewTask(menuGroup.id); }}>
                <Plus size={13} />新建任务
              </button>
              {onCustomNewTask && (
                <button type="button" role="menuitem" className={menuItemClass}
                  onClick={() => { setMenu(null); onCustomNewTask(menuGroup.id); }}>
                  <SlidersHorizontal size={13} />自定义命令与目录…
                </button>
              )}
            </>
          )}
          {menuTask && (
            <>
              {onRenameTask && (
                <button type="button" role="menuitem" className={menuItemClass}
                  onClick={() => { setEditing({ id: menuTask.id, draft: menuTask.title }); setMenu(null); }}>
                  <Pencil size={13} />重命名
                </button>
              )}
              {onRestartTask && (
                <button type="button" role="menuitem" className={menuItemClass} disabled={menuTask.status === 'starting'}
                  onClick={() => { setMenu(null); onRestartTask(menuTask.id); }}>
                  <RotateCcw size={13} />{isTaskAlive(menuTask.status) ? '重启终端' : '启动终端'}
                </button>
              )}
              <button type="button" role="menuitem" className={menuItemClass}
                onClick={() => { void window.electronAPI?.writeClipboardText?.(menuTask.cwd); setMenu(null); }}>
                <Copy size={13} />复制工作目录
              </button>
              {onOpenTaskDirectory && (
                <button type="button" role="menuitem" className={menuItemClass}
                  onClick={() => { setMenu(null); onOpenTaskDirectory(menuTask.id); }}>
                  <FolderOpen size={13} />在资源管理器中打开
                </button>
              )}
              <div className="my-1 border-t border-line" role="separator" />
              <button type="button" role="menuitem" className={`${menuItemClass} text-danger`}
                onClick={(e) => { setMenu(null); onCloseTask(menuTask.id, e); }}>
                <X size={13} />关闭任务
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
};
