import React, { useEffect, useState } from 'react';
import { WorkspaceBackgroundPreset } from '../types';
import { clampBackgroundBlur, clampBackgroundOpacity, findBuiltinWallpaper } from '../workspaceBackgrounds';

interface WorkspaceBackgroundProps {
  preset: WorkspaceBackgroundPreset;
  customImageUrl: string | null;
  opacity: number;
  blur: number;
}

const MAX_BAKED_EDGE_PX = 960;

/**
 * 全工作区背景壁纸层（z-0）：承载内置 macOS 风格壁纸或本地自定义图片，
 * 开启模糊时在离线降采样 Canvas 中一次性预烘焙静态模糊纹理，避免常驻全屏 CSS 高斯模糊滤镜开销。
 */
export const WorkspaceBackground: React.FC<WorkspaceBackgroundProps> = React.memo(({
  preset,
  customImageUrl,
  opacity,
  blur,
}) => {
  const builtin = findBuiltinWallpaper(preset);
  const imageUrl = preset === 'custom' ? customImageUrl : builtin?.dataUrl ?? null;
  const visiblePct = clampBackgroundOpacity(opacity, 32);
  const blurPx = clampBackgroundBlur(blur, 0);
  const veilOpacity = Math.max(0.15, Math.min(0.95, 1 - visiblePct / 100));

  const [bakedState, setBakedState] = useState<{ key: string; blobUrl: string } | null>(null);
  const targetKey = imageUrl && blurPx > 0 ? `${imageUrl}|${blurPx}` : '';

  useEffect(() => {
    if (!imageUrl || blurPx <= 0) {
      setBakedState((prev) => {
        if (prev) URL.revokeObjectURL(prev.blobUrl);
        return null;
      });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        if (cancelled) return;
        const srcW = img.naturalWidth || 1600;
        const srcH = img.naturalHeight || 1000;
        const scale = Math.min(1, MAX_BAKED_EDGE_PX / Math.max(srcW, srcH, 1));
        const w = Math.max(64, Math.round(srcW * scale));
        const h = Math.max(64, Math.round(srcH * scale));
        const scaledBlur = Math.max(0.5, blurPx * (w / Math.max(window.innerWidth || 1440, 640)));
        const pad = Math.ceil(scaledBlur * 2.5);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx || typeof ctx.filter !== 'string') return;
        ctx.filter = `blur(${scaledBlur.toFixed(2)}px)`;
        ctx.drawImage(img, -pad, -pad, w + pad * 2, h + pad * 2);
        canvas.toBlob((blob) => {
          if (!blob || cancelled) return;
          const nextUrl = URL.createObjectURL(blob);
          setBakedState((prev) => {
            if (prev) URL.revokeObjectURL(prev.blobUrl);
            return { key: `${imageUrl}|${blurPx}`, blobUrl: nextUrl };
          });
        }, 'image/webp', 0.9);
      };
      img.src = imageUrl;
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [imageUrl, blurPx]);

  useEffect(() => () => {
    setBakedState((prev) => {
      if (prev) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });
  }, []);

  if (!imageUrl) return null;

  const isBakedReady = blurPx > 0 && bakedState?.key === targetKey;
  const displayUrl = isBakedReady ? bakedState.blobUrl : imageUrl;

  return (
    <div
      aria-hidden="true"
      data-workspace-background={preset}
      data-background-opacity={visiblePct}
      data-background-blur={blurPx}
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <img
        src={displayUrl}
        alt=""
        draggable={false}
        className="h-full w-full object-cover"
        style={blurPx > 0 && !isBakedReady ? { filter: `blur(${blurPx}px)`, transform: 'scale(1.06)' } : undefined}
      />
      <div
        className="absolute inset-0 transition-opacity duration-200"
        style={{ backgroundColor: `rgb(var(--color-canvas) / ${veilOpacity})` }}
      />
    </div>
  );
});

WorkspaceBackground.displayName = 'WorkspaceBackground';
