import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronRight, Clock, Search, Eraser, RotateCcw, Download, Copy, FileText, Check } from 'lucide-react';
import { InlineQuotaText } from './InlineQuotaText';
import { QuotaData, TaskSession, CliGroup } from '../types';
import { BrandIcon } from './BrandIcon';

interface TopbarProps {
  currentGroup: CliGroup | null;
  activeTask: TaskSession | null;
  quota: QuotaData | null;
  onRefreshQuota: () => Promise<void>;
  onOpenSearch?: () => void;
  onClearScreen?: () => void;
  onRestartSession?: () => void;
  onExportLogs?: (mode: 'copy' | 'save') => void;
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

function getLunarStr(now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      month: 'long',
      day: 'numeric',
    }).formatToParts(now);
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const dayNum = parseInt(parts.find((p) => p.type === 'day')?.value ?? '0', 10);
    return `${month}${toChineseDay(dayNum)}日`;
  } catch {
    return '';
  }
}

function getFormattedTime(): string {
  const now = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const Y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const D = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const w = weekdays[now.getDay()];
  const lunar = getLunarStr(now);
  const lunarPart = lunar ? `（${lunar}）` : '';
  return `${Y}-${M}-${D}${lunarPart} ${h}:${m}:${s} （${w}）`;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentGroup,
  activeTask,
  quota,
  onRefreshQuota,
  onOpenSearch,
  onClearScreen,
  onRestartSession,
  onExportLogs,
}) => {
  const [currentTime, setCurrentTime] = useState<string>(getFormattedTime);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // 每秒精准更新时分秒 12:03:12
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getFormattedTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 点击外部关闭导出下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    if (isExportMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExportMenuOpen]);

  const handleCopyLogs = () => {
    setIsExportMenuOpen(false);
    onExportLogs?.('copy');
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  const handleSaveLogs = () => {
    setIsExportMenuOpen(false);
    onExportLogs?.('save');
  };

  return (
    <header className="relative h-10 bg-[#12151d] border-b border-[#232936] flex items-center justify-between px-4 select-none shrink-0 z-10">
      {/* 左侧：会话面包屑导航与快捷操作栏 */}
      <div className="flex items-center space-x-3 text-xs text-slate-300">
        {currentGroup ? (
          <div className="flex items-center space-x-1.5 min-w-0">
            <BrandIcon icon={currentGroup.icon} size={16} />
            <span className="font-medium text-slate-200 shrink-0">{currentGroup.name}</span>
            {activeTask && (
              <>
                <ChevronRight size={13} className="text-slate-500 shrink-0" />
                <span className="text-slate-300 font-mono max-w-[140px] truncate" title={activeTask.title}>
                  {activeTask.title}
                </span>
                <span
                  className={`ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border shrink-0 ${
                    activeTask.status === 'running'
                      ? 'bg-[#1c2230] text-emerald-400 border-emerald-500/20'
                      : activeTask.status === 'stopped'
                      ? 'bg-[#2a1c22] text-rose-400 border-rose-500/25'
                      : 'bg-[#1c2230] text-amber-400 border-amber-500/20'
                  }`}
                >
                  {activeTask.status}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-slate-500">
            <Terminal size={14} />
            <span>无活动终端会话</span>
          </div>
        )}

        {/* 终端控制快捷工具栏 */}
        {activeTask && (
          <div className="flex items-center space-x-1 pl-2 border-l border-[#232936]">
            {/* 搜索 (Ctrl+F) */}
            <button
              onClick={onOpenSearch}
              title="在终端中搜索关键词 (Ctrl+F)"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#1f2533] transition-colors"
            >
              <Search size={13} />
            </button>

            {/* 清屏 (Ctrl+K) */}
            <button
              onClick={onClearScreen}
              title="清空当前屏幕与历史缓存 (Ctrl+K)"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#1f2533] transition-colors"
            >
              <Eraser size={13} />
            </button>

            {/* 重启 CLI */}
            <button
              onClick={onRestartSession}
              title="重启当前 CLI 进程（保持当前目录与配置）"
              className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-[#1f2533] transition-colors"
            >
              <RotateCcw size={13} />
            </button>

            {/* 导出/复制日志下拉菜单 */}
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setIsExportMenuOpen((v) => !v)}
                title="导出或复制会话日志"
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#1f2533] transition-colors flex items-center"
              >
                {copiedNotification ? (
                  <Check size={13} className="text-emerald-400" />
                ) : (
                  <Download size={13} />
                )}
              </button>

              {isExportMenuOpen && (
                <div className="absolute left-0 mt-1 w-44 bg-[#161a24] border border-[#2d3748] rounded-md shadow-2xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={handleCopyLogs}
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 text-slate-300 hover:bg-[#202738] hover:text-white transition-colors"
                  >
                    <Copy size={12} className="text-slate-400" />
                    <span>复制完整会话文本</span>
                  </button>
                  <button
                    onClick={handleSaveLogs}
                    className="w-full text-left px-3 py-1.5 flex items-center space-x-2 text-slate-300 hover:bg-[#202738] hover:text-white transition-colors"
                  >
                    <FileText size={12} className="text-slate-400" />
                    <span>另存为日志文件...</span>
                  </button>
                </div>
              )}
            </div>

            {copiedNotification && (
              <span className="text-[10px] text-emerald-400 font-mono animate-in fade-in">
                已复制!
              </span>
            )}
          </div>
        )}
      </div>

      {/* 中间区域：时分秒精准变动时钟 */}
      <div className="flex items-center justify-center">
        <div className="flex items-center space-x-1.5 bg-[#161a24] px-2.5 py-0.5 rounded border border-[#232a3b] text-xs font-mono tabular-nums text-slate-300 shadow-inner">
          <Clock size={12} className="text-slate-400" />
          <span className="tracking-wider text-slate-200 font-medium">{currentTime}</span>
        </div>
      </div>

      {/* 右侧：单行横排纯文字大模型配额（无弹窗、无浮窗） */}
      <div className="flex items-center">
        <InlineQuotaText quota={quota} onRefresh={onRefreshQuota} />
      </div>
    </header>
  );
};
