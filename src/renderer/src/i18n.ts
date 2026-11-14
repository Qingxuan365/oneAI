import { detectLanguage, isLanguage, Language, translate } from '../../shared/i18n';

export { LANGUAGES, isLanguage } from '../../shared/i18n';
export type { Language } from '../../shared/i18n';

let current: Language = 'zh-CN';
let announced: Language | null = null;

export function getLanguage(): Language {
  return current;
}

/** 切换界面语言：更新翻译函数使用的语言、文档的 lang 属性，并通知主进程（主进程里会显示到界面的文案也跟随） */
export function setLanguage(language: Language): void {
  current = language;
  if (announced === language) return;
  announced = language;
  try { document.documentElement.lang = language; } catch {}
  try { void window.electronAPI?.setLanguage?.(language); } catch {}
}

export function systemLanguage(): Language {
  return detectLanguage(typeof navigator !== 'undefined' ? navigator.language : undefined);
}

/** 界面文案翻译：键为中文原文，如 t('新建任务')、t('{n} 个任务', { n: 3 }) */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(current, key, params);
}

/** 日期时间格式使用的 locale */
export function dateLocale(): string {
  return current === 'en' ? 'en-US' : 'zh-CN';
}

/** 标记「稍后翻译」的文案：模块级常量里先用 T() 登记中文原文，渲染时再用 t() 取译文；scripts/check-i18n.mjs 会一并校验 */
export const T = (key: string): string => key;
