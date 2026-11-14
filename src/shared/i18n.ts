import { EN } from './en';

/** 界面语言：简体中文是源语言（代码里的中文文案即键），英文通过 en.ts 的对照表翻译 */
export type Language = 'zh-CN' | 'en';

export const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'zh-CN', label: '简体中文' },
  { id: 'en', label: 'English' },
];

export function isLanguage(value: unknown): value is Language {
  return value === 'zh-CN' || value === 'en';
}

/** 按系统语言预选：中文系统用简体中文，其余用英文 */
export function detectLanguage(systemLocale: string | undefined): Language {
  return (systemLocale || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

/** 取译文：简体中文原样返回；英文查表，缺失时回退为中文原文；{name} 占位符按 params 替换 */
export function translate(language: Language, key: string, params?: Record<string, string | number>): string {
  const text = language === 'en' ? (EN[key] ?? key) : key;
  return params ? text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : text;
}
