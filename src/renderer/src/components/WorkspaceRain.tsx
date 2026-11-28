import React, { useEffect, useRef } from 'react';
import { ThemeId } from '../types';
import { THEME_MODE } from '../themes';
import {
  readStatusTextSurfaces,
  registerAmbientCanvasLayer,
  updateAmbientLayerIntensity,
} from './statusTextSurfaces';

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
  impactY?: number;
}

interface RainSplash {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  radius: number;
  lift: number;
}

const SPLASH_SPRAY = [-0.9, 0.15, 0.95];
const SPLASH_ALPHA_BANDS = [0.85, 0.55, 0.25];

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
      `rgb(${accent} / 0.46)`,
    ];
  }
  return [
    `rgb(${fg} / 0.12)`,
    `rgb(${accent} / 0.22)`,
    `rgb(${fg} / 0.34)`,
    `rgb(${fg} / 0.56)`,
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
 * 全工作区下雨氛围层：与雪景共用单个全屏 Canvas 与 36 FPS 帧时钟，
 * pointer-events: none 不干扰任何交互，水花按透明度分桶合批描边，
 * 拖动滑块热更新雨滴数量不重分配 GPU 帧缓冲，窗口隐藏/失焦或强度为 0 时零动画开销。
 */
export const WorkspaceRain: React.FC<WorkspaceRainProps> = React.memo(({ intensity, theme }) => {
  const level = clampRainIntensity(intensity, 0);
  const active = level > 0;
  const levelRef = useRef(level);
  levelRef.current = level;
  const reconcileRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    const colors = resolveRainColors(theme);

    let width = Math.max(1, window.innerWidth);
    let height = Math.max(1, window.innerHeight);
    let drops: RainDrop[] = [];
    const splashes: RainSplash[] = [];

    const currentFactor = () => Math.max(0.01, levelRef.current / 100);

    const targetCount = (factor: number) => {
      const areaScale = Math.max(0.55, Math.min(1.6, (width * height) / (1440 * 900)));
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

    reconcileRef.current = () => {
      syncDropPool(currentFactor());
      updateAmbientLayerIntensity('rain', levelRef.current);
    };

    const unregister = registerAmbientCanvasLayer('rain', {
      order: 0,
      intensity: levelRef.current,
      onResize: (nextWidth, nextHeight) => {
        width = nextWidth;
        height = nextHeight;
        splashes.length = 0;
        syncDropPool(currentFactor());
      },
      onDraw: (ctx, drawWidth, drawHeight, _scaleX, _scaleY, dt, now) => {
        width = drawWidth;
        height = drawHeight;
        const factor = currentFactor();
        const surfaces = dt > 0 ? readStatusTextSurfaces(now) : [];
        const firstTextY = surfaces[0]?.y ?? height;
        const lastTextY = surfaces[surfaces.length - 1]?.y ?? 0;
        const windRatio = 0.08 + factor * 0.14;
        const widths: [number, number, number] = [
          0.65 + factor * 0.35,
          0.85 + factor * 0.55,
          1.15 + factor * 0.75,
        ];

        ctx.lineCap = 'round';
        ctx.globalAlpha = 1;

        for (let layer = 0 as 0 | 1 | 2; layer < 3; layer = (layer + 1) as 0 | 1 | 2) {
          ctx.beginPath();
          ctx.strokeStyle = colors[layer];
          ctx.lineWidth = widths[layer];
          for (let i = 0; i < drops.length; i++) {
            const drop = drops[i];
            if (drop.layer !== layer) continue;
            const slant = windRatio + drop.jitter;
            if (dt > 0) {
              const previousTip = drop.y + drop.length;
              const dy = drop.speed * dt;
              drop.y += dy;
              drop.x += dy * slant;
              const tip = drop.y + drop.length;
              if (drop.impactY === undefined && tip >= firstTextY) {
                let hitTextY = -1;
                if (previousTip < lastTextY) {
                  for (let s = 0; s < surfaces.length; s++) {
                    const surface = surfaces[s];
                    if (previousTip >= surface.y || tip < surface.y) continue;
                    const x = drop.x + (surface.y - drop.y) * slant;
                    if (x >= surface.left && x <= surface.right) {
                      hitTextY = surface.y;
                      break;
                    }
                  }
                }
                const impactY = hitTextY >= 0 ? hitTextY : height;
                if (previousTip < impactY && tip >= impactY) {
                  drop.impactY = impactY;
                }
                const impactX = drop.x + (impactY - drop.y) * slant;
                if (drop.impactY !== undefined && layer > 0 && splashes.length < 28 && impactX >= 0 && impactX <= width
                  && Math.random() < (hitTextY >= 0 ? 0.55 : 0.12) + factor * 0.4) {
                  splashes.push({
                    x: impactX,
                    y: impactY - 1,
                    age: 0,
                    maxAge: 0.3 + Math.random() * 0.12,
                    radius: 3 + factor * 5,
                    lift: (5 + factor * 9) * (0.8 + Math.random() * 0.4),
                  });
                }
              }
              if (drop.y >= (drop.impactY ?? height) || drop.x > width + 140) {
                const next = makeDrop(width, height, factor, false);
                next.layer = layer;
                drops[i] = next;
                continue;
              }
            }
            ctx.moveTo(drop.x, drop.y);
            const drawnLength = Math.max(0, Math.min(drop.length, (drop.impactY ?? height) - drop.y));
            ctx.lineTo(drop.x + drawnLength * slant, drop.y + drawnLength);
          }
          ctx.stroke();
        }

        if (splashes.length > 0) {
          if (dt > 0) {
            for (let i = splashes.length - 1; i >= 0; i--) {
              const s = splashes[i];
              s.age += dt;
              if (s.age >= s.maxAge) {
                splashes[i] = splashes[splashes.length - 1];
                splashes.pop();
              }
            }
          }
          if (splashes.length > 0) {
            ctx.strokeStyle = colors[3];
            ctx.lineWidth = 0.85;
            for (let band = 0; band < SPLASH_ALPHA_BANDS.length; band++) {
              let hasPath = false;
              ctx.beginPath();
              for (let i = 0; i < splashes.length; i++) {
                const s = splashes[i];
                const progress = s.age / s.maxAge;
                const splashBand = progress < 0.33 ? 0 : progress < 0.66 ? 1 : 2;
                if (splashBand !== band) continue;
                hasPath = true;
                const rx = s.radius * (0.35 + progress * 0.95);
                const ry = Math.max(0.8, rx * 0.28);
                ctx.moveTo(s.x - rx, s.y);
                ctx.ellipse(s.x, s.y, rx, ry, 0, Math.PI, Math.PI * 2);
                if (progress < 0.8) {
                  const flight = progress / 0.8;
                  const tail = Math.max(0, flight - 0.13);
                  const lift = s.lift * 4 * flight * (1 - flight);
                  const tailLift = s.lift * 4 * tail * (1 - tail);
                  for (let d = 0; d < SPLASH_SPRAY.length; d++) {
                    const direction = SPLASH_SPRAY[d];
                    const spread = direction * s.radius * 1.65;
                    const rise = 1 - Math.abs(direction) * 0.35;
                    ctx.moveTo(s.x + spread * tail, s.y - tailLift * rise);
                    ctx.lineTo(s.x + spread * flight, s.y - lift * rise);
                  }
                }
              }
              if (hasPath) {
                ctx.globalAlpha = SPLASH_ALPHA_BANDS[band];
                ctx.stroke();
              }
            }
            ctx.globalAlpha = 1;
          }
        }
      },
    });

    return () => {
      reconcileRef.current = null;
      unregister();
    };
  }, [active, theme]);

  useEffect(() => {
    if (active) reconcileRef.current?.();
  }, [active, level]);

  return null;
});

WorkspaceRain.displayName = 'WorkspaceRain';
