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
    // 浅色主题下采用清透冰蓝与冷灰白，避免纯白雪花在浅底上隐身
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

function drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  for (let arm = 0; arm < 3; arm++) {
    const a = (arm * Math.PI) / 3;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    ctx.moveTo(-cos * r, -sin * r);
    ctx.lineTo(cos * r, sin * r);
    // 每条主轴两端补上微小分叉，近景雪晶更有辨识度
    const branchAt = r * 0.58;
    const branchLen = r * 0.28;
    for (const dir of [-1, 1]) {
      const bx = cos * branchAt * dir;
      const by = sin * branchAt * dir;
      const b1 = a + Math.PI / 4;
      const b2 = a - Math.PI / 4;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(b1) * branchLen * dir, by + Math.sin(b1) * branchLen * dir);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(b2) * branchLen * dir, by + Math.sin(b2) * branchLen * dir);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 全工作区下雪氛围层：纯 Canvas 2D 三层景深绘制，pointer-events: none 不干扰任何交互，
 * 窗口隐藏或强度为 0 时零动画开销，并遵循系统「减少动态效果」设置。
 */
export const WorkspaceSnow: React.FC<WorkspaceSnowProps> = React.memo(({ intensity, theme }) => {
  const level = clampSnowIntensity(intensity, 0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (level <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const factor = level / 100;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const palette = resolveSnowPalette(theme);

    let width = Math.max(1, window.innerWidth);
    let height = Math.max(1, window.innerHeight);
    let flakes: SnowFlake[] = [];
    let rafId = 0;
    let lastTime = 0;
    let elapsed = 0;

    const targetCount = () => {
      const areaScale = Math.max(0.55, Math.min(2.2, (width * height) / (1440 * 900)));
      return Math.round((28 + factor * 172) * areaScale);
    };

    const syncSize = () => {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const desired = targetCount();
      if (flakes.length < desired) {
        while (flakes.length < desired) flakes.push(makeFlake(width, height, factor, true));
      } else if (flakes.length > desired) {
        flakes = flakes.slice(0, desired);
      }
    };

    const renderFrame = (dt: number) => {
      elapsed += dt;
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
          // 柔和光晕 + 旋转六角冰晶
          ctx.fillStyle = palette.glow[f.layer];
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.radius * 1.45, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = palette.crystalStroke;
          ctx.lineWidth = 0.85;
          ctx.lineCap = 'round';
          drawCrystal(ctx, f.x, f.y, f.radius, f.rotation);
        } else {
          // 双层柔光雪点：外层微光晕 + 内层柔芯
          ctx.fillStyle = palette.glow[f.layer];
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.radius * 1.9, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = palette.core[f.layer];
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      rafId = 0;
      if (document.hidden) return;
      const dt = lastTime > 0 ? Math.min(MAX_DT_SEC, (now - lastTime) / 1000) : 1 / 60;
      lastTime = now;
      renderFrame(dt);
      rafId = requestAnimationFrame(tick);
    };

    const start = () => {
      if (reducedMotion) {
        renderFrame(0);
        return;
      }
      if (document.hidden || rafId) return;
      lastTime = 0;
      rafId = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      } else {
        start();
      }
    };

    const onResize = () => {
      syncSize();
      if (reducedMotion) renderFrame(0);
    };

    syncSize();
    start();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [level, theme]);

  if (level <= 0) return null;

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
