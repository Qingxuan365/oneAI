import type { GreetingSlot, WorkScheduleGreetings } from './types';
import { T, t } from './i18n';

export const DEFAULT_WORK_START_TIME = '09:00';
export const DEFAULT_WORK_END_TIME = '18:00';

export const DEFAULT_GREETING_MESSAGES: WorkScheduleGreetings = {
  morning: '',
  noon: '',
  afternoon: '',
  evening: '',
};

export const GREETING_SLOT_ORDER: readonly GreetingSlot[] = ['morning', 'noon', 'afternoon', 'evening'];

const DEFAULT_GREETING_KEYS: Record<GreetingSlot, string> = {
  morning: T('早上好，元气满满'),
  noon: T('中午好，小憩一下'),
  afternoon: T('下午好，聚精会神'),
  evening: T('晚上好，注意休息'),
};

const SLOT_LABELS: Record<GreetingSlot, string> = {
  morning: T('早上'),
  noon: T('中午'),
  afternoon: T('下午'),
  evening: T('晚上'),
};

export function greetingSlotLabel(slot: GreetingSlot): string {
  return t(SLOT_LABELS[slot]);
}

export function defaultGreetingText(slot: GreetingSlot): string {
  return t(DEFAULT_GREETING_KEYS[slot]);
}

/** 校验并规范化 HH:MM 时间字符串，非法时回退默认值 */
export function normalizeTimeString(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseMinutesOfDay(time: string, fallback: number): number {
  const normalized = normalizeTimeString(time, '');
  if (!normalized) return fallback;
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutesOfDay(totalMinutes: number): string {
  const clamped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function sanitizeGreetingMessages(raw: unknown): WorkScheduleGreetings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').slice(0, 60) : '');
  return {
    morning: clean(src.morning),
    noon: clean(src.noon),
    afternoon: clean(src.afternoon),
    evening: clean(src.evening),
  };
}

export interface GreetingSlotRanges {
  morning: string;
  noon: string;
  afternoon: string;
  evening: string;
}

interface ComputedSchedule {
  overnight: boolean;
  morningStart: number;
  noonStart: number;
  noonEnd: number;
  workEnd: number;
  morningSpanEnd: number;
  noonSpanEnd: number;
  afternoonSpanEnd: number;
}

function computeSchedule(workStartTime?: string, workEndTime?: string): ComputedSchedule {
  const start = parseMinutesOfDay(workStartTime || DEFAULT_WORK_START_TIME, 9 * 60);
  const end = parseMinutesOfDay(workEndTime || DEFAULT_WORK_END_TIME, 18 * 60);
  if (start === end) {
    return {
      overnight: false,
      morningStart: 5 * 60,
      noonStart: 12 * 60,
      noonEnd: 13 * 60 + 30,
      workEnd: 18 * 60,
      morningSpanEnd: 12 * 60,
      noonSpanEnd: 13 * 60 + 30,
      afternoonSpanEnd: 18 * 60,
    };
  }
  if (start < end) {
    const morningStart = Math.min(5 * 60, start);
    const noonStart = Math.max(morningStart, Math.min(12 * 60, end));
    const noonEnd = Math.max(noonStart, Math.min(13 * 60 + 30, end));
    return {
      overnight: false,
      morningStart,
      noonStart,
      noonEnd,
      workEnd: end,
      morningSpanEnd: noonStart,
      noonSpanEnd: noonEnd,
      afternoonSpanEnd: end,
    };
  }
  // 跨夜班（如 22:00 - 06:00）：工作区间三段分别为早上 / 中午 / 下午，非工作区间为晚上休息
  const workLen = 1440 - start + end;
  const noonStart = (start + Math.round(workLen * 0.4)) % 1440;
  const noonEnd = (start + Math.round(workLen * 0.55)) % 1440;
  return {
    overnight: true,
    morningStart: start,
    noonStart,
    noonEnd,
    workEnd: end,
    morningSpanEnd: noonStart,
    noonSpanEnd: noonEnd,
    afternoonSpanEnd: end,
  };
}

/** 返回四个时段对应的时间区间文本（供设置页直观预览） */
export function describeGreetingSlotRanges(workStartTime?: string, workEndTime?: string): GreetingSlotRanges {
  const s = computeSchedule(workStartTime, workEndTime);
  const fmt = (a: number, b: number) => (a === b ? '--' : `${formatMinutesOfDay(a)}–${formatMinutesOfDay(b)}`);
  return {
    morning: fmt(s.morningStart, s.morningSpanEnd),
    noon: fmt(s.noonStart, s.noonSpanEnd),
    afternoon: fmt(s.noonEnd, s.afternoonSpanEnd),
    evening: fmt(s.workEnd, s.morningStart),
  };
}

/** 根据当前时间（含时钟偏移）与工作时间段判断问候时段 */
export function resolveGreetingSlot(
  offsetHours = 0,
  workStartTime?: string,
  workEndTime?: string,
  nowMs = Date.now(),
): { slot: GreetingSlot; icon: 'day' | 'evening' | 'midnight' } {
  const adjusted = new Date(nowMs + (Number.isFinite(offsetHours) ? offsetHours : 0) * 3_600_000);
  const mins = adjusted.getHours() * 60 + adjusted.getMinutes();
  const s = computeSchedule(workStartTime, workEndTime);
  let slot: GreetingSlot;
  if (!s.overnight) {
    if (mins >= s.workEnd || mins < s.morningStart) {
      slot = 'evening';
    } else if (mins < s.noonStart) {
      slot = 'morning';
    } else if (mins < s.noonEnd) {
      slot = 'noon';
    } else {
      slot = 'afternoon';
    }
  } else {
    const inWork = mins >= s.morningStart || mins < s.workEnd;
    if (!inWork) {
      slot = 'evening';
    } else {
      const elapsed = mins >= s.morningStart ? mins - s.morningStart : 1440 - s.morningStart + mins;
      const workLen = 1440 - s.morningStart + s.workEnd;
      if (elapsed < Math.round(workLen * 0.4)) slot = 'morning';
      else if (elapsed < Math.round(workLen * 0.55)) slot = 'noon';
      else slot = 'afternoon';
    }
  }
  const icon: 'day' | 'evening' | 'midnight' = slot === 'evening'
    ? (adjusted.getHours() < 5 ? 'midnight' : 'evening')
    : 'day';
  return { slot, icon };
}

/** 解析最终显示在左上角的问候语（优先用户自定义，留空回退当前语言默认值） */
export function resolveWorkGreeting(options: {
  offsetHours?: number;
  workStartTime?: string;
  workEndTime?: string;
  greetingMessages?: Partial<WorkScheduleGreetings>;
  nowMs?: number;
}): { slot: GreetingSlot; icon: 'day' | 'evening' | 'midnight'; text: string } {
  const { slot, icon } = resolveGreetingSlot(
    options.offsetHours ?? 0,
    options.workStartTime,
    options.workEndTime,
    options.nowMs,
  );
  const custom = options.greetingMessages?.[slot]?.trim();
  return {
    slot,
    icon,
    text: custom || defaultGreetingText(slot),
  };
}
