import { TaskSession, TaskStatus } from './types';
import type { SessionCreateResult } from '../../shared/types';
import { t } from './i18n';

// 任务状态的统一文案与圆点样式（侧栏任务行使用）。
// 只有启动中用脉冲动画（持续数秒，遵循系统「减少动态效果」）；运行中是绿色空心圆，不做持续动画，
// 否则每个运行中的任务都会让窗口以 60 fps 持续重绘（6 个任务时约占单核 16%）。
// 空闲（还没干过活）是灰色空心圆，等待输入（跑完一轮、输出已静默）是绿色实心圆。
export const TASK_STATUS_META: Record<TaskStatus, { label: string; hint: string; dot: string }> = {
  starting: { get label() { return t('启动中'); }, get hint() { return t('正在启动终端'); }, dot: 'bg-accent motion-safe:animate-pulse' },
  running: { get label() { return t('运行中'); }, get hint() { return t('终端运行中'); }, dot: 'border border-success' },
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

export function startOutcome(result?: SessionCreateResult, currentStatus?: TaskStatus): Pick<TaskSession, 'status' | 'errorMessage'> {
  if (!result?.success) return { status: 'error', errorMessage: result?.error || t('终端启动失败') };
  const status = result.reused && (currentStatus === 'running' || currentStatus === 'waiting') ? currentStatus : 'idle';
  return { status, errorMessage: undefined };
}

// 键盘输入或终端尺寸变化后这段时间内的输出视为回显 / 重绘（你打的字、CLI 整屏重画），不算任务在干活，
// 避免在任务里打几个字或拖动窗口就变成「运行中」、4 秒后又转「等待输入」并响提示音。
// 提交后 CLI 的回复会持续好几秒，超过这段时间的输出仍正常计入运行中。
export const USER_ECHO_MS = 1000;
const lastUserActivity = new Map<string, number>();
export const noteUserActivity = (id: string) => { lastUserActivity.set(id, Date.now()); };
export const getLastUserActivityAt = (id: string) => lastUserActivity.get(id) ?? -Infinity;
export const isUserEcho = (id: string, now = Date.now()) => now - (lastUserActivity.get(id) ?? -Infinity) < USER_ECHO_MS;
export const forgetUserActivity = (id: string) => { lastUserActivity.delete(id); };
