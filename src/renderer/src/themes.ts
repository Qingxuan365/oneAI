import { ThemeId } from './types';

/** 每个主题的明暗基调，用于 color-scheme（滚动条、表单控件）。配色变量见 index.css。 */
export const THEME_MODE: Record<ThemeId, 'light' | 'dark'> = {
  light: 'light',
  dark: 'dark',
  bean: 'light',
  parchment: 'light',
  dusk: 'dark',
  nord: 'dark',
};

/** 设置页展示的主题；swatch 为 [底色, 强调色] 预览。 */
export const THEME_OPTIONS: ReadonlyArray<{ id: ThemeId; label: string; swatch: [string, string] }> = [
  { id: 'light', label: '浅色', swatch: ['#ffffff', '#0969da'] },
  { id: 'dark', label: '深色', swatch: ['#0d1117', '#38bdf8'] },
  { id: 'bean', label: '豆沙绿', swatch: ['#cce8cf', '#0e5e8a'] },
  { id: 'parchment', label: '羊皮纸', swatch: ['#f4ecd8', '#1e64a0'] },
  { id: 'dusk', label: '暖夜', swatch: ['#1e1b18', '#e0a85a'] },
  { id: 'nord', label: '北极灰蓝', swatch: ['#2e3440', '#88c0d0'] },
];
