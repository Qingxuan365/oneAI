import React, { useEffect, useRef } from 'react';
import { ThemeId } from '../types';
import { THEME_MODE } from '../themes';
import {
  readStatusTextSurfaces,
  registerAmbientCanvasLayer,
  StatusTextSurface,
  updateAmbientLayerIntensity,
} from './statusTextSurfaces';

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
  alphaBucket: 0 | 1 | 2;
  crystal: boolean;
  rotation: number;
  spin: number;
}

interface SnowPalette {
  core: [string, string, string];
  glow: [string, string, string];
  crystalStroke: string;
  settled: string;
}

interface SnowColumn {
  depth: number;
  visibleDepth: number;
  meltAfter: number;
}

interface SnowBank {
  left: number;
  right: number;
  y: number;
  columns: SnowColumn[];
}

const DOT_SPRITE_HALF = 16;
const CRYSTAL_SPRITE_HALF = 24;
const SNOW_BANK_COLUMN_WIDTH = 20;
const SNOW_BANK_HOLD_SEC = 2.5;
const MAX_TEXT_BANK_DEPTH = 7;
const FLAKE_ALPHA_BUCKETS = [0.72, 0.86, 1] as const;

function resizeBank(bank: SnowBank, left: number, right: number, y: number) {
  bank.left = left;
  bank.right = right;
  bank.y = y;
  const count = Math.max(3, Math.ceil((right - left) / SNOW_BANK_COLUMN_WIDTH) + 1);
  if (bank.columns.length !== count) {
    bank.columns = Array.from({ length: count }, (_, i) => bank.columns[i] ?? { depth: 0, visibleDepth: 0, meltAfter: 0 });
  }
}

function columnAt(bank: SnowBank, x: number) {
  const span = Math.max(1e-3, bank.right - bank.left);
  const rawIndex = Math.round(((x - bank.left) / span) * (bank.columns.length - 1));
  const index = Math.max(0, Math.min(bank.columns.length - 1, rawIndex));
  return bank.columns[index];
}

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
      settled: `rgb(${accent} / 0.31)`,
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
    settled: 'rgb(230 244 255 / 0.70)',
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
  const alphaRoll = Math.random();
  const alphaBucket: 0 | 1 | 2 = alphaRoll < 0.33 ? 0 : alphaRoll < 0.67 ? 1 : 2;
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
    alphaBucket,
    crystal,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.9,
  };
}

/**
 * 全工作区下雪氛围层：与雨景共用单个全屏 Canvas 与 36 FPS 帧时钟，
 * 雪花使用离屏精灵并按透明度分桶绘制，底部与状态栏积雪合并成一条轮廓，
 * 滑块热更新不重分配帧缓冲，窗口隐藏/失焦或强度为 0 时零动画开销。
 */
