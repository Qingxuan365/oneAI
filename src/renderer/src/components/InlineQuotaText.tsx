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

  // 离线/未配置状态
  if (quota.status === 'offline') {
    return (
      <div className="flex items-center space-x-2 text-xs font-mono select-none text-slate-500">
        <span className="text-slate-400 bg-[#1a1f2c] px-1.5 py-0.5 rounded border border-[#2a3346] text-[11px]">
          {quota.cliName}
        </span>
        <span>{quota.message || '未检测到本地 CLI 或配置'}</span>
        <button
          onClick={handleRefreshClick}
          className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
          title={`刷新 ${quota.cliName} 状态`}
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
      {/* CLI 模型标识 */}
      {quota.model && (
        <span className="text-slate-300 font-semibold bg-[#1a1f2c] px-1.5 py-0.5 rounded border border-[#2a3346] text-[11px]">
          {quota.model}
        </span>
      )}

      {/* 5小时配额 */}
      <span className="whitespace-nowrap">
        <span className="text-slate-400">5h: </span>
        <span className={`font-semibold ${get5hColor(quota.fiveHourPercent)}`}>
          {quota.fiveHourPercent}%
        </span>
        {quota.fiveHourResetsIn !== '--' && (
          <span className="text-slate-400 text-[11px]"> ({quota.fiveHourResetsIn})</span>
        )}
      </span>

      {/* 分隔符 */}
      <span className="text-slate-600 font-normal">|</span>

      {/* 7天配额 */}
      <span className="whitespace-nowrap">
        <span className="text-slate-400">7d: </span>
        <span className={`font-semibold ${get7dColor(quota.sevenDayPercent)}`}>
          {quota.sevenDayPercent}%
        </span>
        {quota.sevenDayResetsOn !== '--' && (
          <span className="text-slate-400 text-[11px]"> ({quota.sevenDayResetsOn})</span>
        )}
      </span>

      {/* 额外辅助消息（如 Ctx 上下文用量） */}
      {quota.message && (
        <>
          <span className="text-slate-600 font-normal">|</span>
          <span className="text-slate-400 text-[11px]">{quota.message}</span>
        </>
      )}

      {/* 单行末尾刷新按钮 */}
      <button
        onClick={handleRefreshClick}
        className="ml-1 p-1 text-slate-400 hover:text-emerald-400 transition-colors focus:outline-none"
        title={`点击立即刷新 ${quota.cliName} 真实配额`}
      >
        <RotateCw size={13} className={isRefreshing ? 'animate-spin text-emerald-400' : ''} />
      </button>
    </div>
  );
};
