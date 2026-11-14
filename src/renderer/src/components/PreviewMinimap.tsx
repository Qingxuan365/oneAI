import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** 画布宽度（CSS px），约容纳 MAX_COLS 列；每行最高 MAX_ROW px，行数多时按可用高度等比压缩 */
export const MINIMAP_WIDTH = 72;
const MAX_COLS = 90;
const MAX_ROW = 2;
const MIN_SLIDER = 10;

interface PreviewMinimapProps {
  /** 文件内容按行拆分 */
  lines: string[];
  /** 被预览内容所在的滚动容器 */
  scrollRef: React.RefObject<HTMLElement>;
  /** 从终端点击 `文件:行号` 时需要标出的行（从 1 开始） */
  targetLine?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 读取主题色变量（RGB 通道），换主题后重绘即可跟随 */
function themeColor(name: string, alpha: number): string {
  const channels = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim().replace(/\s+/g, ' ');
  return channels ? `rgb(${channels} / ${alpha})` : `rgba(128,128,128,${alpha})`;
}

/**
 * 类似 VS Code 的代码缩略图（minimap）：每行画成一排按缩进与长度排布的小色块，半透明滑块标出当前可见范围，
 * 点击或拖动滑块即可滚动预览。纯装饰与鼠标辅助，不参与键盘与读屏。
 */
export const PreviewMinimap: React.FC<PreviewMinimapProps> = ({ lines, scrollRef, targetLine }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [height, setHeight] = useState(0);
  const [themeVersion, setThemeVersion] = useState(0);
  const [slider, setSlider] = useState<{ top: number; height: number } | null>(null);

  const rowHeight = lines.length > 0 && height > 0 ? Math.min(MAX_ROW, height / lines.length) : 0;
  const contentHeight = rowHeight * lines.length;
  const metrics = useRef({ contentHeight: 0 });
  metrics.current.contentHeight = contentHeight;

  // 自身高度；主题切换（data-theme 变化）时重绘
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    setHeight(wrap.clientHeight);
    const resize = new ResizeObserver(() => setHeight(wrap.clientHeight));
    resize.observe(wrap);
    const theme = new MutationObserver(() => setThemeVersion((version) => version + 1));
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { resize.disconnect(); theme.disconnect(); };
  }, []);

  // 绘制缩略图
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || contentHeight <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(MINIMAP_WIDTH * dpr);
    canvas.height = Math.max(1, Math.round(contentHeight * dpr));
    canvas.style.height = `${contentHeight}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(dpr, dpr);
    const colWidth = MINIMAP_WIDTH / MAX_COLS;
    const blockHeight = Math.max(rowHeight * 0.72, 0.6);
    context.fillStyle = themeColor('fg-subtle', 0.55);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i].replace(/\t/g, '  ').slice(0, MAX_COLS);
      if (!text.trim()) continue;
      for (const match of text.matchAll(/\S+/g)) {
        context.fillRect((match.index ?? 0) * colWidth, i * rowHeight, match[0].length * colWidth, blockHeight);
      }
    }
    if (targetLine && targetLine >= 1 && targetLine <= lines.length) {
      context.fillStyle = themeColor('accent', 0.95);
      context.fillRect(0, (targetLine - 1) * rowHeight, MINIMAP_WIDTH, Math.max(rowHeight, 2));
    }
  }, [lines, rowHeight, contentHeight, targetLine, themeVersion]);

  // 滑块跟随预览内容的滚动位置与大小；内容没有溢出时不显示滑块
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;
    // scroll 事件浏览器本身按帧合并，这里无需再用 requestAnimationFrame 节流
    const sync = () => {
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      const total = metrics.current.contentHeight;
      if (total <= 0 || scrollHeight <= clientHeight + 1) { setSlider(null); return; }
      const sliderHeight = clamp((clientHeight / scrollHeight) * total, MIN_SLIDER, total);
      setSlider({ top: clamp((scrollTop / scrollHeight) * total, 0, total - sliderHeight), height: sliderHeight });
    };
    sync();
    scroller.addEventListener('scroll', sync, { passive: true });
    const resize = new ResizeObserver(sync);
    resize.observe(scroller);
    if (scroller.firstElementChild) resize.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener('scroll', sync);
      resize.disconnect();
    };
  }, [scrollRef, contentHeight, lines]);

  // 点击跳转并支持拖动：按下位置落在滑块内时保持相对位置，否则让滑块中心对准指针
  const startDrag = (event: React.MouseEvent) => {
    const scroller = scrollRef.current;
    const wrap = wrapRef.current;
    if (!scroller || !wrap || contentHeight <= 0) return;
    event.preventDefault();
    const top = wrap.getBoundingClientRect().top;
    const offsetY = event.clientY - top;
    const grab = slider && offsetY >= slider.top && offsetY <= slider.top + slider.height ? offsetY - (slider.top + slider.height / 2) : 0;
    const seek = (clientY: number) => {
      const ratio = clamp((clientY - top - grab) / contentHeight, 0, 1);
      scroller.scrollTop = ratio * scroller.scrollHeight - scroller.clientHeight / 2;
    };
    seek(event.clientY);
    const onMove = (e: MouseEvent) => seek(e.clientY);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      data-preview-minimap
      onMouseDown={startDrag}
      onWheel={(event) => { if (scrollRef.current) scrollRef.current.scrollTop += event.deltaY; }}
      className="relative h-full shrink-0 cursor-pointer select-none overflow-hidden border-l border-line bg-canvas"
      style={{ width: MINIMAP_WIDTH }}
    >
      <canvas ref={canvasRef} className="block" style={{ width: MINIMAP_WIDTH }} />
      {slider && (
        <div
          data-preview-minimap-slider
          className="absolute left-0 right-0 bg-fg/10 hover:bg-fg/20"
          style={{ top: slider.top, height: slider.height }}
        />
      )}
    </div>
  );
};