export const WorkspaceSnow: React.FC<WorkspaceSnowProps> = React.memo(({ intensity, theme }) => {
  const level = clampSnowIntensity(intensity, 0);
  const active = level > 0;
  const levelRef = useRef(level);
  levelRef.current = level;
  const reconcileRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    const palette = resolveSnowPalette(theme);
    const dotSprites: [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement] = [
      createDotSprite(palette.core[0], palette.glow[0]),
      createDotSprite(palette.core[1], palette.glow[1]),
      createDotSprite(palette.core[2], palette.glow[2]),
    ];
    const crystalSprite = createCrystalSprite(palette.glow[2], palette.crystalStroke);

    let width = Math.max(1, window.innerWidth);
    let height = Math.max(1, window.innerHeight);
    let flakes: SnowFlake[] = [];
    const floor: SnowBank = { left: 0, right: width, y: height, columns: [] };
    let surfaces: readonly StatusTextSurface[] = [];
    let textBanks = new Map<Text, SnowBank>();
    let elapsed = 0;

    const currentFactor = () => Math.max(0.01, levelRef.current / 100);

    const targetCount = (factor: number) => {
      const areaScale = Math.max(0.55, Math.min(1.6, (width * height) / (1440 * 900)));
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

    const appendSnowBank = (ctx: CanvasRenderingContext2D, bank: SnowBank, dt: number) => {
      const { left, right, y, columns } = bank;
      let hasSnow = false;
      for (let i = 0; i < columns.length; i++) {
        const column = columns[i];
        if (elapsed > column.meltAfter && column.depth > 0) {
          column.depth = Math.max(0, column.depth - (1.8 + column.depth * 0.28) * dt);
        }
        column.visibleDepth = Math.min(column.depth, column.visibleDepth + 7 * dt);
        if (column.visibleDepth > 0.05) hasSnow = true;
      }
      if (!hasSnow) return false;

      const step = (right - left) / (columns.length - 1);
      // 跳过连续无积雪的平坦段落，只为有厚度的积雪丘陵生成曲线，降低 4K 路径顶点数
      let i = 0;
      while (i < columns.length) {
        if (columns[i].visibleDepth <= 0.05) {
          i++;
          continue;
        }
        const start = Math.max(0, i - 1);
        let end = i;
        while (end + 1 < columns.length && columns[end + 1].visibleDepth > 0.05) end++;
        const stop = Math.min(columns.length - 1, end + 1);

        const startX = left + start * step;
        ctx.moveTo(startX, y);
        ctx.lineTo(startX, y - columns[start].visibleDepth);
        for (let j = start + 1; j <= stop; j++) {
          const x = left + j * step;
          const middleX = x - step * 0.5;
          const previousY = y - columns[j - 1].visibleDepth;
          const nextY = y - columns[j].visibleDepth;
          ctx.bezierCurveTo(middleX, previousY, middleX, nextY, x, nextY);
        }
        ctx.lineTo(left + stop * step, y);
        ctx.closePath();
        i = stop + 1;
      }
      return true;
    };

    reconcileRef.current = () => {
      syncFlakePool(currentFactor());
      updateAmbientLayerIntensity('snow', levelRef.current);
    };

    const unregister = registerAmbientCanvasLayer('snow', {
      order: 1,
      intensity: levelRef.current,
      onResize: (nextWidth, nextHeight) => {
        width = nextWidth;
        height = nextHeight;
        resizeBank(floor, 0, width, height);
        syncFlakePool(currentFactor());
      },
      onDraw: (ctx, drawWidth, drawHeight, scaleX, scaleY, dt, now) => {
        width = drawWidth;
        height = drawHeight;
        const factor = currentFactor();
        elapsed += dt;
        const currentSurfaces = dt > 0 ? readStatusTextSurfaces(now) : surfaces;
        if (surfaces !== currentSurfaces) {
          surfaces = currentSurfaces;
          const next = new Map<Text, SnowBank>();
          for (let s = 0; s < surfaces.length; s++) {
            const { node, left, right, y } = surfaces[s];
            const bank = textBanks.get(node) ?? { left, right, y, columns: [] };
            resizeBank(bank, left, right, y);
            next.set(node, bank);
          }
          textBanks = next;
        }
        const firstTextY = surfaces[0]?.y ?? height;
        const hitThresholdY = firstTextY - (surfaces.length ? MAX_TEXT_BANK_DEPTH : 13);

        if (dt > 0) {
          for (let i = 0; i < flakes.length; i++) {
            const f = flakes[i];
            f.y += f.speed * dt;
            f.x += (f.drift + Math.sin(elapsed * f.swayFreq + f.phase) * f.swayAmp) * dt;
            if (f.crystal) f.rotation += f.spin * dt;
            const margin = f.radius * 4 + 40;
            const tip = f.y + f.radius;
            let landed = tip >= height;
            if (tip >= hitThresholdY && f.x >= 0 && f.x <= width) {
              const previousY = f.y - f.speed * dt;
              let hitNode: Text | null = null;
              for (let s = 0; s < surfaces.length; s++) {
                const surface = surfaces[s];
                if (f.x >= surface.left && f.x <= surface.right && tip >= surface.y - MAX_TEXT_BANK_DEPTH && previousY <= surface.y) {
                  hitNode = surface.node;
                  break;
                }
              }
              const bank = (hitNode && textBanks.get(hitNode)) || floor;
              const column = columnAt(bank, f.x);
              landed = tip >= bank.y - column.visibleDepth || landed;
              const maxDepth = bank === floor ? 3 + factor * 10 : 2 + factor * (MAX_TEXT_BANK_DEPTH - 2);
              if (landed && column.depth < maxDepth) {
                column.depth = Math.min(maxDepth, column.depth + 0.65 + f.radius * 0.8);
                column.meltAfter = elapsed + SNOW_BANK_HOLD_SEC;
              }
            }
            if (landed || f.x > width + margin || f.x < -margin) {
              const next = makeFlake(width, height, factor, false);
              next.layer = f.layer;
              flakes[i] = next;
            }
          }
        }

        // 按透明度分桶批量绘制圆点雪花，将每帧 globalAlpha 状态切换从数百次降至 3 次
        for (let bucket = 0; bucket < FLAKE_ALPHA_BUCKETS.length; bucket++) {
          ctx.globalAlpha = FLAKE_ALPHA_BUCKETS[bucket];
          for (let i = 0; i < flakes.length; i++) {
            const f = flakes[i];
            if (f.crystal || f.alphaBucket !== bucket) continue;
            const drawSize = f.radius * 4;
            const half = drawSize * 0.5;
            ctx.drawImage(dotSprites[f.layer], f.x - half, f.y - half, drawSize, drawSize);
          }
        }

        // 集中绘制旋转六角冰晶，最后统一恢复单位变换
        let drewCrystal = false;
        for (let bucket = 0; bucket < FLAKE_ALPHA_BUCKETS.length; bucket++) {
          let alphaSet = false;
          for (let i = 0; i < flakes.length; i++) {
            const f = flakes[i];
            if (!f.crystal || f.alphaBucket !== bucket) continue;
            if (!alphaSet) {
              ctx.globalAlpha = FLAKE_ALPHA_BUCKETS[bucket];
              alphaSet = true;
            }
            drewCrystal = true;
            const drawSize = (f.radius / (CRYSTAL_SPRITE_HALF * 0.62)) * (CRYSTAL_SPRITE_HALF * 2);
            const half = drawSize * 0.5;
            const cos = Math.cos(f.rotation);
            const sin = Math.sin(f.rotation);
            ctx.setTransform(cos * scaleX, sin * scaleY, -sin * scaleX, cos * scaleY, f.x * scaleX, f.y * scaleY);
            ctx.drawImage(crystalSprite, -half, -half, drawSize, drawSize);
          }
        }
        if (drewCrystal) ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

        ctx.globalAlpha = 1;
        ctx.beginPath();
        let hasSnow = appendSnowBank(ctx, floor, dt);
        for (const bank of textBanks.values()) hasSnow = appendSnowBank(ctx, bank, dt) || hasSnow;
        if (hasSnow) {
          ctx.fillStyle = palette.settled;
          ctx.fill();
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

WorkspaceSnow.displayName = 'WorkspaceSnow';
