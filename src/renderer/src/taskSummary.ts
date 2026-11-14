import { t } from './i18n';

/** 任务行第二行（会话里最近一条用户消息）目前只支持有可读会话文件的 CLI；其他 CLI 保持单行，不显示编造的信息 */
export const SUMMARY_CLIS: ReadonlySet<string> = new Set(['claude', 'codex', 'kimi']);

/** offsetHours 与顶栏时钟共用「设置 → 时间」里的增加小时数，保证「新会话 · 时间」与顶栏时钟对得上 */
export function formatClock(timestamp: number, offsetHours = 0): string {
  const date = new Date(timestamp + (Number.isFinite(offsetHours) ? offsetHours : 0) * 3_600_000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 月-日 */
export function formatAgo(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return t('刚刚');
  if (minutes < 60) return t('{n} 分钟前', { n: minutes });
  if (minutes < 24 * 60) return t('{n} 小时前', { n: Math.floor(minutes / 60) });
  if (minutes < 30 * 24 * 60) return t('{n} 天前', { n: Math.floor(minutes / (24 * 60)) });
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`;
}
