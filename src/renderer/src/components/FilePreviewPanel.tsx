import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { FilePreviewResult } from '../types';
import { PreviewMinimap } from './PreviewMinimap';
import { t } from '../i18n';
import { highlightPreview } from '../previewHighlight';

interface FilePreviewPanelProps {
  cwd: string;
  filePath: string;
  /** 从终端点击 `文件:行号` 时定位并高亮的行（从 1 开始） */
  line?: number;
  /** 每次从终端点击都会变化，用来重新读取同一个文件 */
  openedAt?: number;
  /** 是否在右侧显示代码缩略图，由「设置 → 终端 → 文件预览」控制，默认显示 */
  minimap?: boolean;
  width: number;
  onResize: (width: number) => void;
  onClose: () => void;
}

const MIN_WIDTH = 280;

function formatSize(size?: number): string {
  if (size === undefined) return '';
  return size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** 终端右侧的只读文件预览面板：文本、图片，其他类型给出提示。 */
export const FilePreviewPanel: React.FC<FilePreviewPanelProps> = ({ cwd, filePath, line, openedAt, minimap = true, width, onResize, onClose }) => {
  const [result, setResult] = useState<FilePreviewResult | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const targetLineRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textContent = useMemo(() => (result?.kind === 'text' ? result.content.replace(/\r\n?/g, '\n') : ''), [result]);
  const lines = useMemo(() => (result?.kind === 'text' ? textContent.split('\n') : []), [result, textContent]);
  const highlightedLines = useMemo(() => (result?.kind === 'text' ? highlightPreview(textContent, result.path || filePath) : null), [result, textContent, filePath]);

  // 内容加载完成或目标行变化后，把目标行滚动到视野中央
  useEffect(() => {
    if (result?.kind === 'text') targetLineRef.current?.scrollIntoView({ block: 'center' });
  }, [result, line]);

  // 换文件时先清空；同一文件再次点击或手动刷新时保留旧内容直到新内容到达，避免闪烁
  useEffect(() => { setResult(null); }, [cwd, filePath]);
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.readPreviewFile?.(cwd, filePath).then((value) => {
      if (!cancelled) setResult(value);
    });
    return () => { cancelled = true; };
  }, [cwd, filePath, openedAt, reloadCount]);

  const startDrag = (event: React.MouseEvent) => {
    event.preventDefault();
    const onMove = (e: MouseEvent) => onResize(Math.max(MIN_WIDTH, Math.min(window.innerWidth * 0.6, window.innerWidth - e.clientX)));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const name = filePath.split(/[\\/]/).pop() || filePath;
  const notice = (text: string) => <p className="p-4 text-ui text-fg-subtle">{text}</p>;

  let body: React.ReactNode = notice(t('读取中…'));
  if (result?.kind === 'text') {
    body = (
      <pre className="preview-code m-0 min-h-full select-text whitespace-pre-wrap break-all p-3 font-mono text-xs leading-relaxed text-fg">
        {lines.map((text, index) => {
          const isTarget = index + 1 === line;
          return (
            <div key={index} ref={isTarget ? targetLineRef : undefined} className={isTarget ? 'bg-accent/20' : undefined}>{highlightedLines?.[index]?.length ? highlightedLines[index].map((token, i) => (token.className ? <span key={i} className={token.className}>{token.text}</span> : token.text)) : text || ' '}</div>
          );
        })}
      </pre>
    );
  } else if (result?.kind === 'image') {
    body = <div className="flex justify-center p-3"><img src={result.dataUrl} alt={name} className="max-w-full" /></div>;
  } else if (result?.kind === 'binary') {
    body = notice(t('二进制文件，不支持预览。'));
  } else if (result?.kind === 'too-large') {
    body = notice(t('文件过大（{size}），不支持预览。', { size: formatSize(result.size) }));
  } else if (result?.kind === 'error') {
    body = notice(result.message || t('读取失败'));
  }

  return (
    <aside className="relative flex h-full shrink-0 flex-col border-l border-line bg-surface" style={{ width }} aria-label={t('文件预览')}>
      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startDrag}
        className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-accent/30"
      />
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="min-w-0 flex-1 truncate text-ui font-medium text-fg" title={filePath}>{name}</span>
        {result && 'size' in result && <span className="shrink-0 text-xs text-fg-faint">{formatSize(result.size)}</span>}
        <button type="button" onClick={() => setReloadCount((count) => count + 1)} className="icon-btn" aria-label={t('重新读取文件')} title={t('重新读取文件')}>
          <RefreshCw size={13} />
        </button>
        <button type="button" onClick={onClose} className="icon-btn" aria-label={t('关闭预览')} title={t('关闭预览')}>
          <X size={14} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">{body}</div>
        {minimap && result?.kind === 'text' && <PreviewMinimap lines={lines} scrollRef={scrollRef} targetLine={line} />}
      </div>
    </aside>
  );
};
