import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, FolderTree, ChevronRight, LayoutDashboard, Search, Eraser, RotateCcw, Download, Copy, FileText, Check, PanelLeftClose, PanelLeftOpen, History } from 'lucide-react';
import { TaskSession, CliDef } from '../types';
import { BrandIcon } from './BrandIcon';
import { t } from '../i18n';

interface TopbarProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  currentGroup: CliDef | null;
  activeTask: TaskSession | null;
  /** 当前任务使用的账号名；默认账号时缺省 */
  accountName?: string;
  /** 没有活动任务时显示的当前文件夹（新任务将在此启动）与 Git 分支 */
  emptyFolder?: { name: string; branch?: string | null };
  onOpenSearch?: () => void;
  onClearScreen?: () => void;
  onRestartSession?: () => Promise<void>;
  onExportLogs?: (mode: 'copy' | 'save') => Promise<{ success: boolean; error?: string; canceled?: boolean }>;
  onOpenHistory?: () => void;
  isDashboardOpen?: boolean;
  isFileTreeOpen?: boolean;
  onToggleFileTree?: () => void;
  /** 传入当前语言，使 React.memo 在切换语言时同步重绘 */
  language?: string;
}

export const Topbar: React.FC<TopbarProps> = React.memo(({
  isSidebarCollapsed,
  onToggleSidebar,
  currentGroup,
  activeTask,
  accountName,
  emptyFolder,
  onOpenSearch,
  onClearScreen,
  onRestartSession,
  onExportLogs,
  onOpenHistory,
  isDashboardOpen = false,
  isFileTreeOpen,
  onToggleFileTree,
}) => {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [action, setAction] = useState<{ text: string; ok: boolean } | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const actionTimerRef = useRef(0);

  // 点击外部或按 Esc 关闭导出下拉菜单
  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExportMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportMenuOpen]);

  useEffect(() => () => window.clearTimeout(actionTimerRef.current), []);

  const showAction = (text: string, ok: boolean) => {
    setAction({ text, ok });
    window.clearTimeout(actionTimerRef.current);
    actionTimerRef.current = window.setTimeout(() => setAction(null), 2500);
  };

  const handleCopyLogs = async () => {
    setIsExportMenuOpen(false);
    const result = await onExportLogs?.('copy');
    if (result?.success) showAction(t('会话文本已复制'), true);
    else showAction(t('复制失败：{reason}', { reason: result?.error || t('操作未完成') }), false);
  };

  const handleSaveLogs = async () => {
    setIsExportMenuOpen(false);
    const result = await onExportLogs?.('save');
    if (result?.success) showAction(t('日志已保存'), true);
    else if (!result?.canceled) showAction(t('保存失败：{reason}', { reason: result?.error || t('操作未完成') }), false);
  };

  const isRunning = !isDashboardOpen && activeTask?.status === 'running';
  const menuItem = 'flex w-full items-center gap-2 px-3 py-2 text-left text-fg-muted transition-colors hover:bg-hover hover:text-fg';

  return (
    <header className="topbar relative z-10 flex h-11 shrink-0 select-none items-center gap-1.5 border-b border-line bg-panel px-2.5">
      {/* 左侧：侧栏开关、会话面包屑与终端工具；面包屑在空间不足时自动截断 */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-ui text-fg-muted">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isSidebarCollapsed ? t('展开左侧导航栏') : t('折叠左侧导航栏')}
          aria-expanded={!isSidebarCollapsed}
          aria-controls="oneai-sidebar"
          title={`${isSidebarCollapsed ? t('展开左侧导航栏') : t('折叠左侧导航栏')} (Ctrl+Shift+B)`}
          className="icon-btn"
        >
          {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <div className="h-4 w-px shrink-0 bg-line-strong" />
        {isDashboardOpen ? (
          <div data-topbar-breadcrumb className="flex min-w-0 items-center gap-1.5">
            <LayoutDashboard size={15} className="shrink-0 text-accent" aria-hidden="true" />
            <span data-topbar-truncatable className="truncate font-medium text-fg">{t('数据面板')}</span>
          </div>
        ) : currentGroup ? (
          <div data-topbar-breadcrumb className="flex min-w-0 items-center gap-1.5">
            <BrandIcon icon={currentGroup.icon} size={16} />
            <span className="topbar-group-name shrink-0 font-medium text-fg">{currentGroup.name}</span>
            {activeTask && (
              <>
                <ChevronRight size={13} className="topbar-group-name shrink-0 text-fg-faint" />
                <span data-topbar-truncatable className="min-w-0 max-w-[18rem] truncate text-fg-muted" title={activeTask.title}>
                  {activeTask.title}
                </span>
                {accountName && (
                  <span className="topbar-account max-w-[7rem] shrink-0 truncate rounded border border-line-strong px-1.5 py-px text-2xs text-fg-subtle" title={t('账号：{name}', { name: accountName })}>
                    {accountName}
                  </span>
                )}
              </>
            )}
          </div>
        ) : (
          <div data-topbar-breadcrumb className="flex min-w-0 items-center gap-1.5 text-fg-faint">
            <FolderOpen size={14} className="shrink-0 text-accent" />
            <span data-topbar-truncatable className="truncate font-medium text-fg-muted" data-empty-folder>{emptyFolder?.name ?? t('无活动终端会话')}</span>
            {emptyFolder?.branch && <span className="shrink-0 rounded-full border border-violet/30 bg-violet/10 px-1.5 text-2xs text-violet">{emptyFolder.branch}</span>}
            {emptyFolder && <span data-topbar-truncatable className="truncate">{t('· 选择 CLI 开始任务')}</span>}
          </div>
        )}

        {/* 终端工具 */}
        {!isDashboardOpen && activeTask && (
          <div id="oneai-terminal-tools" role="group" aria-label={t('终端工具')} className="flex shrink-0 items-center gap-0.5 border-l border-line pl-2">
            <button type="button" onClick={onOpenSearch} title={t('在终端中搜索关键词 (Ctrl+Shift+F)')} aria-label={t('在终端中搜索')} className="icon-btn">
              <Search size={15} />
            </button>
            <button type="button" onClick={onClearScreen} title={t('清空当前屏幕与历史缓存 (Ctrl+Shift+K)')} aria-label={t('清空屏幕')} className="icon-btn">
              <Eraser size={15} />
            </button>
            <button
              type="button"
              onClick={onRestartSession}
              title={activeTask.status === 'stopped' || activeTask.status === 'error' ? t('启动当前终端') : activeTask.status === 'starting' ? t('终端正在启动') : t('重启当前终端（保持当前目录与配置）')}
              aria-label={t('重启终端')}
              disabled={activeTask.status === 'starting'}
              className="icon-btn enabled:hover:text-warning"
            >
              <RotateCcw size={15} />
            </button>

            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setIsExportMenuOpen((v) => !v)}
                title={t('导出或复制会话日志')}
                aria-label={t('导出或复制会话日志')}
                aria-haspopup="menu"
                aria-expanded={isExportMenuOpen}
                className={`icon-btn ${isExportMenuOpen ? 'bg-hover text-fg' : ''}`}
              >
                {action?.ok ? <Check size={15} className="text-success" /> : <Download size={15} />}
              </button>

              {isExportMenuOpen && (
                <div role="menu" className="absolute left-0 z-50 mt-1.5 w-48 overflow-hidden rounded-lg border border-line-strong bg-elevated py-1 text-xs shadow-xl">
                  <button type="button" role="menuitem" autoFocus onClick={handleCopyLogs} className={menuItem}>
                    <Copy size={13} className="text-fg-subtle" />
                    <span>{t('复制最近会话文本')}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={handleSaveLogs} className={menuItem}>
                    <FileText size={13} className="text-fg-subtle" />
                    <span>{t('另存为日志文件…')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {action && (
          <span data-topbar-truncatable role="status" className={`min-w-0 truncate text-2xs ${action.ok ? 'text-success' : 'text-danger'}`} title={action.text}>
            {action.text}
          </span>
        )}
      </div>

      {onOpenHistory && (
        <button
          type="button"
          onClick={onOpenHistory}
          aria-label={t('查看历史会话')}
          title={t('查看所有 CLI 的历史会话 (Ctrl+Shift+H)')}
          className="icon-btn"
        >
          <History size={16} />
        </button>
      )}

      {onToggleFileTree && (
        <button
          type="button"
          onClick={onToggleFileTree}
          aria-label={t('项目目录树')}
          aria-expanded={Boolean(isFileTreeOpen)}
          title={t('查看当前项目目录树 (Ctrl+Shift+E)')}
          className={`icon-btn ${isFileTreeOpen ? 'bg-hover text-fg' : ''}`}
        >
          <FolderTree size={16} />
        </button>
      )}
      <div
        aria-hidden="true"
        data-topbar-neon={isRunning ? 'running' : 'idle'}
        className={`topbar-neon-track${isRunning ? ' is-running' : ''}`}
      >
        <span className="topbar-neon-beam" />
      </div>
    </header>
  );
});

Topbar.displayName = 'Topbar';
