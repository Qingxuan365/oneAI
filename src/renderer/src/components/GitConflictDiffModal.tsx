import { useEffect, useState } from 'react';
import { GitMerge, RefreshCw } from 'lucide-react';
import type { GitConflictDiffResult, GitConflictFilesResult } from '../../../shared/types';
import { t } from '../i18n';
import { Modal } from './Modal';

const MAX_DIFF_LINES = 6000;

function diffLineClass(line: string): string {
  if (line.startsWith('@@')) return 'bg-accent/10 text-accent';
  if (/^(diff |index |--- |\+\+\+ )/.test(line)) return 'text-fg-subtle';
  if (/^[ +\-]{2}/.test(line)) {
    if (line.slice(0, 2).includes('+')) return 'bg-success/10 text-success';
    if (line.slice(0, 2).includes('-')) return 'bg-danger/10 text-danger';
  }
  return 'text-fg-muted';
}

interface GitConflictDiffModalProps {
  rootPath: string;
  onClose: () => void;
}

export function GitConflictDiffModal({ rootPath, onClose }: GitConflictDiffModalProps) {
  const [files, setFiles] = useState<GitConflictFilesResult | null>(null);
  const [selected, setSelected] = useState('');
  const [diff, setDiff] = useState<GitConflictDiffResult | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let disposed = false;
    const list = window.electronAPI?.listGitConflicts;
    const request = list ? list(rootPath) : Promise.reject();
    void request.then((result) => {
      if (disposed) return;
      setFiles(result);
      setSelected((previous) => result.ok ? (result.files.includes(previous) ? previous : result.files[0] ?? '') : '');
    }).catch(() => {
      if (!disposed) setFiles({ ok: false, error: '' });
    });
    return () => { disposed = true; };
  }, [rootPath, revision]);

  useEffect(() => {
    const read = window.electronAPI?.readGitConflictDiff;
    if (!files?.ok || !selected || !read) return;
    let disposed = false;
    void read(rootPath, selected).then((result) => {
      if (!disposed) setDiff(result);
    }).catch(() => {
      if (!disposed) setDiff({ ok: false, error: '' });
    });
    return () => { disposed = true; };
  }, [rootPath, files, selected]);

  const lines = diff?.ok && diff.diff ? diff.diff.replace(/\r?\n$/, '').split(/\r?\n/) : [];

  return (
    <Modal isOpen onClose={onClose} title={t('Git 冲突对比')} titleId="git-conflict-title" widthClass="max-w-5xl" bare
      icon={<GitMerge size={16} className="shrink-0 text-accent" aria-hidden="true" />}>
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-subtle" title={rootPath}>{rootPath}</span>
        <button type="button" aria-label={t('刷新冲突')} title={t('刷新冲突')} className="icon-btn h-6 w-6"
          onClick={() => { setFiles(null); setDiff(null); setRevision((value) => value + 1); }}>
          <RefreshCw size={14} aria-hidden="true" />
        </button>
      </div>
      {!files?.ok || files.files.length === 0 ? (
        <div className="px-4 py-6 text-ui text-fg-muted" role="status">
          {!files ? t('正在读取冲突…') : files.ok ? t('当前没有未解决的 Git 文件冲突') : (
            <><p className="text-danger">{t('无法读取 Git 冲突')}</p>{files.error && <p className="mt-1 whitespace-pre-wrap break-words">{files.error}</p>}</>
          )}
        </div>
      ) : (
        <div className="flex h-[min(62vh,40rem)] min-h-0 flex-col overflow-hidden sm:flex-row">
          <div aria-label={t('冲突文件')} className="max-h-32 shrink-0 overflow-auto border-b border-line py-1 sm:h-full sm:max-h-none sm:w-52 sm:border-b-0 sm:border-r">
            {files.files.map((file) => (
              <button key={file} type="button" aria-pressed={file === selected} title={file}
                onClick={() => { if (file !== selected) { setDiff(null); setSelected(file); } }}
                className={`block w-full truncate px-3 py-1.5 text-left font-mono text-xs hover:bg-hover ${file === selected ? 'bg-selected text-accent' : 'text-fg-muted'}`}>
                {file}
              </button>
            ))}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
            <div className="shrink-0 border-b border-line px-3 py-2 text-xs text-fg-subtle">
              <p className="truncate font-mono text-fg" title={selected}>{selected}</p>
              <p className="mt-1">{t('前两列分别显示工作区相对两个冲突版本的变化。')}</p>
            </div>
            {!diff?.ok || !diff.diff ? (
              <div className="min-h-0 overflow-auto px-3 py-3 text-ui text-fg-muted" role="status">
                {!diff ? t('正在读取差异…') : diff.ok ? t('此文件没有可显示的文本差异') : (
                  <><p className="text-danger">{t('无法读取 Git 差异')}</p>{diff.error && <p className="mt-1 whitespace-pre-wrap break-words">{diff.error}</p>}</>
                )}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto" tabIndex={0}>
                <pre className="min-w-max py-1 font-mono text-xs leading-5" data-git-conflict-diff>
                  {lines.slice(0, MAX_DIFF_LINES).map((line, index) => (
                    <span key={index} className={`block px-3 ${diffLineClass(line)}`}>{line || ' '}</span>
                  ))}
                </pre>
                {lines.length > MAX_DIFF_LINES && <p className="px-3 py-2 text-xs text-fg-subtle">{t('仅显示前 {count} 行差异', { count: MAX_DIFF_LINES })}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
