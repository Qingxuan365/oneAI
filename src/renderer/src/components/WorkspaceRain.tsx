import React, { useEffect, useRef } from 'react';
import { ThemeId } from '../types';
import { THEME_MODE } from '../themes';

interface WorkspaceRainProps {
  /** 下雨强度：0 关闭，1 ~ 100 连续调节雨滴密度、尺寸与下落速度 */
  intensity: number;
  /** 当前生效主题，用于同步雨滴色调与明暗对比 */
  theme: ThemeId;
}

interface RainDrop {
  x: number;
  y: number;
  layer: 0 | 1 | 2;
  length: number;
  speed: number;
  jitter: number;
}

interface RainSplash {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  radius: number;
}

const MAX_DPR = 2;
const MAX_DT_SEC = 0.05;
// 限制氛围层最大绘制帧率为 36 FPS，避免在 120Hz/144Hz/240Hz 高刷屏上产生数倍全屏透明图层合成开销
const TARGET_FRAME_INTERVAL_MS = 1000 / 36;

export function clampRainIntensity(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveRainColors(theme: ThemeId): [string, string, string, string] {
  const isLight = THEME_MODE[theme] === 'light';
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--color-accent').trim() || (isLight ? '0 113 227' : '64 156 255');
  const fg = styles.getPropertyValue('--color-fg').trim() || (isLight ? '29 29 31' : '245 245 247');
  if (isLight) {
    return [
      `rgb(${accent} / 0.14)`,
      `rgb(${accent} / 0.24)`,
      `rgb(${fg} / 0.22)`,
      `rgb(${accent} / 0.28)`,
    ];
  }
  return [
    `rgb(${fg} / 0.12)`,
    `rgb(${accent} / 0.22)`,
    `rgb(${fg} / 0.34)`,
    `rgb(${accent} / 0.32)`,
  ];
}

function makeDrop(width: number, height: number, factor: number, randomY: boolean): RainDrop {
  const roll = Math.random();
  const layer: 0 | 1 | 2 = roll < 0.42 ? 0 : roll < 0.8 ? 1 : 2;
  const depth = layer === 0 ? 0.62 : layer === 1 ? 0.88 : 1.18;
  const baseLen = (9 + factor * 19) * depth;
  const baseSpeed = (440 + factor * 820) * depth;
  return {
    x: Math.random() * (width + 240) - 120,
    y: randomY ? Math.random() * height : -baseLen - Math.random() * 140,
    layer,
    length: baseLen * (0.8 + Math.random() * 0.45),
    speed: baseSpeed * (0.86 + Math.random() * 0.28),
    jitter: (Math.random() - 0.5) * 0.04,
  };
}

/**
 * 全工作区下雨氛围层：纯 Canvas 2D 分层绘制，pointer-events: none 不干扰任何交互，
 * 固定 36 FPS 帧率上限，拖动滑块热更新雨滴数量不重分配 GPU 帧缓冲，窗口隐藏/失焦或强度为 0 时零动画开销。
 */
export const WorkspaceRain: React.FC<WorkspaceRainProps> = React.memo(({ intensity, theme }) => {
  const level = clampRainIntensity(intensity, 0);
  const active = level > 0;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  const reconcileRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = resolveRainColors(theme);

    let width = Math.max(1, window.innerWidth);
    let height = Math.max(1, window.innerHeight);
    let drops: RainDrop[] = [];
    const splashes: RainSplash[] = [];
    let rafId = 0;
    let lastDrawTime = 0;
    let windowFocused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;

    const currentFactor = () => Math.max(0.01, levelRef.current / 100);

    const targetCount = (factor: number) => {
      const areaScale = Math.max(0.55, Math.min(2.2, (width * height) / (1440 * 900)));
      return Math.round((24 + factor * 186) * areaScale);
    };

    const syncDropPool = (factor: number) => {
      const desired = targetCount(factor);
      if (drops.length < desired) {
        while (drops.length < desired) drops.push(makeDrop(width, height, factor, true));
      } else if (drops.length > desired) {
        drops.length = desired;
      }
    };

    const syncSize = () => {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const nextW = Math.round(width * dpr);
      const nextH = Math.round(height * dpr);
      if (canvas.width !== nextW) canvas.width = nextW;
      if (canvas.height !== nextH) canvas.height = nextH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      syncDropPool(currentFactor());
    };

    const renderFrame = (dt: number) => {
      const factor = currentFactor();
      const windRatio = 0.08 + factor * 0.14;
      const widths: [number, number, number] = [
        0.65 + factor * 0.35,
        0.85 + factor * 0.55,
        1.15 + factor * 0.75,
      ];

      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = 'round';

      for (let layer = 0 as 0 | 1 | 2; layer < 3; layer = (layer + 1) as 0 | 1 | 2) {
        ctx.beginPath();
        ctx.strokeStyle = colors[layer];
        ctx.lineWidth = widths[layer];
        for (let i = 0; i < drops.length; i++) {
          const drop = drops[i];
          if (drop.layer !== layer) continue;
          const slant = windRatio + drop.jitter;
          if (dt > 0) {
            const dy = drop.speed * dt;
            drop.y += dy;
            drop.x += dy * slant;
            if (drop.y - drop.length > height || drop.x > width + 140) {
              if (layer === 2 && drop.y - drop.length > height && splashes.length < 28 && Math.random() < 0.25 + factor * 0.45) {
                splashes.push({
                  x: Math.max(8, Math.min(width - 8, drop.x)),
                  y: height - 2,
                  age: 0,
                  maxAge: 0.24 + Math.random() * 0.16,
                  radius: 2.5 + factor * 4.5,
                });
              }
              const next = makeDrop(width, height, factor, false);
              next.layer = layer;
              drops[i] = next;
              continue;
            }
          }
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x + drop.length * slant, drop.y + drop.length);
        }
        ctx.stroke();
      }

      if (splashes.length > 0) {
        ctx.strokeStyle = colors[3];
        ctx.lineWidth = 0.85;
        for (let i = splashes.length - 1; i >= 0; i--) {
          const s = splashes[i];
          s.age += dt;
          if (s.age >= s.maxAge) {
            splashes[i] = splashes[splashes.length - 1];
            splashes.pop();
            continue;
          }
          const progress = s.age / s.maxAge;
          const rx = s.radius * (0.35 + progress * 0.95);
          const ry = Math.max(0.8, rx * 0.28);
          ctx.globalAlpha = 1 - progress;
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, rx, ry, 0, Math.PI, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    };

    const shouldPause = () => document.hidden || !windowFocused;

    const tick = (now: number) => {
      rafId = 0;
      if (shouldPause()) return;
      if (lastDrawTime > 0 && now - lastDrawTime < TARGET_FRAME_INTERVAL_MS - 1) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const dt = lastDrawTime > 0 ? Math.min(MAX_DT_SEC, (now - lastDrawTime) / 1000) : 1 / 36;
      lastDrawTime = now;
      renderFrame(dt);
      rafId = requestAnimationFrame(tick);
    };

    const start = () => {
      if (reducedMotion) {
        renderFrame(0);
        return;
      }
      if (shouldPause() || rafId) return;
      lastDrawTime = 0;
      rafId = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const onVisibility = () => {
      if (shouldPause()) stop();
      else start();
    };

    const onFocus = () => {
      windowFocused = true;
      start();
    };

    const onBlur = () => {
      windowFocused = false;
      stop();
    };

    const onResize = () => {
      syncSize();
      if (reducedMotion) renderFrame(0);
    };

    reconcileRef.current = () => {
      syncDropPool(currentFactor());
      if (reducedMotion) renderFrame(0);
    };

    syncSize();
    start();
    window.addEventListener('resize', onResize);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      reconcileRef.current = null;
      stop();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, theme]);

  useEffect(() => {
    if (active) reconcileRef.current?.();
  }, [active, level]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-workspace-rain
      data-rain-intensity={level}
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
});

WorkspaceRain.displayName = 'WorkspaceRain';
