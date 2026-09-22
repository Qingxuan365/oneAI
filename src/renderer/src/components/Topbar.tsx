import React from 'react';
import { Terminal, ChevronRight } from 'lucide-react';
import { InlineQuotaText } from './InlineQuotaText';
import { QuotaData, TaskSession, CliGroup } from '../types';
import { BrandIcon } from './BrandIcon';

interface TopbarProps {
  currentGroup: CliGroup | null;
  activeTask: TaskSession | null;
  quota: QuotaData | null;
  onRefreshQuota: () => Promise<void>;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentGroup,
  activeTask,
  quota,
  onRefreshQuota,
}) => {
  return (
    <header className="h-10 bg-[#12151d] border-b border-[#232936] flex items-center justify-between px-4 select-none shrink-0 z-10">
      {/* 左侧：会话面包屑导航 */}
      <div className="flex items-center space-x-2 text-xs text-slate-300">
        {currentGroup ? (
          <div className="flex items-center space-x-1.5">
            <BrandIcon icon={currentGroup.icon} size={15} />
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

      {/* 右侧：单行横排纯文字大模型配额（无弹窗、无浮窗） */}
      <div className="flex items-center">
        <InlineQuotaText quota={quota} onRefresh={onRefreshQuota} />
      </div>
    </header>
  );
};
