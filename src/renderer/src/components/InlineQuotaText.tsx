import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { QuotaData } from '../types';

interface InlineQuotaTextProps {
  quota: QuotaData | null;
  onRefresh: () => Promise<void>;
}

export const InlineQuotaText: React.FC<InlineQuotaTextProps> = ({ quota, onRefresh }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshClick = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      // 保持轻微动画反馈
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  if (!quota) {
    return (
      <div className="flex items-center space-x-2 text-xs text-slate-500 font-mono select-none">
        <span>5h Quota: -- | 7d Quota: --</span>
        <button
          onClick={handleRefreshClick}
          className="p-1 hover:text-slate-300 transition-colors"
          title="刷新额度"
        >
          <RotateCw size={13} className={isRefreshing ? 'animate-spin text-emerald-400' : ''} />
        </button>
      </div>
    );
  }

  // 颜色根据剩余百分比微调：>= 50 绿色，20-49 黄色，< 20 红色
  const get5hColor = (pct: number) => {
    if (pct >= 50) return 'text-emerald-400';
    if (pct >= 20) return 'text-amber-400';
    return 'text-rose-400';
  };

  const get7dColor = (pct: number) => {
    if (pct >= 50) return 'text-emerald-400';
    if (pct >= 20) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div className="flex items-center space-x-2 text-xs font-mono select-none text-slate-300">
      {/* 5小时配额 */}
      <span className="whitespace-nowrap">
        <span className="text-slate-400">5h Quota: </span>
        <span className={`font-semibold ${get5hColor(quota.fiveHourPercent)}`}>
          {quota.fiveHourPercent}%
        </span>
        <span className="text-slate-400"> ({quota.fiveHourResetsIn} left)</span>
      </span>

      {/* 分隔符 */}
      <span className="text-slate-600 font-normal">|</span>

      {/* 7天配额 */}
      <span className="whitespace-nowrap">
        <span className="text-slate-400">7d Quota: </span>
        <span className={`font-semibold ${get7dColor(quota.sevenDayPercent)}`}>
          {quota.sevenDayPercent}%
        </span>
        <span className="text-slate-400"> ({quota.sevenDayResetsOn})</span>
      </span>

      {/* 单行末尾刷新按钮 */}
      <button
        onClick={handleRefreshClick}
        className="ml-1 p-1 text-slate-400 hover:text-emerald-400 transition-colors focus:outline-none"
        title="点击立即刷新大模型使用额度"
      >
        <RotateCw size={13} className={isRefreshing ? 'animate-spin text-emerald-400' : ''} />
      </button>
    </div>
  );
};
