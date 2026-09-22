import React from 'react';

interface BrandIconProps {
  icon: 'codex' | 'kimi' | 'opencode' | 'claude' | 'terminal';
  className?: string;
  size?: number;
}

export const BrandIcon: React.FC<BrandIconProps> = ({ icon, className = '', size = 18 }) => {
  switch (icon) {
    case 'codex':
      // OpenAI / Codex 经典螺旋徽标
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 text-emerald-400 ${className}`}
        >
          <path
            d="M21.5 10.5C21.3 7.8 19.5 5.7 17 5.1C16.6 3.3 15 2 13.1 2C11.6 2 10.3 2.8 9.6 4C7.8 4.2 6.3 5.4 5.8 7.2C4.1 8 3 9.7 3 11.6C3 12.8 3.5 13.9 4.3 14.8C4.1 16.2 4.7 17.7 5.9 18.6C6.7 19.3 7.8 19.8 9 19.8V17.5C8.3 17.5 7.6 17.2 7.1 16.7C6.4 16.1 6.1 15 6.3 14L7.5 14.2C7.3 14.6 7.2 15 7.2 15.5C7.2 16.3 7.9 17 8.7 17H10V14.7L12 15.9V18.2C12.3 18.2 12.7 18.2 13 18V15.7L15 14.5V17C16.2 16.5 17 15.3 17 14C17 13.7 16.9 13.4 16.8 13.1L18 12.4C18.6 13.3 19 14.3 19 15.5C19 17.4 17.7 19 16 19.6C15.4 21.2 13.8 22.3 12 22.3C10.7 22.3 9.5 21.7 8.8 20.7L10.3 19.6C10.7 20.1 11.3 20.4 12 20.4C13.2 20.4 14.2 19.6 14.6 18.5L13.1 17.6C12.8 17.8 12.4 17.9 12 17.9C11.2 17.9 10.5 17.4 10.2 16.7L11.7 15.8C11.8 15.9 11.9 15.9 12 15.9C12.6 15.9 13 15.5 13 14.9V12.6L11 11.4L9 12.6V14.9L7.5 14C7.5 13.8 7.5 13.6 7.5 13.4C7.5 12.1 8.6 11 9.9 11H11.5L12 10.1L10.5 9.2C10.2 9.4 9.8 9.5 9.4 9.5C8.6 9.5 7.9 9 7.6 8.3L9.1 7.4C9.2 7.5 9.3 7.5 9.4 7.5C10 7.5 10.4 7.9 10.4 8.5V10.2L12 11.1L13.6 10.2V8.5C13.6 7.9 14 7.5 14.6 7.5C14.7 7.5 14.8 7.5 14.9 7.4L16.4 8.3C16.1 9 15.4 9.5 14.6 9.5C14.2 9.5 13.8 9.4 13.5 9.2L12 10.1L12.5 11H14.1C15.4 11 16.5 12.1 16.5 13.4C16.5 13.6 16.5 13.8 16.5 14L15 14.9V12.6L13 11.4L11 12.6V14.9C11 15.5 11.4 15.9 12 15.9"
            fill="currentColor"
          />
        </svg>
      );

    case 'kimi':
      // Moonshot Kimi 科技紫渐变星芒标志
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 text-purple-400 ${className}`}
        >
          <path
            d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z"
            fill="currentColor"
          />
          <circle cx="12" cy="11" r="2.5" fill="#1e1b4b" />
          <path
            d="M19 17L20.2 20.3L23.5 21.5L20.2 22.7L19 26L17.8 22.7L14.5 21.5L17.8 20.3L19 17Z"
            transform="scale(0.5) translate(10, 10)"
            fill="#a855f7"
          />
        </svg>
      );

    case 'opencode':
      // OpenCode 炫酷命令行与代码符号
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 text-cyan-400 ${className}`}
        >
          <rect x="2" y="4" width="20" height="16" rx="4" stroke="currentColor" strokeWidth="2" />
          <path d="M7 9L10.5 12L7 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12.5 15H17" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case 'claude':
      // Anthropic Claude 暖珊瑚星火标志
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`shrink-0 text-amber-500 ${className}`}
        >
          <path
            d="M13.5 2.5L15 9.5L22 11L15 12.5L13.5 19.5L12 12.5L5 11L12 9.5L13.5 2.5Z"
            fill="currentColor"
          />
        </svg>
      );

    default:
      // 默认终端 Terminal
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-slate-400 ${className}`}
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
  }
};
