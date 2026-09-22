import React from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({ size = 20, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
    >
      {/* 极客暗黑质感圆角矩形底座 */}
      <rect width="32" height="32" rx="7.5" fill="#0E121A" stroke="#263145" strokeWidth="1.2" />
      {/* 霓虹蓝绿流光终端提示符 >_ */}
      <path
        d="M8.5 10L14.5 16L8.5 22"
        stroke="url(#onedesktop-terminal-glow)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 22H23.5"
        stroke="url(#onedesktop-terminal-glow)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient id="onedesktop-terminal-glow" x1="8.5" y1="10" x2="23.5" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="1" stopColor="#34D399" />
        </linearGradient>
      </defs>
    </svg>
  );
};
