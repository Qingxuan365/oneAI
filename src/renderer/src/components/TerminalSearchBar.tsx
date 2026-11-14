import React, { useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, X, CaseSensitive, Regex, Search } from 'lucide-react';
import { t } from '../i18n';

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
  /** 匹配数量或「无结果」等状态文字，为空时不显示 */
  resultText?: string;
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
  resultText,
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

  const toggle = (active: boolean) => `icon-btn ${active ? 'bg-primary text-white enabled:hover:bg-primary-hover enabled:hover:text-white' : ''}`;

  return (
    <div role="search" className="absolute right-6 top-3 z-30 flex items-center gap-1 rounded-lg border border-line-strong bg-elevated/95 p-1.5 text-xs text-fg shadow-xl backdrop-blur">
      <label className="flex items-center gap-1.5 rounded-md border border-line-strong bg-canvas px-2 focus-within:border-accent">
        <Search size={13} className="shrink-0 text-fg-faint" />
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
          placeholder={t('在终端中搜索')}
          aria-label={t('在终端中搜索')}
          className="h-7 w-52 bg-transparent font-mono text-xs text-fg placeholder-fg-faint select-text !outline-none"
        />
      </label>

      {resultText && (
        <span role="status" className={`min-w-[3.5rem] px-1 text-center tabular-nums ${resultText === t('无结果') || resultText === t('正则无效') ? 'text-danger' : 'text-fg-subtle'}`}>{resultText}</span>
      )}

      <button type="button" onClick={onToggleMatchCase} aria-pressed={matchCase} title={t('区分大小写')} aria-label={t('区分大小写')} className={toggle(matchCase)}>
        <CaseSensitive size={15} />
      </button>
      <button type="button" onClick={onToggleRegex} aria-pressed={useRegex} title={t('使用正则表达式')} aria-label={t('使用正则表达式')} className={toggle(useRegex)}>
        <Regex size={15} />
      </button>

      <div className="mx-0.5 h-4 w-px bg-line-strong" />

      <button type="button" onClick={onFindPrevious} title={t('上一个 (Shift+Enter)')} aria-label={t('上一个匹配')} className="icon-btn">
        <ChevronUp size={15} />
      </button>
      <button type="button" onClick={onFindNext} title={t('下一个 (Enter)')} aria-label={t('下一个匹配')} className="icon-btn">
        <ChevronDown size={15} />
      </button>
      <button type="button" onClick={onClose} title={t('关闭搜索 (Esc)')} aria-label={t('关闭搜索')} className="icon-btn">
        <X size={15} />
      </button>
    </div>
  );
};
