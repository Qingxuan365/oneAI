import React, { useEffect, useState } from 'react';
import { InlineQuotaText } from './InlineQuotaText';
import { SystemStatsText } from './SystemStatsText';
import { QuotaData, TaskStatus } from '../types';
import { TASK_STATUS_META } from '../taskStatus';
import { getLanguage, t, T } from '../i18n';

const STATUS_LABELS: Record<TaskStatus, string> = {
  starting: T('启动中'),
  running: T('运行中'),
  idle: T('任务空闲'),
  waiting: T('等待'),
  stopped: T('已停止'),
  error: T('失败'),
};

interface StatusBarProps {
  quota: QuotaData | null;
  /** 有活动终端且不在 Dashboard 时才显示额度与会话用量 */
  showQuota: boolean;
  /** 当前任务的运行状态，显示在上行最左侧；没有活动任务时不传 */
  taskStatus?: TaskStatus;
  /** 当前任务名，显示在运行状态前面；没有活动任务时不传 */
  taskTitle?: string;
  clockOffsetHours?: number;
  /** 是否在时钟里显示年月日（含农历）与星期，默认显示；状态栏过窄时自动收起，设置 → 时间 里可关闭 */
  dateVisible?: boolean;
  onRefreshQuota: () => Promise<void>;
  /** 传入当前语言，使 React.memo 在切换语言时同步重绘 */
  language?: string;
}

// 数字日期转中文数字（1~30）
function toChineseDay(n: number): string {
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (n <= 10) return digits[n];
  if (n < 20) return `十${digits[n - 10]}`;
  if (n === 20) return '二十';
  if (n < 30) return `二十${digits[n - 20]}`;
  return '三十';
}

let lunarFormatter: Intl.DateTimeFormat | undefined;
let lunarLocale = '';
let cachedLunarKey = '';
let cachedLunarValue = '';

function getLunarStr(now: Date, locale: string): string {
  const dayKey = `${locale}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (dayKey === cachedLunarKey) return cachedLunarValue;
  try {
    if (!lunarFormatter || lunarLocale !== locale) {
      lunarFormatter = new Intl.DateTimeFormat(`${locale}-u-ca-chinese`, {
        month: 'long',
        day: 'numeric',
      });
      lunarLocale = locale;
    }
    const parts = lunarFormatter.formatToParts(now);
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const dayNum = parseInt(parts.find((p) => p.type === 'day')?.value ?? '0', 10);
    cachedLunarKey = dayKey;
    cachedLunarValue = `${month}${toChineseDay(dayNum)}日`;
    return cachedLunarValue;
  } catch {
    cachedLunarKey = dayKey;
    cachedLunarValue = '';
    return '';
  }
}

interface ClockParts { date: string; time: string; weekday: string }

// offsetHours：时间相对系统时间增加的小时数，在设置的「时间」栏目中配置
function getClockParts(offsetHours: number): ClockParts {
  const now = new Date(Date.now() + (Number.isFinite(offsetHours) ? offsetHours : 0) * 60 * 60 * 1000);
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const weekdays = [t('星期日'), t('星期一'), t('星期二'), t('星期三'), t('星期四'), t('星期五'), t('星期六')];
  const Y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const D = String(now.getDate()).padStart(2, '0');
  const language = getLanguage();
  const lunar = language === 'en' ? '' : getLunarStr(now, language);
  return {
    date: `${Y}-${M}-${D}${lunar ? `（${lunar}）` : ''}`,
    time: `${h}:${m}:${s}`,
    weekday: t('（{weekday}）', { weekday: weekdays[now.getDay()] }),
  };
}

/** 独立时钟节点：每秒滴答只更新自身文本，不触发整个状态栏重渲染；窗口不可见时暂停滴答。
 * 日期与星期放在 .statusbar-clock-date 里，状态栏变窄时由容器查询收起，只留 HH:MM:SS。 */
const StatusClock: React.FC<{ showDate: boolean; clockOffsetHours: number; language?: string }> = React.memo(({ showDate, clockOffsetHours }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.hidden) return;
      setTick((v) => (v + 1) % 1_000_000);
    };
    const timer = setInterval(refreshIfVisible, 1000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, []);

  const { date, time, weekday } = getClockParts(clockOffsetHours);
  return (
    <div
      id="oneai-statusbar-clock"
      data-clock-mode={showDate ? 'full' : 'time'}
      className="pointer-events-none shrink-0 whitespace-nowrap font-mono text-ui tabular-nums tracking-wide text-fg-subtle"
    >
      {showDate && <span className="statusbar-clock-date">{date} </span>}
      <span>{time}</span>
      {showDate && <span className="statusbar-clock-date"> {weekday}</span>}
    </div>
  );
});

StatusClock.displayName = 'StatusClock';

/**
 * 终端下方两行状态栏，所有 CLI 展示方式一致：
 * 上行 模型、5h / 7d 进度条与时钟；下行 Tokens / Cache / Cost、Ctx 进度条与整机 CPU / GPU / 内存 / 网速。
 * 次要信息按状态栏宽度由 index.css 的 statusbar 容器查询逐级收起。
 */
export const StatusBar: React.FC<StatusBarProps> = React.memo(({
  quota,
  showQuota,
  taskStatus,
  taskTitle,
  clockOffsetHours = 0,
  dateVisible = true,
  onRefreshQuota,
  language,
}) => {
  return (
    <footer id="oneai-statusbar" aria-label={t('状态栏')} className="statusbar flex h-16 shrink-0 select-none flex-col border-t border-line bg-panel px-[18px] py-0.5">
      <div className="statusbar-limits-row flex min-h-0 flex-1 items-center gap-3 overflow-hidden">
        {taskStatus && taskTitle && (
          <span id="oneai-statusbar-task" title={taskTitle} className="max-w-[9rem] shrink truncate whitespace-nowrap font-mono text-ui text-fg">
            {taskTitle}
          </span>
        )}
        {taskStatus && (
          <span id="oneai-statusbar-status" data-task-status={taskStatus} title={TASK_STATUS_META[taskStatus].hint} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-mono text-ui text-fg-muted">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TASK_STATUS_META[taskStatus].dot}`} aria-hidden="true" />
            <span lang="en" className="text-fg">{t(STATUS_LABELS[taskStatus], undefined, 'en')}</span>
          </span>
        )}
        <div id="oneai-statusbar-quota" className="min-w-0 flex-1 overflow-hidden">
          {showQuota && <InlineQuotaText row="limits" quota={quota} onRefresh={onRefreshQuota} language={language} />}
        </div>
        <StatusClock showDate={dateVisible} clockOffsetHours={clockOffsetHours} language={language} />
      </div>
      <div className="flex min-h-0 flex-1 items-center gap-3 overflow-hidden">
        <div id="oneai-statusbar-usage" className="min-w-0 flex-1 overflow-hidden">
          {showQuota && <InlineQuotaText row="usage" quota={quota} onRefresh={onRefreshQuota} language={language} />}
        </div>
        <SystemStatsText language={language} />
      </div>
    </footer>
  );
});

StatusBar.displayName = 'StatusBar';
