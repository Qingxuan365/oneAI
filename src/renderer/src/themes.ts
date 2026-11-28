import { ThemeId } from './types';
import { t } from './i18n';

/** 每个主题的明暗基调，用于 color-scheme（滚动条、表单控件）。配色变量见 index.css。 */
export const THEME_MODE: Record<ThemeId, 'light' | 'dark'> = {
  light: 'light',
  dark: 'dark',
  bean: 'light',
  parchment: 'light',
  dusk: 'dark',
  nord: 'dark',
  lavender: 'light',
  mist: 'light',
  forest: 'dark',
  ink: 'dark',
  darcula: 'dark',
  material: 'dark',
  monokai: 'dark',
  mariana: 'dark',
  breakers: 'light',
  'solarized-dark': 'dark',
  'solarized-light': 'light',
  cobalt: 'dark',
  'idea-classic-light': 'light',
  'idea-light': 'light',
  'idea-dark': 'dark',
  'idea-contrast': 'dark',
  'kiro-dark': 'dark',
  'kiro-light': 'light',
  'one-dark': 'dark',
};

export type ThemeGroup = 'basic' | 'eyecare' | 'editor';

/** 设置页展示的主题；swatch 为 [底色, 强调色] 预览。basic 为顶部的浅 / 深色，eyecare 为护眼配色，editor 为编辑器配色。 */
export const THEME_OPTIONS: ReadonlyArray<{ id: ThemeId; label: string; group: ThemeGroup; swatch: [string, string] }> = [
  { id: 'light', get label() { return t('浅色'); }, group: 'basic', swatch: ['#ffffff', '#007aff'] },
  { id: 'dark', get label() { return t('深色'); }, group: 'basic', swatch: ['#161618', '#0a84ff'] },
  { id: 'bean', get label() { return t('豆沙绿'); }, group: 'eyecare', swatch: ['#cce8cf', '#0e5e8a'] },
  { id: 'parchment', get label() { return t('羊皮纸'); }, group: 'eyecare', swatch: ['#f4ecd8', '#1e64a0'] },
  { id: 'lavender', get label() { return t('薰衣草'); }, group: 'eyecare', swatch: ['#ece8f4', '#4252b2'] },
  { id: 'mist', get label() { return t('雾灰'); }, group: 'eyecare', swatch: ['#e4e9ee', '#146096'] },
  { id: 'dusk', get label() { return t('暖夜'); }, group: 'eyecare', swatch: ['#1e1b18', '#e0a85a'] },
  { id: 'nord', get label() { return t('北极灰蓝'); }, group: 'eyecare', swatch: ['#2e3440', '#88c0d0'] },
  { id: 'forest', get label() { return t('森夜'); }, group: 'eyecare', swatch: ['#181f1b', '#7ec896'] },
  { id: 'ink', get label() { return t('墨夜'); }, group: 'eyecare', swatch: ['#161a26', '#8aaaf0'] },
  { id: 'darcula', label: 'Darcula', group: 'editor', swatch: ['#2b2b2b', '#589df6'] },
  { id: 'material', label: 'Sublime Material', group: 'editor', swatch: ['#263238', '#80cbc4'] },
  { id: 'monokai', label: 'Monokai', group: 'editor', swatch: ['#272822', '#66d9ef'] },
  { id: 'mariana', label: 'Mariana', group: 'editor', swatch: ['#2e3842', '#f9ae58'] },
  { id: 'breakers', label: 'Breakers', group: 'editor', swatch: ['#fcfdfd', '#2473b1'] },
  { id: 'solarized-dark', label: 'Solarized Dark', group: 'editor', swatch: ['#042029', '#268bd2'] },
  { id: 'solarized-light', label: 'Solarized Light', group: 'editor', swatch: ['#fdf6e3', '#1e76b4'] },
  { id: 'cobalt', label: 'Cobalt', group: 'editor', swatch: ['#002240', '#ff9d00'] },
  { id: 'idea-classic-light', label: 'IntelliJ Light', group: 'editor', swatch: ['#ffffff', '#2470b3'] },
  { id: 'idea-light', label: 'IDEA Light', group: 'editor', swatch: ['#ffffff', '#3574f0'] },
  { id: 'idea-dark', label: 'IDEA Dark', group: 'editor', swatch: ['#1e1f22', '#3574f0'] },
  { id: 'idea-contrast', get label() { return t('IDEA 高对比度'); }, group: 'editor', swatch: ['#000000', '#1aebff'] },
  { id: 'kiro-dark', label: 'Kiro Dark', group: 'editor', swatch: ['#211d25', '#b080ff'] },
  { id: 'kiro-light', label: 'Kiro Light', group: 'editor', swatch: ['#f2f1f4', '#7138cc'] },
  { id: 'one-dark', label: 'One Dark', group: 'editor', swatch: ['#282c34', '#61afef'] },
];
