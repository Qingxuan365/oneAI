import { TaskStatus } from './types';
import { t } from './i18n';

// 任务状态的统一文案与圆点样式（侧栏任务行使用）。
// 启动中（脉冲）与运行中（转圈）使用动画，并遵循系统「减少动态效果」设置；减少动态效果时运行中显示为空心圈。
// 空闲（还没干过活）是灰色空心圆，等待输入（跑完一轮、输出已静默）是绿色实心圆。
export const TASK_STATUS_META: Record<TaskStatus, { label: string; hint: string; dot: string }> = {
  starting: { get label() { return t('启动中'); }, get hint() { return t('正在启动终端'); }, dot: 'bg-accent motion-safe:animate-pulse' },
  running: { get label() { return t('运行中'); }, get hint() { return t('终端运行中'); }, dot: 'border border-success border-t-transparent motion-safe:animate-spin' },
  idle: { get label() { return t('空闲'); }, get hint() { return t('终端空闲'); }, dot: 'border border-fg-faint' },
  waiting: { get label() { return t('等待输入'); }, get hint() { return t('已完成一轮输出，等待你的输入'); }, dot: 'bg-success' },
  stopped: { get label() { return t('已停止'); }, get hint() { return t('终端已停止'); }, dot: 'bg-fg-faint' },
  error: { get label() { return t('启动失败'); }, get hint() { return t('终端启动失败'); }, dot: 'bg-danger' },
};

// 终端输出是否包含可见字符：光标显隐、标题更新、颜色等纯控制序列和空白不算任务在工作，
// 否则 Claude Code 等 CLI 空闲时的后台刷新会让状态一直停在「运行中」。
const ANSI_SEQUENCE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-Z\\-_]|\x1b[ -/]*[0-~]/g;
export const hasVisibleOutput = (data: string) => data.replace(ANSI_SEQUENCE, '').replace(/[\x00-\x20\x7f]/g, '').length > 0;

// 进程仍存活的状态（启动中、运行中、空闲、等待输入）
export const isTaskAlive = (status: TaskStatus) => status === 'starting' || status === 'running' || status === 'idle' || status === 'waiting';
