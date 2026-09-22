import React, { useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, X, CaseSensitive, Regex } from 'lucide-react';

interface TerminalSearchBarProps {
  isOpen: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onFindNext: () => void;
  onFindPrevious: () => void;
  onClose: () => void;
  matchCase: boolean;
  onToggleMatchCase: () => void;
  useRegex: boolean;
  onToggleRegex: () => void;
}

export const TerminalSearchBar: React.FC<TerminalSearchBarProps> = ({
  isOpen,
  searchQuery,
  onSearchChange,
  onFindNext,
  onFindPrevious,
  onClose,
  matchCase,
  onToggleMatchCase,
  useRegex,
  onToggleRegex,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-2 right-4 z-30 flex items-center space-x-1.5 bg-[#161b26]/95 backdrop-blur border border-[#2a3346] px-2 py-1.5 rounded-md shadow-2xl text-xs text-slate-200 animate-in fade-in slide-in-from-top-2 duration-150">
      {/* 搜索输入框 */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (e.shiftKey) {
                onFindPrevious();
              } else {
                onFindNext();
              }
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="在终端搜索..."
          className="w-48 bg-[#0e1117] border border-[#2d3748] rounded px-2 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-xs font-mono"
        />
      </div>

      {/* 大小写敏感切换 */}
      <button
        onClick={onToggleMatchCase}
        title={matchCase ? '区分大小写（已开启）' : '区分大小写（已关闭）'}
        className={`p-1 rounded transition-colors ${
          matchCase
            ? 'bg-blue-600 text-white'
            : 'text-slate-400 hover:text-slate-200 hover:bg-[#202736]'
        }`}
      >
        <CaseSensitive size={14} />
      </button>

      {/* 正则表达式切换 */}
      <button
        onClick={onToggleRegex}
        title={useRegex ? '正则表达式（已开启）' : '正则表达式（已关闭）'}
        className={`p-1 rounded transition-colors ${
          useRegex
            ? 'bg-blue-600 text-white'
            : 'text-slate-400 hover:text-slate-200 hover:bg-[#202736]'
        }`}
      >
        <Regex size={14} />
      </button>

      <div className="h-3.5 w-px bg-[#2a3346] my-auto" />

      {/* 上一个 */}
      <button
        onClick={onFindPrevious}
        title="查找上一个 (Shift+Enter)"
        className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#202736] rounded transition-colors"
      >
        <ChevronUp size={14} />
      </button>

      {/* 下一个 */}
      <button
        onClick={onFindNext}
        title="查找下一个 (Enter)"
        className="p-1 text-slate-400 hover:text-slate-200 hover:bg-[#202736] rounded transition-colors"
      >
        <ChevronDown size={14} />
      </button>

      <div className="h-3.5 w-px bg-[#2a3346] my-auto" />

      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        title="关闭搜索 (Esc)"
        className="p-1 text-slate-400 hover:text-red-400 hover:bg-[#202736] rounded transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
};
