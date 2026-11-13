import React, { useState } from 'react';
import { FolderOpen, Play } from 'lucide-react';
import { CliGroup } from '../types';
import { BrandIcon } from './BrandIcon';
import { Modal } from './Modal';

interface NewTaskModalProps {
  group: CliGroup | null;
  workspacePath: string;
  isOpen: boolean;
  onClose: () => void;
  onCreate: (groupId: string, title: string, command: string, cwd: string) => Promise<{ success: boolean; error?: string }>;
}

/** 新任务的默认名称：取已有「Task N」的最大编号加一，避免关闭中间任务后出现重复编号 */
export function nextTaskTitle(group: CliGroup): string {
  const taskIndex = group.tasks.reduce((max, task) => Math.max(max, Number(/^Task (\d+)/.exec(task.title)?.[1] ?? 0)), group.tasks.length) + 1;
  return `Task ${taskIndex}`;
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  group,
  workspacePath,
  isOpen,
  onClose,
  onCreate,
}) => {
  const [title, setTitle] = useState('');
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 打开时初始化预设值
  React.useEffect(() => {
    if (group) {
      setTitle(nextTaskTitle(group));
      setCommand(group.defaultCommand);
      setCwd(workspacePath);
      setError('');
    }
  }, [group?.id, isOpen, workspacePath]);

  if (!isOpen || !group) return null;

  const handleChooseDirectory = async () => {
    try {
      const selected = await window.electronAPI?.selectWorkspaceDirectory?.(cwd || workspacePath);
      if (selected) {
        setCwd(selected);
        setError('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法选择工作目录');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      const result = await onCreate(group.id, title.trim(), command.trim(), cwd.trim());
      if (result.success) onClose();
      else setError(result.error || '终端启动失败，请检查工作目录和启动命令。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '终端启动失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const label = 'mb-1.5 block text-xs font-medium text-fg-muted';
  const hint = 'mt-1.5 text-xs text-fg-faint';

  return (
    <Modal
      isOpen
      onClose={onClose}
      closeDisabled={isSubmitting}
      titleId="new-task-modal-title"
      title={`新建 ${group.name} 任务`}
      icon={<BrandIcon icon={group.icon} size={18} />}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">取消</button>
          <button type="submit" form="new-task-form" disabled={isSubmitting || !title.trim()} className="btn-primary">
            <Play size={12} fill="currentColor" />
            <span>{isSubmitting ? '正在启动…' : '启动任务'}</span>
          </button>
        </>
      )}
    >
      <form id="new-task-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        <div>
          <label htmlFor="new-task-title" className={label}>任务名称</label>
          <input
            id="new-task-title"
            type="text"
            autoFocus
            value={title}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="例如：Auth Refactor"
            required
          />
        </div>

        <div>
          <label htmlFor="new-task-command" className={label}>启动命令</label>
          <input
            id="new-task-command"
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="input font-mono"
            placeholder="例如：powershell.exe"
          />
          <p className={hint}>留空则启动系统的交互式 PowerShell。</p>
        </div>

        <div>
          <label htmlFor="new-task-cwd" className={label}>工作目录</label>
          <div className="flex gap-2">
            <input
              id="new-task-cwd"
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="input min-w-0 flex-1 font-mono"
              placeholder={workspacePath}
            />
            <button
              type="button"
              onClick={handleChooseDirectory}
              disabled={isSubmitting}
              className="btn-secondary"
              title="为此任务选择工作目录"
            >
              <FolderOpen size={14} />
              <span>选择文件夹</span>
            </button>
          </div>
          <p className={hint}>只用于当前任务，不改变左下角的工作文件夹。</p>
        </div>
      </form>
    </Modal>
  );
};
