import React, { useState, useEffect } from 'react';
import { Terminal, ChevronRight, Clock } from 'lucide-react';
import { InlineQuotaText } from './InlineQuotaText';
import { QuotaData, TaskSession, CliGroup } from '../types';
import { BrandIcon } from './BrandIcon';

interface TopbarProps {
  currentGroup: CliGroup | null;
  activeTask: TaskSession | null;
  quota: QuotaData | null;
  onRefreshQuota: () => Promise<void>;
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
      month: 'long', day: 'numeric',
    }).formatToParts(now);
    const month = parts.find(p => p.type === 'month')?.value ?? '';
    const dayNum = parseInt(parts.find(p => p.type === 'day')?.value ?? '0', 10);
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
}) => {
  const [currentTime, setCurrentTime] = useState<string>(getFormattedTime);

  // 每秒精准更新时分秒 12:03:12，秒数持续变动
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getFormattedTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="relative h-10 bg-[#12151d] border-b border-[#232936] flex items-center justify-between px-4 select-none shrink-0 z-10">
      {/* 左侧：会话面包屑导航 */}
      <div className="flex items-center space-x-2 text-xs text-slate-300">
        {currentGroup ? (
          <div className="flex items-center space-x-1.5">
            <BrandIcon icon={currentGroup.icon} size={16} />
            <span className="font-medium text-slate-200">{currentGroup.name}</span>
            {activeTask && (
              <>
                <ChevronRight size={13} className="text-slate-500" />
                <span className="text-slate-300 font-mono">{activeTask.title}</span>
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1c2230] text-emerald-400 border border-emerald-500/20">
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
      </div>

      {/* 中间空白区域：时分秒 12:03:12 实时变动时钟 */}
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
