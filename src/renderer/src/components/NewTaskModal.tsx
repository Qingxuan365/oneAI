import React, { useState } from 'react';
import { X, Play } from 'lucide-react';
import { CliGroup } from '../types';
import { BrandIcon } from './BrandIcon';

interface NewTaskModalProps {
  group: CliGroup | null;
  isOpen: boolean;
  onClose: () => void;
  onCreate: (groupId: string, title: string, command: string, cwd: string) => void;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  group,
  isOpen,
  onClose,
  onCreate,
}) => {
  const [title, setTitle] = useState('');
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState('');

  // 打开时初始化预设值
  React.useEffect(() => {
    if (group) {
      const taskIndex = group.tasks.length + 1;
      setTitle(`Task ${taskIndex}: ${group.name} Session`);
      setCommand(group.defaultCommand);
      setCwd('d:\\GitHub\\OneAI');
    }
  }, [group, isOpen]);

  if (!isOpen || !group) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate(group.id, title.trim(), command.trim(), cwd.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#161a24] border border-[#2a3040] rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#232936] bg-[#12151d]">
          <div className="flex items-center space-x-2">
            <BrandIcon icon={group.icon} size={18} />
            <h3 className="text-sm font-semibold text-slate-100">
              新建 {group.name} 并发子任务
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#1f2433] rounded"
          >
            <X size={15} />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-400 mb-1 font-medium">任务名称 / Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#0d1017] border border-[#272e3d] rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              placeholder="例如: Task 1: Auth Refactor"
              required
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">启动命令 / Command</label>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="w-full bg-[#0d1017] border border-[#272e3d] rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              placeholder="例如: powershell.exe"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              留空默认启动系统的交互式 PowerShell
            </p>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">工作目录 / Working Directory</label>
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="w-full bg-[#0d1017] border border-[#272e3d] rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              placeholder="d:\GitHub\OneAI"
            />
          </div>

          {/* 底部动作 */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#232936]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-[#1f2433] hover:bg-[#282f42] text-slate-300 font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-colors"
            >
              <Play size={12} fill="currentColor" />
              <span>启动任务终端</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
