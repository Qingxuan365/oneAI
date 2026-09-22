import React from 'react';

interface BrandIconProps {
  icon: 'codex' | 'kimi' | 'opencode' | 'claude' | 'terminal' | string;
  className?: string;
  size?: number;
}

export const BrandIcon: React.FC<BrandIconProps> = ({ icon, className = '', size = 16 }) => {
  // 所有图标统一为类似 Terminal 终端样式风格，并赋予各大模型专属辨识度发光色
  const getTerminalTheme = () => {
    switch (icon) {
      case 'kimi':
        return {
          stroke: '#1783FF', // Kimi 电光蓝
          bg: '#0B1528',
          border: '#1E2F4D',
          glow: 'rgba(23, 131, 255, 0.35)',
        };
      case 'codex':
        return {
          stroke: '#10A37F', // OpenAI / Codex 官方翡翠绿
          bg: '#0A1A14',
          border: '#15382B',
          glow: 'rgba(16, 163, 127, 0.35)',
        };
      case 'claude':
        return {
          stroke: '#D97757', // Anthropic Claude 暖赤陶
          bg: '#1A1310',
          border: '#38241D',
          glow: 'rgba(217, 119, 87, 0.35)',
        };
      case 'opencode':
        return {
          stroke: '#38BDF8', // OpenCode 天青色
          bg: '#0C1B2B',
          border: '#1E3A5F',
          glow: 'rgba(56, 189, 248, 0.35)',
        };
      default:
        return {
          stroke: '#34D399', // 默认霓虹翠绿
          bg: '#0E1726',
          border: '#1E2F44',
          glow: 'rgba(52, 211, 153, 0.35)',
        };
    }
  };

  const theme = getTerminalTheme();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform ${className}`}
      style={{ filter: `drop-shadow(0 0 2px ${theme.glow})` }}
    >
      {/* 极客终端微光圆角面板底座 */}
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="5"
        fill={theme.bg}
        stroke={theme.border}
        strokeWidth="1.2"
      />
      {/* 终端 > 提示符 */}
      <path
        d="M6.5 7.5L11 12L6.5 16.5"
        stroke={theme.stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 终端 _ 光标 */}
      <line
        x1="13"
        y1="16.5"
        x2="17.5"
        y2="16.5"
        stroke={theme.stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
};
