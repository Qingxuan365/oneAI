import React, { useEffect, useRef } from 'react';
import { ThemeId } from '../types';
import { THEME_MODE } from '../themes';

interface WorkspaceSnowProps {
  /** 下雪强度：0 关闭，1 ~ 100 连续调节雪花密度、尺寸与飘落速度 */
  intensity: number;
  /** 当前生效主题，用于同步雪花色调与明暗对比 */
  theme: ThemeId;
}

interface SnowFlake {
  x: number;
  y: number;
  layer: 0 | 1 | 2;
  radius: number;
  speed: number;
  drift: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  opacity: number;
  crystal: boolean;
  rotation: number;
  spin: number;
}

interface SnowPalette {
  core: [string, string, string];
  glow: [string, string, string];
  crystalStroke: string;
}

const MAX_DPR = 2;
const MAX_DT_SEC = 0.05;
// 限制氛围层最大绘制帧率为 36 FPS，避免在高刷屏上产生高频全屏合成
const TARGET_FRAME_INTERVAL_MS = 1000 / 36;
const DOT_SPRITE_HALF = 16;
const CRYSTAL_SPRITE_HALF = 24;

export function clampSnowIntensity(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function resolveSnowPalette(theme: ThemeId): SnowPalette {
  const isLight = THEME_MODE[theme] === 'light';
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--color-accent').trim() || (isLight ? '0 113 227' : '64 156 255');
  const fg = styles.getPropertyValue('--color-fg').trim() || (isLight ? '29 29 31' : '245 245 247');
  if (isLight) {
    return {
      core: [
        `rgb(${accent} / 0.24)`,
        `rgb(${accent} / 0.36)`,
        `rgb(${fg} / 0.30)`,
      ],
      glow: [
        `rgb(${accent} / 0.08)`,
        `rgb(${accent} / 0.14)`,
        `rgb(${accent} / 0.18)`,
      ],
      crystalStroke: `rgb(${accent} / 0.48)`,
    };
  }
  return {
    core: [
      'rgb(255 255 255 / 0.36)',
      'rgb(240 248 255 / 0.58)',
      'rgb(255 255 255 / 0.82)',
    ],
    glow: [
      `rgb(${accent} / 0.10)`,
      `rgb(${accent} / 0.16)`,
      'rgb(255 255 255 / 0.22)',
    ],
    crystalStroke: 'rgb(245 250 255 / 0.72)',
  };
}

function createDotSprite(coreColor: string, glowColor: string): HTMLCanvasElement {
  const size = DOT_SPRITE_HALF * 2;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const sctx = sprite.getContext('2d');
  if (!sctx) return sprite;
  const c = DOT_SPRITE_HALF;
  const unitR = DOT_SPRITE_HALF / 2;
  sctx.fillStyle = glowColor;
  sctx.beginPath();
  sctx.arc(c, c, unitR * 1.9, 0, Math.PI * 2);
  sctx.fill();
  sctx.fillStyle = coreColor;
  sctx.beginPath();
  sctx.arc(c, c, unitR, 0, Math.PI * 2);
  sctx.fill();
  return sprite;
}

function createCrystalSprite(glowColor: string, strokeColor: string): HTMLCanvasElement {
  const size = CRYSTAL_SPRITE_HALF * 2;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const sctx = sprite.getContext('2d');
  if (!sctx) return sprite;
  const c = CRYSTAL_SPRITE_HALF;
  const r = CRYSTAL_SPRITE_HALF * 0.62;
  sctx.fillStyle = glowColor;
  sctx.beginPath();
  sctx.arc(c, c, r * 1.45, 0, Math.PI * 2);
  sctx.fill();

  sctx.translate(c, c);
  sctx.strokeStyle = strokeColor;
  sctx.lineWidth = Math.max(1.2, r * 0.14);
  sctx.lineCap = 'round';
  sctx.beginPath();
  for (let arm = 0; arm < 3; arm++) {
    const a = (arm * Math.PI) / 3;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    sctx.moveTo(-cos * r, -sin * r);
    sctx.lineTo(cos * r, sin * r);
    const branchAt = r * 0.58;
    const branchLen = r * 0.28;
    for (const dir of [-1, 1]) {
      const bx = cos * branchAt * dir;
      const by = sin * branchAt * dir;
      const b1 = a + Math.PI / 4;
      const b2 = a - Math.PI / 4;
      sctx.moveTo(bx, by);
      sctx.lineTo(bx + Math.cos(b1) * branchLen * dir, by + Math.sin(b1) * branchLen * dir);
      sctx.moveTo(bx, by);
      sctx.lineTo(bx + Math.cos(b2) * branchLen * dir, by + Math.sin(b2) * branchLen * dir);
    }
  }
  sctx.stroke();
  return sprite;
}

function makeFlake(width: number, height: number, factor: number, randomY: boolean): SnowFlake {
  const roll = Math.random();
  const layer: 0 | 1 | 2 = roll < 0.45 ? 0 : roll < 0.82 ? 1 : 2;
  const depth = layer === 0 ? 0.58 : layer === 1 ? 0.92 : 1.32;
  const radius = (1.1 + factor * 1.4) * depth * (0.78 + Math.random() * 0.48);
  const baseSpeed = (22 + factor * 56) * depth;
  const crystal = layer === 2 && Math.random() < 0.36;
  return {
    x: Math.random() * (width + 160) - 80,
    y: randomY ? Math.random() * height : -radius * 4 - Math.random() * 120,
    layer,
    radius: crystal ? radius * 1.35 : radius,
    speed: baseSpeed * (0.78 + Math.random() * 0.44),
    drift: (6 + factor * 22) * depth * (0.65 + Math.random() * 0.7),
    swayAmp: (8 + factor * 16) * (layer === 0 ? 0.65 : layer === 1 ? 1 : 1.25),
    swayFreq: 0.55 + Math.random() * 0.95,
    phase: Math.random() * Math.PI * 2,
    opacity: 0.65 + Math.random() * 0.35,
    crystal,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.9,
  };
}

/**
 * 全工作区下雪氛围层：初始化时预烘焙离屏柔光雪点与六角冰晶精灵，帧内仅用 drawImage 合成，
 * 固定 36 FPS 上限、滑块热更新不重分配帧缓冲，窗口隐藏/失焦或强度为 0 时零动画开销。
 */
export const WorkspaceSnow: React.FC<WorkspaceSnowProps> = React.memo(({ intensity, theme }) => {
  const level = clampSnowIntensity(intensity, 0);
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
    const palette = resolveSnowPalette(theme);
    const dotSprites: [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement] = [
      createDotSprite(palette.core[0], palette.glow[0]),
      createDotSprite(palette.core[1], palette.glow[1]),
      createDotSprite(palette.core[2], palette.glow[2]),
    ];
    const crystalSprite = createCrystalSprite(palette.glow[2], palette.crystalStroke);

    let width = Math.max(1, window.innerWidth);
    let height = Math.max(1, window.innerHeight);
    let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let flakes: SnowFlake[] = [];
    let rafId = 0;
    let lastDrawTime = 0;
    let elapsed = 0;
    let windowFocused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;

    const currentFactor = () => Math.max(0.01, levelRef.current / 100);

    const targetCount = (factor: number) => {
      const areaScale = Math.max(0.55, Math.min(2.2, (width * height) / (1440 * 900)));
      return Math.round((28 + factor * 172) * areaScale);
    };

    const syncFlakePool = (factor: number) => {
      const desired = targetCount(factor);
      if (flakes.length < desired) {
        while (flakes.length < desired) flakes.push(makeFlake(width, height, factor, true));
      } else if (flakes.length > desired) {
        flakes.length = desired;
      }
    };

    const syncSize = () => {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const nextW = Math.round(width * dpr);
      const nextH = Math.round(height * dpr);
      if (canvas.width !== nextW) canvas.width = nextW;
      if (canvas.height !== nextH) canvas.height = nextH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      syncFlakePool(currentFactor());
    };

    const renderFrame = (dt: number) => {
      const factor = currentFactor();
      elapsed += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        if (dt > 0) {
          f.y += f.speed * dt;
          f.x += (f.drift + Math.sin(elapsed * f.swayFreq + f.phase) * f.swayAmp) * dt;
          if (f.crystal) f.rotation += f.spin * dt;
          const margin = f.radius * 4 + 40;
          if (f.y > height + margin || f.x > width + margin || f.x < -margin) {
            const next = makeFlake(width, height, factor, false);
            next.layer = f.layer;
            flakes[i] = next;
            continue;
          }
        }

        ctx.globalAlpha = f.opacity;
        if (f.crystal) {
          const drawSize = (f.radius / (CRYSTAL_SPRITE_HALF * 0.62)) * (CRYSTAL_SPRITE_HALF * 2);
          const half = drawSize * 0.5;
          const cos = Math.cos(f.rotation) * dpr;
          const sin = Math.sin(f.rotation) * dpr;
          ctx.setTransform(cos, sin, -sin, cos, f.x * dpr, f.y * dpr);
          ctx.drawImage(crystalSprite, -half, -half, drawSize, drawSize);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else {
          const drawSize = f.radius * 4;
          const half = drawSize * 0.5;
          ctx.drawImage(dotSprites[f.layer], f.x - half, f.y - half, drawSize, drawSize);
        }
      }
      ctx.globalAlpha = 1;
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
      syncFlakePool(currentFactor());
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
      data-workspace-snow
      data-snow-intensity={level}
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
});

WorkspaceSnow.displayName = 'WorkspaceSnow';
