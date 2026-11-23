import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { FolderOpen, FolderTree, ChevronRight, LayoutDashboard, Search, Eraser, RotateCcw, Download, Copy, FileText, Check, PanelLeftClose, PanelLeftOpen, History } from 'lucide-react';
import { InlineQuotaText } from './InlineQuotaText';
import { SystemStatsText } from './SystemStatsText';
import { QuotaData, TaskSession, CliDef } from '../types';
import { BrandIcon } from './BrandIcon';
import { getLanguage, t } from '../i18n';

interface TopbarProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  currentGroup: CliDef | null;
  activeTask: TaskSession | null;
  /** 当前任务使用的账号名；默认账号时缺省 */
  accountName?: string;
  /** 没有活动任务时显示的当前文件夹（新任务将在此启动）与 Git 分支 */
  emptyFolder?: { name: string; branch?: string | null };
  quota: QuotaData | null;
  clockOffsetHours?: number;
  /** 窗口最大化时是否在时钟里显示年月日（含农历）与星期，默认显示；设置 → 时间 里可关闭 */
  dateVisible?: boolean;
  onRefreshQuota: () => Promise<void>;
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

// 数字日期转中文数字（1~30）
function toChineseDay(n: number): string {
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (n <= 10) return digits[n];
  if (n < 20) return `十${digits[n - 10]}`;
  if (n === 20) return '二十';
  if (n < 30) return `二十${digits[n - 20]}`;
  return '三十';
}

let lunarFormatter: Intl.DateTimeFormat | undefined;
let lunarLocale = '';
let cachedLunarKey = '';
let cachedLunarValue = '';

