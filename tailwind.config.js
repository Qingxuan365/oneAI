/** @type {import('tailwindcss').Config} */
// 语义颜色取自 src/renderer/src/index.css 中的 CSS 变量（RGB 通道），深浅主题只改变量值。
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),       // 终端区与输入框底色
        surface: token('surface'),     // 侧栏主体、弹窗页眉页脚
        panel: token('panel'),         // 顶栏与侧栏头尾条
        elevated: token('elevated'),   // 弹窗、浮层、菜单
        muted: token('muted'),         // 卡片、徽标、次级控件底色
        control: { DEFAULT: token('control'), hover: token('control-hover') }, // 次级按钮
        hover: token('hover'),         // 通用悬停底色
        selected: token('selected'),   // 当前选中项
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        fg: {
          DEFAULT: token('fg'),
          muted: token('fg-muted'),
          subtle: token('fg-subtle'),
          faint: token('fg-faint'),
        },
        accent: token('accent'),
        primary: { DEFAULT: token('primary'), hover: token('primary-hover') },
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        violet: token('violet'),
      },
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }],
        'ui': ['0.8125rem', { lineHeight: '1.25rem' }],
      },
    },
  },
  plugins: [],
}
