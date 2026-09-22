import React from 'react';
import { ChevronDown, ChevronRight, Plus, X, FolderGit2 } from 'lucide-react';
import { CliGroup, TaskSession } from '../types';
import { BrandIcon } from './BrandIcon';

interface SidebarProps {
  groups: CliGroup[];
  activeTaskId: string | null;
  onSelectTask: (taskId: string, groupId: string) => void;
  onToggleGroup: (groupId: string) => void;
  onNewTask: (groupId: string) => void;
  onCloseTask: (taskId: string, e: React.MouseEvent) => void;
  onAddGroup: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  groups,
  activeTaskId,
  onSelectTask,
  onToggleGroup,
  onNewTask,
  onCloseTask,
  onAddGroup,
}) => {
  return (
    <aside className="w-64 bg-[#141720] border-r border-[#232936] flex flex-col h-full select-none shrink-0 text-slate-300">
      {/* 侧边栏顶部：应用品牌与标题 */}
      <div className="h-10 px-3.5 border-b border-[#232936] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xs">
            1
          </div>
          <span className="font-semibold text-xs text-slate-200 tracking-wider uppercase">
            OneDesktop
          </span>
        </div>
        <button
          onClick={onAddGroup}
          className="p-1 text-slate-400 hover:text-slate-100 hover:bg-[#1e2330] rounded transition-colors"
          title="添加新 CLI 分组"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* CLI 分组与多子任务树状列表 */}
      <div className="flex-1 overflow-y-auto py-2 px-1.5 space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
        <div className="px-2 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          CLI GROUPS
        </div>

        {groups.map((group) => {
          const hasActiveChild = group.tasks.some((t) => t.id === activeTaskId);

          return (
            <div key={group.id} className="space-y-0.5">
              {/* 一级 CLI 分组行 */}
              <div
                onClick={() => onToggleGroup(group.id)}
                className={`group flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                  hasActiveChild
                    ? 'text-slate-100 bg-[#1b202c]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d27]'
                }`}
              >
                <div className="flex items-center space-x-2 min-w-0">
                  {/* 折叠/展开箭头 */}
                  <span className="text-slate-500 hover:text-slate-300">
                    {group.isExpanded ? (
                      <ChevronDown size={13} />
                    ) : (
                      <ChevronRight size={13} />
                    )}
                  </span>

                  {/* 大模型官方专属 Logo（替换文件夹图标） */}
                  <BrandIcon icon={group.icon} size={15} />

                  {/* CLI 名称与任务计数 */}
                  <span className="font-medium truncate">{group.name}</span>
                  <span className="text-[10px] text-slate-500">({group.tasks.length})</span>
                </div>

                {/* 快速拉起子任务 + 按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewTask(group.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-emerald-400 hover:bg-[#232938] rounded transition-all"
                  title={`在 ${group.name} 下启动新任务`}
                >
                  <Plus size={12} />
                </button>
              </div>

              {/* 二级子任务列表（缩进展开） */}
              {group.isExpanded && (
                <div className="pl-6 pr-1 space-y-0.5 border-l border-slate-800/80 ml-3.5 my-0.5">
                  {group.tasks.map((task) => {
                    const isActive = task.id === activeTaskId;

                    return (
                      <div
                        key={task.id}
                        onClick={() => onSelectTask(task.id, group.id)}
                        className={`group/task flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition-all ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-medium'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-[#181d27]'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          {/* 状态圆点 */}
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              task.status === 'running'
                                ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                                : task.status === 'waiting'
                                ? 'bg-amber-400 animate-pulse'
                                : 'bg-slate-600'
                            }`}
                          />
                          <span className="truncate font-mono text-[11px]">{task.title}</span>
                        </div>

                        {/* 关闭任务按钮 */}
                        <button
                          onClick={(e) => onCloseTask(task.id, e)}
                          className="opacity-0 group-hover/task:opacity-100 p-0.5 text-slate-500 hover:text-rose-400 rounded transition-opacity"
                          title="关闭此任务终端"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    );
                  })}

                  {/* 派生新任务空状态入口 */}
                  <button
                    onClick={() => onNewTask(group.id)}
                    className="w-full flex items-center space-x-1.5 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300 hover:bg-[#181d27] rounded transition-colors"
                  >
                    <Plus size={11} />
                    <span>新建任务</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 侧边栏底部：当前项目工作目录 */}
      <div className="p-2.5 border-t border-[#232936] text-[11px] text-slate-500 flex items-center space-x-2 bg-[#10131b]">
        <FolderGit2 size={13} className="text-slate-400 shrink-0" />
        <span className="truncate font-mono" title="当前工作区目录">
          D:\GitHub\OneDesktop
        </span>
      </div>
    </aside>
  );
};