function getLunarStr(now: Date, locale: string): string {
  const dayKey = `${locale}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (dayKey === cachedLunarKey) return cachedLunarValue;
  try {
    if (!lunarFormatter || lunarLocale !== locale) {
      lunarFormatter = new Intl.DateTimeFormat(`${locale}-u-ca-chinese`, {
        month: 'long',
        day: 'numeric',
      });
      lunarLocale = locale;
    }
    const parts = lunarFormatter.formatToParts(now);
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const dayNum = parseInt(parts.find((p) => p.type === 'day')?.value ?? '0', 10);
    cachedLunarKey = dayKey;
    cachedLunarValue = `${month}${toChineseDay(dayNum)}日`;
    return cachedLunarValue;
  } catch {
    cachedLunarKey = dayKey;
    cachedLunarValue = '';
    return '';
  }
}

export type ClockDisplayMode = 'full' | 'time' | 'hidden';

/** 根据可用宽度与时钟自身宽度决定显示模式，进入更宽档位时带滞回防止边界抖动 */
export function resolveClockDisplayMode(
  availableWidth: number,
  timeWidth: number,
  fullWidth: number,
  wantsFull: boolean,
  currentMode: ClockDisplayMode | null = null,
  hysteresis = 8,
): ClockDisplayMode {
  if (timeWidth <= 0) return 'hidden';
  const fullThreshold = currentMode === 'full' ? fullWidth : fullWidth + (currentMode === null ? 0 : hysteresis);
  if (wantsFull && fullWidth > 0 && availableWidth >= fullThreshold) {
    return 'full';
  }
  const timeThreshold = currentMode === 'time' || currentMode === 'full'
    ? timeWidth
    : timeWidth + (currentMode === null ? 0 : hysteresis);
  if (availableWidth >= timeThreshold) {
    return 'time';
  }
  return 'hidden';
}

const parsePx = (value: string, fallback = 6): number => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

// offsetHours：顶栏时间相对系统时间增加的小时数，在设置的「时间」栏目中配置
function getFormattedTime(showDate: boolean, offsetHours: number): string {
  const now = new Date(Date.now() + (Number.isFinite(offsetHours) ? offsetHours : 0) * 60 * 60 * 1000);
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  if (!showDate) return `${h}:${m}:${s}`;
  const weekdays = [t('周日'), t('周一'), t('周二'), t('周三'), t('周四'), t('周五'), t('周六')];
  const Y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const D = String(now.getDate()).padStart(2, '0');
  const w = weekdays[now.getDay()];
  const language = getLanguage();
  const lunar = language === 'en' ? '' : getLunarStr(now, language);
  const lunarPart = lunar ? `（${lunar}）` : '';
  return `${Y}-${M}-${D}${lunarPart} ${h}:${m}:${s} ${t('（{weekday}）', { weekday: w })}`;
}

/** 独立时钟节点：每秒滴答只更新自身文本，不触发整条顶栏重渲染；隐藏或窗口不可见时暂停滴答 */
const TopbarClock: React.FC<{ mode: ClockDisplayMode; clockOffsetHours: number; language?: string }> = React.memo(({
  mode,
  clockOffsetHours,
}) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (mode === 'hidden') return;
    const refreshIfVisible = () => {
      if (document.hidden) return;
      setTick((v) => (v + 1) % 1_000_000);
    };
    const timer = setInterval(refreshIfVisible, 1000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [mode]);

  return (
    <div
      id="oneai-topbar-clock"
      data-clock-mode={mode}
      className={`topbar-clock pointer-events-none shrink-0 whitespace-nowrap px-1.5 font-mono text-xs font-bold tabular-nums tracking-wide text-fg-subtle ${mode === 'hidden' ? 'hidden' : ''}`}
    >
      {mode === 'hidden' ? '' : getFormattedTime(mode === 'full', clockOffsetHours)}
    </div>
  );
});

TopbarClock.displayName = 'TopbarClock';

export const Topbar: React.FC<TopbarProps> = React.memo(({
  isSidebarCollapsed,
  onToggleSidebar,
  currentGroup,
  activeTask,
  accountName,
  emptyFolder,
  quota,
  clockOffsetHours = 0,
  dateVisible = true,
  onRefreshQuota,
  onOpenSearch,
  onClearScreen,
  onRestartSession,
  onExportLogs,
  onOpenHistory,
  isDashboardOpen = false,
  isFileTreeOpen,
  onToggleFileTree,
  language,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [action, setAction] = useState<{ text: string; ok: boolean } | null>(null);
  const [clockMode, setClockMode] = useState<ClockDisplayMode>('hidden');
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const leftGroupRef = useRef<HTMLDivElement>(null);
  const timeMeasureRef = useRef<HTMLSpanElement>(null);
  const fullMeasureRef = useRef<HTMLSpanElement>(null);
  const clockModeRef = useRef<ClockDisplayMode | null>(null);
  const actionTimerRef = useRef(0);

  const wantsFull = isMaximized && dateVisible;
  const fullSample = wantsFull ? getFormattedTime(true, clockOffsetHours) : '';
  const hasHistoryBtn = Boolean(onOpenHistory);
  const hasFileTreeBtn = Boolean(onToggleFileTree);

  const measureClockMode = useCallback(() => {
    const header = headerRef.current;
    const leftGroup = leftGroupRef.current;
    const timeEl = timeMeasureRef.current;
    if (!header || !leftGroup || !timeEl || header.clientWidth <= 0) return;

    const headerStyle = getComputedStyle(header);
    const padLeft = parsePx(headerStyle.paddingLeft, 0);
    const padRight = parsePx(headerStyle.paddingRight, 0);
    const headerGap = parsePx(headerStyle.columnGap || headerStyle.gap, 6);
    const innerWidth = header.clientWidth - padLeft - padRight;
    const rootFontSize = parsePx(getComputedStyle(document.documentElement).fontSize, 16);
    const maxTruncatableReserve = 14 * rootFontSize;

    const leftStyle = getComputedStyle(leftGroup);
    const leftGap = parsePx(leftStyle.columnGap || leftStyle.gap, 6);

    const measureLeftChild = (el: Element): number => {
      const style = getComputedStyle(el);
      if (style.display === 'none') return 0;
      if (el.hasAttribute('data-topbar-breadcrumb')) {
        const bGap = parsePx(style.columnGap || style.gap, 6);
        let total = 0;
        let count = 0;
        for (const child of Array.from(el.children)) {
          const cStyle = getComputedStyle(child);
          if (cStyle.display === 'none' || child.getClientRects().length === 0) continue;
          const w = child.hasAttribute('data-topbar-truncatable')
            ? Math.min(Math.ceil((child as HTMLElement).scrollWidth), maxTruncatableReserve)
            : child.getBoundingClientRect().width;
          if (w > 0) {
            total += w;
            count += 1;
          }
        }
        return count > 0 ? total + bGap * (count - 1) : 0;
      }
      if (el.getClientRects().length === 0) return 0;
      if (el.hasAttribute('data-topbar-truncatable')) {
        return Math.min(Math.ceil((el as HTMLElement).scrollWidth), maxTruncatableReserve);
      }
      return el.getBoundingClientRect().width;
    };

    let leftNeeded = 0;
    let leftVisibleCount = 0;
    for (const child of Array.from(leftGroup.children)) {
      const w = measureLeftChild(child);
      if (w > 0) {
        leftNeeded += w;
        leftVisibleCount += 1;
      }
    }
    if (leftVisibleCount > 1) {
      leftNeeded += leftGap * (leftVisibleCount - 1);
    }

    let rightTotal = 0;
    let rightVisibleCount = 0;
    for (const child of Array.from(header.children)) {
      if (child === leftGroup || child.id === 'oneai-topbar-clock' || child.hasAttribute('data-topbar-measure')) {
        continue;
      }
      if (child.getClientRects().length === 0) continue;
      const w = child.getBoundingClientRect().width;
      if (w > 0) {
        rightTotal += w;
        rightVisibleCount += 1;
      }
    }

    const SAFETY_BUFFER = 8;
    const otherVisibleCount = 1 + rightVisibleCount;
    const availableWidth = innerWidth - leftNeeded - rightTotal - headerGap * otherVisibleCount - SAFETY_BUFFER;
    const timeWidth = Math.ceil(timeEl.getBoundingClientRect().width);
    const fullWidth = fullMeasureRef.current ? Math.ceil(fullMeasureRef.current.getBoundingClientRect().width) : 0;
    const nextMode = resolveClockDisplayMode(availableWidth, timeWidth, fullWidth, wantsFull, clockModeRef.current);

    clockModeRef.current = nextMode;
    setClockMode((prev) => (prev === nextMode ? prev : nextMode));
  }, [wantsFull]);

  useLayoutEffect(() => {
    measureClockMode();
  }, [
    measureClockMode,
    language,
    clockOffsetHours,
    isDashboardOpen,
    activeTask?.id,
    activeTask?.title,
    currentGroup?.id,
    currentGroup?.name,
    accountName,
    emptyFolder?.name,
    emptyFolder?.branch,
    action?.text,
    quota,
    isSidebarCollapsed,
    hasHistoryBtn,
    hasFileTreeBtn,
  ]);

  useEffect(() => {
    const header = headerRef.current;
    const leftGroup = leftGroupRef.current;
    if (!header || !leftGroup) return;

    let rafId = 0;
    const scheduleMeasure = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        measureClockMode();
      });
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleMeasure)
      : null;

    const syncObserved = () => {
      if (!resizeObserver) return;
      resizeObserver.disconnect();
      resizeObserver.observe(header);
      if (timeMeasureRef.current) resizeObserver.observe(timeMeasureRef.current);
      if (fullMeasureRef.current) resizeObserver.observe(fullMeasureRef.current);
      for (const child of Array.from(header.children)) {
        if (child === leftGroup || child.id === 'oneai-topbar-clock' || child.hasAttribute('data-topbar-measure')) {
          continue;
        }
        resizeObserver.observe(child);
      }
    };

    syncObserved();

    const mutationObserver = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => {
        syncObserved();
        scheduleMeasure();
      })
      : null;
    mutationObserver?.observe(header, { childList: true });

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [measureClockMode]);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.electronAPI.onWindowMaximizedChange(setIsMaximized);
    window.electronAPI.isWindowMaximized().then((maximized) => {
      if (active) setIsMaximized(maximized);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

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

  const menuItem = 'flex w-full items-center gap-2 px-3 py-2 text-left text-fg-muted transition-colors hover:bg-hover hover:text-fg';

  return (
    <header ref={headerRef} className="topbar relative z-10 flex h-11 shrink-0 select-none items-center gap-1.5 border-b border-line bg-panel px-2.5">
      {/* 测量占位节点：脱离文档流且继承字体与缩放，避免影响布局或撑大 scrollWidth */}
      <div
        aria-hidden="true"
        data-topbar-measure
        className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden whitespace-nowrap"
      >
        <span ref={timeMeasureRef} className="inline-block w-max px-1.5 font-mono text-xs font-bold tabular-nums tracking-wide">
          88:88:88
        </span>
        {wantsFull && (
          <span ref={fullMeasureRef} className="inline-block w-max px-1.5 font-mono text-xs font-bold tabular-nums tracking-wide">
            {fullSample}
          </span>
        )}
      </div>

      {/* 左侧：侧栏开关、会话面包屑与终端工具；面包屑在空间不足时自动截断 */}
      <div ref={leftGroupRef} className="flex min-w-0 flex-1 items-center gap-1.5 text-ui text-fg-muted">
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
            <span data-topbar-truncatable className="truncate font-medium text-fg">Dashboard</span>
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

      {/* 时钟：按顶栏实际剩余空间两级降级（完整日期时间 -> HH:MM:SS -> 隐藏） */}
      <TopbarClock mode={clockMode} clockOffsetHours={clockOffsetHours} language={language} />

      {/* 右侧：单行横排纯文字大模型配额（无弹窗、无浮窗）；没有活动终端或处于 Dashboard 页面时不显示额度与刷新按钮 */}
      {!isDashboardOpen && activeTask && (
        <div id="oneai-topbar-quota" className="flex shrink-0 items-center whitespace-nowrap border-l border-line pl-2">
          <InlineQuotaText quota={quota} onRefresh={onRefreshQuota} language={language} />
        </div>
      )}

      {/* 整机资源统计与活动终端无关，空间不足时由 .topbar-sys-* 依次收起 */}
      <SystemStatsText language={language} />

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
    </header>
  );
});

Topbar.displayName = 'Topbar';
