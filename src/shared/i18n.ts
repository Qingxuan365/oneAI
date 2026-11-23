import { EN } from './en';
import { ZH_TW } from './zh-TW';

/** 简体中文是源语言，繁体中文和英文通过对照表翻译。 */
export type Language = 'zh-CN' | 'zh-TW' | 'en';

export const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'zh-CN', label: '简体中文' },
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'en', label: 'English' },
];

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some(({ id }) => value === id);
}

/** 中文优先看文字系统，其次按地区识别繁体。 */
export function detectLanguage(systemLocale: string | undefined): Language {
  const [language, ...subtags] = (systemLocale ?? '').toLowerCase().split(/[-_]/);
  if (language !== 'zh') return 'en';
  if (subtags[0] === 'hant') return 'zh-TW';
  if (subtags[0] === 'hans') return 'zh-CN';
  return ['tw', 'hk', 'mo'].includes(subtags[0]) ? 'zh-TW' : 'zh-CN';
}

/** 先翻译模板，再替换占位符，保留用户输入与路径原文。 */
export function translate(language: Language, key: string, params?: Record<string, string | number>): string {
  const table = language === 'zh-TW' ? ZH_TW : language === 'en' ? EN : null;
  const text = table && Object.hasOwn(table, key) ? table[key] : key;
  return params ? text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : text;
}
