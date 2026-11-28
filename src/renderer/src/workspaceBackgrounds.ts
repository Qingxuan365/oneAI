import { T } from './i18n';
import type { WorkspaceBackgroundPreset } from './types';

export interface BuiltinWallpaper {
  id: Exclude<WorkspaceBackgroundPreset, 'none' | 'custom'>;
  name: string;
  subtitle: string;
  /** 纯矢量 SVG data URL，零外部依赖且在 4K/5K 屏保持清晰平滑 */
  dataUrl: string;
  /** 预览卡片兜底渐变 */
  previewGradient: string;
}

function encodeSvg(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

export const BUILTIN_MACOS_WALLPAPERS: ReadonlyArray<BuiltinWallpaper> = [
  {
    id: 'tahoe',
    name: T('Tahoe 湖光'),
    subtitle: 'macOS Tahoe',
    previewGradient: 'linear-gradient(135deg, #061830 0%, #0e4a7b 45%, #2ec4d6 80%, #a5f3fc 100%)',
    dataUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="t-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#051326"/>
            <stop offset="45%" stop-color="#0b3661"/>
            <stop offset="82%" stop-color="#147ea0"/>
            <stop offset="100%" stop-color="#38d0dc"/>
          </linearGradient>
          <radialGradient id="t-g1" cx="76%" cy="24%" r="58%">
            <stop offset="0%" stop-color="#99f6ff" stop-opacity="0.72"/>
            <stop offset="45%" stop-color="#22b8cf" stop-opacity="0.34"/>
            <stop offset="100%" stop-color="#062242" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="t-g2" cx="22%" cy="78%" r="60%">
            <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.52"/>
            <stop offset="55%" stop-color="#1d4ed8" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="#051326" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="t-w1" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.46"/>
            <stop offset="50%" stop-color="#67e8f9" stop-opacity="0.38"/>
            <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.24"/>
          </linearGradient>
          <linearGradient id="t-w2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0.36"/>
            <stop offset="55%" stop-color="#0284c7" stop-opacity="0.26"/>
            <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.48"/>
          </linearGradient>
        </defs>
        <rect width="1600" height="1000" fill="url(#t-bg)"/>
        <rect width="1600" height="1000" fill="url(#t-g1)"/>
        <rect width="1600" height="1000" fill="url(#t-g2)"/>
        <path d="M-80 650 C260 440 520 790 880 570 C1180 390 1380 510 1680 320 L1680 1040 L-80 1040 Z" fill="url(#t-w1)"/>
        <path d="M-80 780 C340 560 660 880 1040 650 C1300 490 1470 590 1680 460 L1680 1040 L-80 1040 Z" fill="url(#t-w2)"/>
        <path d="M-80 420 C300 220 720 490 1120 260 C1360 120 1520 190 1680 110 L1680 0 L-80 0 Z" fill="#030d1d" fill-opacity="0.34"/>
      </svg>
    `),
  },
  {
    id: 'sequoia',
    name: T('Sequoia 晨林'),
    subtitle: 'macOS Sequoia',
    previewGradient: 'linear-gradient(135deg, #0b1f1a 0%, #154c3c 48%, #3c8c67 78%, #eab668 100%)',
    dataUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="s-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#071814"/>
            <stop offset="48%" stop-color="#134235"/>
            <stop offset="80%" stop-color="#2b6e55"/>
            <stop offset="100%" stop-color="#8b6b3e"/>
          </linearGradient>
          <radialGradient id="s-sun" cx="78%" cy="22%" r="54%">
            <stop offset="0%" stop-color="#fde68a" stop-opacity="0.72"/>
            <stop offset="42%" stop-color="#f59e0b" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="#134235" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="s-mist" cx="24%" cy="74%" r="58%">
            <stop offset="0%" stop-color="#34d399" stop-opacity="0.36"/>
            <stop offset="60%" stop-color="#065f46" stop-opacity="0.22"/>
            <stop offset="100%" stop-color="#071814" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="s-r1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#10b981" stop-opacity="0.28"/>
            <stop offset="65%" stop-color="#064e3b" stop-opacity="0.54"/>
            <stop offset="100%" stop-color="#04120e" stop-opacity="0.72"/>
          </linearGradient>
        </defs>
        <rect width="1600" height="1000" fill="url(#s-bg)"/>
        <rect width="1600" height="1000" fill="url(#s-sun)"/>
        <rect width="1600" height="1000" fill="url(#s-mist)"/>
        <path d="M-60 580 C280 420 560 660 920 500 C1220 365 1440 440 1660 300 L1660 1040 L-60 1040 Z" fill="url(#s-r1)"/>
        <path d="M-60 760 C340 610 720 820 1120 640 C1380 520 1520 580 1660 520 L1660 1040 L-60 1040 Z" fill="#051410" fill-opacity="0.58"/>
      </svg>
    `),
  },
  {
    id: 'sonoma',
    name: T('Sonoma 暮霞'),
    subtitle: 'macOS Sonoma',
    previewGradient: 'linear-gradient(135deg, #0d2b3e 0%, #1d5d6e 45%, #d97757 78%, #f6c47c 100%)',
    dataUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sn-bg" x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stop-color="#0a2235"/>
            <stop offset="46%" stop-color="#1a5368"/>
            <stop offset="76%" stop-color="#8b4d63"/>
            <stop offset="100%" stop-color="#df8c5d"/>
          </linearGradient>
          <radialGradient id="sn-glow" cx="72%" cy="62%" r="54%">
            <stop offset="0%" stop-color="#fed7aa" stop-opacity="0.68"/>
            <stop offset="45%" stop-color="#fb7185" stop-opacity="0.32"/>
            <stop offset="100%" stop-color="#1a5368" stop-opacity="0"/>
          </radialGradient>
          <linearGradient id="sn-h1" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0%" stop-color="#134e4a" stop-opacity="0.72"/>
            <stop offset="50%" stop-color="#0f766e" stop-opacity="0.46"/>
            <stop offset="100%" stop-color="#1e293b" stop-opacity="0.74"/>
          </linearGradient>
        </defs>
        <rect width="1600" height="1000" fill="url(#sn-bg)"/>
        <rect width="1600" height="1000" fill="url(#sn-glow)"/>
        <path d="M-60 660 C260 510 580 720 960 590 C1260 490 1440 570 1660 490 L1660 1040 L-60 1040 Z" fill="url(#sn-h1)"/>
        <path d="M-60 800 C360 690 760 870 1160 720 C1400 630 1530 680 1660 630 L1660 1040 L-60 1040 Z" fill="#081a24" fill-opacity="0.62"/>
      </svg>
    `),
  },
  {
    id: 'ventura',
    name: T('Ventura 暖浪'),
    subtitle: 'macOS Ventura',
    previewGradient: 'linear-gradient(135deg, #0b1d45 0%, #1d4ed8 42%, #f97316 76%, #fde047 100%)',
    dataUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="v-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#091838"/>
            <stop offset="52%" stop-color="#173d8c"/>
            <stop offset="100%" stop-color="#0b2454"/>
          </linearGradient>
          <linearGradient id="v-a1" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stop-color="#fde047" stop-opacity="0.88"/>
            <stop offset="48%" stop-color="#fb923c" stop-opacity="0.78"/>
            <stop offset="100%" stop-color="#ea580c" stop-opacity="0.62"/>
          </linearGradient>
          <linearGradient id="v-a2" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stop-color="#dc2626" stop-opacity="0.58"/>
            <stop offset="55%" stop-color="#f97316" stop-opacity="0.72"/>
            <stop offset="100%" stop-color="#fef08a" stop-opacity="0.78"/>
          </linearGradient>
        </defs>
        <rect width="1600" height="1000" fill="url(#v-bg)"/>
        <path d="M220 960 C340 520 740 240 1240 190 C1420 172 1540 240 1660 330 L1660 1040 Z" fill="url(#v-a1)"/>
        <path d="M420 1020 C560 660 880 420 1320 380 C1470 366 1570 420 1660 480 L1660 1040 Z" fill="url(#v-a2)"/>
        <path d="M-80 280 C260 120 680 340 1020 150 C1280 5 1480 40 1660 -20 L1660 0 L-80 0 Z" fill="#38bdf8" fill-opacity="0.24"/>
      </svg>
    `),
  },
  {
    id: 'monterey',
    name: T('Monterey 星紫'),
    subtitle: 'macOS Monterey',
    previewGradient: 'linear-gradient(135deg, #120829 0%, #3b126b 45%, #9333ea 76%, #f472b6 100%)',
    dataUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="m-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#0f0724"/>
            <stop offset="50%" stop-color="#2e1065"/>
            <stop offset="100%" stop-color="#581c87"/>
          </linearGradient>
          <linearGradient id="m-w1" x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0%" stop-color="#6d28d9" stop-opacity="0.72"/>
            <stop offset="55%" stop-color="#c026d3" stop-opacity="0.62"/>
            <stop offset="100%" stop-color="#fb7185" stop-opacity="0.54"/>
          </linearGradient>
          <linearGradient id="m-w2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f472b6" stop-opacity="0.68"/>
            <stop offset="50%" stop-color="#9333ea" stop-opacity="0.56"/>
            <stop offset="100%" stop-color="#1e1b4b" stop-opacity="0.82"/>
          </linearGradient>
        </defs>
        <rect width="1600" height="1000" fill="url(#m-bg)"/>
        <path d="M-80 560 C240 310 620 680 1020 390 C1280 200 1480 280 1680 160 L1680 1040 L-80 1040 Z" fill="url(#m-w1)"/>
        <path d="M-80 760 C320 520 700 840 1120 560 C1360 400 1520 470 1680 390 L1680 1040 L-80 1040 Z" fill="url(#m-w2)"/>
      </svg>
    `),
  },
  {
    id: 'big-sur',
    name: T('Big Sur 海岸'),
    subtitle: 'macOS Big Sur',
    previewGradient: 'linear-gradient(135deg, #1d4ed8 0%, #7c3aed 38%, #ec4899 70%, #fbbf24 100%)',
    dataUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="b-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#1e3a8a"/>
            <stop offset="42%" stop-color="#6d28d9"/>
            <stop offset="76%" stop-color="#db2777"/>
            <stop offset="100%" stop-color="#f59e0b"/>
          </linearGradient>
          <linearGradient id="b-w1" x1="0" y1="0" x2="1" y2="0.8">
            <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.58"/>
            <stop offset="50%" stop-color="#f472b6" stop-opacity="0.54"/>
            <stop offset="100%" stop-color="#fde047" stop-opacity="0.62"/>
          </linearGradient>
          <linearGradient id="b-w2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fb7185" stop-opacity="0.65"/>
            <stop offset="55%" stop-color="#4f46e5" stop-opacity="0.52"/>
            <stop offset="100%" stop-color="#0f172a" stop-opacity="0.68"/>
          </linearGradient>
        </defs>
        <rect width="1600" height="1000" fill="url(#b-bg)"/>
        <path d="M-80 460 C280 240 620 560 980 340 C1280 160 1480 260 1680 120 L1680 1040 L-80 1040 Z" fill="url(#b-w1)"/>
        <path d="M-80 720 C340 480 720 820 1120 580 C1380 420 1520 500 1680 420 L1680 1040 L-80 1040 Z" fill="url(#b-w2)"/>
      </svg>
    `),
  },
];

export const WORKSPACE_BACKGROUND_PRESET_IDS: ReadonlyArray<WorkspaceBackgroundPreset> = [
  'none',
  ...BUILTIN_MACOS_WALLPAPERS.map((w) => w.id),
  'custom',
];

export function isWorkspaceBackgroundPreset(value: unknown): value is WorkspaceBackgroundPreset {
  return typeof value === 'string' && WORKSPACE_BACKGROUND_PRESET_IDS.includes(value as WorkspaceBackgroundPreset);
}

export function findBuiltinWallpaper(preset: WorkspaceBackgroundPreset): BuiltinWallpaper | null {
  return BUILTIN_MACOS_WALLPAPERS.find((item) => item.id === preset) ?? null;
}

export function clampBackgroundOpacity(value: unknown, fallback = 32): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(5, Math.min(85, Math.round(value)));
}

export function clampBackgroundBlur(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(24, Math.round(value)));
}
