import { TaskStatus } from './types';
import { t } from './i18n';

// 任务状态的统一文案与配色，侧栏指示灯和顶栏徽标共用，避免两处表述不一致。
// 只有启动过渡状态使用动画，并遵循系统「减少动态效果」设置。
export const TASK_STATUS_META: Record<TaskStatus, { label: string; hint: string; dot: string; badge: string }> = {
  starting: { get label() { return t('启动中'); }, get hint() { return t('正在启动终端'); }, dot: 'bg-accent motion-safe:animate-pulse', badge: 'text-accent bg-accent/10 border-accent/30' },
  running: { get label() { return t('运行中'); }, get hint() { return t('终端运行中'); }, dot: 'bg-success', badge: 'text-success bg-success/10 border-success/30' },
  idle: { get label() { return t('空闲'); }, get hint() { return t('终端空闲'); }, dot: 'bg-accent', badge: 'text-accent bg-accent/10 border-accent/30' },
  waiting: { get label() { return t('等待输入'); }, get hint() { return t('等待输入'); }, dot: 'bg-warning', badge: 'text-warning bg-warning/10 border-warning/30' },
  stopped: { get label() { return t('已停止'); }, get hint() { return t('终端已停止'); }, dot: 'bg-fg-faint', badge: 'text-fg-faint bg-fg-faint/10 border-fg-faint/30' },
  error: { get label() { return t('启动失败'); }, get hint() { return t('终端启动失败'); }, dot: 'bg-danger', badge: 'text-danger bg-danger/10 border-danger/30' },
};

// 进程仍存活的状态（启动中、运行中、空闲、等待输入）
export const isTaskAlive = (status: TaskStatus) => status === 'starting' || status === 'running' || status === 'idle' || status === 'waiting';
