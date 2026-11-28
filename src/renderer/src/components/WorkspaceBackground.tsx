import React from 'react';
import { WorkspaceBackgroundPreset } from '../types';
import { clampBackgroundBlur, clampBackgroundOpacity, findBuiltinWallpaper } from '../workspaceBackgrounds';

interface WorkspaceBackgroundProps {
  preset: WorkspaceBackgroundPreset;
  customImageUrl: string | null;
  opacity: number;
  blur: number;
}

/**
 * 全工作区背景壁纸层（z-0）：承载内置 macOS 风格壁纸或本地自定义图片，
 * 并叠加随当前主题变化的柔和可读性遮罩，使液态玻璃侧栏、顶栏、弹窗与终端自然融合。
 */
export const WorkspaceBackground: React.FC<WorkspaceBackgroundProps> = React.memo(({
  preset,
  customImageUrl,
  opacity,
  blur,
}) => {
  const builtin = findBuiltinWallpaper(preset);
  const imageUrl = preset === 'custom' ? customImageUrl : builtin?.dataUrl ?? null;
  if (!imageUrl) return null;

  const visiblePct = clampBackgroundOpacity(opacity, 32);
  const blurPx = clampBackgroundBlur(blur, 0);
  const veilOpacity = Math.max(0.15, Math.min(0.95, 1 - visiblePct / 100));

  return (
    <div
      aria-hidden="true"
      data-workspace-background={preset}
      data-background-opacity={visiblePct}
      data-background-blur={blurPx}
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        className="h-full w-full object-cover"
        style={blurPx > 0 ? { filter: `blur(${blurPx}px)`, transform: 'scale(1.06)' } : undefined}
      />
      <div
        className="absolute inset-0 transition-opacity duration-200"
        style={{ backgroundColor: `rgb(var(--color-canvas) / ${veilOpacity})` }}
      />
    </div>
  );
});

WorkspaceBackground.displayName = 'WorkspaceBackground';
