import { isLanguage, Language, translate } from '../shared/i18n';

let current: Language = 'zh-CN';

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: unknown): void {
  if (isLanguage(language)) current = language;
}

/** 主进程里会显示到界面的文案（错误、额度提示等）的翻译；用法同渲染进程的 t() */
export function t(key: string, params?: Record<string, string | number>): string {
  return translate(current, key, params);
}
