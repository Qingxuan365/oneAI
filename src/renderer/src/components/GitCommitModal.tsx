import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, GitBranch, GitCommitHorizontal, GitMerge, Loader2, RefreshCw } from 'lucide-react';
import type { GitChangeDiffResult, GitChangeStatus, GitStatusEntry, GitStatusResult } from '../../../shared/types';
import { t } from '../i18n';
import { Modal } from './Modal';

const MAX_DIFF_LINES = 6000;

function diffLineClass(line: string, isConflict: boolean): string {
  if (line.startsWith('@@')) return 'bg-accent/10 text-accent';
  if (/^(diff |index |--- |\+\+\+ |new file mode|deleted file mode|rename from|rename to|similarity index)/.test(line)) {
    return 'text-fg-subtle';
  }
  if (isConflict && /^[ +\-]{2}/.test(line)) {
    if (line.slice(0, 2).includes('+')) return 'bg-success/10 text-success';
    if (line.slice(0, 2).includes('-')) return 'bg-danger/10 text-danger';
  }
  if (!isConflict) {
    if (line.startsWith('+')) return 'bg-success/10 text-success';
    if (line.startsWith('-')) return 'bg-danger/10 text-danger';
  }
  return 'text-fg-muted';
}

function statusBadge(status: GitChangeStatus): { code: string; label: string; className: string } {
  switch (status) {
    case 'added':
      return { code: 'A', label: t('新增'), className: 'text-success' };
    case 'untracked':
      return { code: '?', label: t('未跟踪'), className: 'text-success' };
    case 'deleted':
      return { code: 'D', label: t('已删除'), className: 'text-danger' };
    case 'renamed':
      return { code: 'R', label: t('已重命名'), className: 'text-violet' };
    case 'conflicted':
      return { code: 'U', label: t('冲突'), className: 'text-danger' };
    default:
      return { code: 'M', label: t('已修改'), className: 'text-warning' };
  }
}

function splitEntryPath(relPath: string): { name: string; dir: string } {
  const slash = relPath.lastIndexOf('/');
  if (slash < 0) return { name: relPath, dir: '' };
  return { name: relPath.slice(slash + 1), dir: relPath.slice(0, slash) };
}

interface GitCommitModalProps {
  rootPath: string;
  onClose: () => void;
  onOpenConflicts?: () => void;
  onCommitted?: (branch: string | null) => void;
}

export function GitCommitModal({ rootPath, onClose, onOpenConflicts, onCommitted }: GitCommitModalProps) {
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState('');
  const [diff, setDiff] = useState<GitChangeDiffResult | null>(null);
  const [message, setMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [lastCommit, setLastCommit] = useState<{ hash: string; summary: string } | null>(null);
  const [revision, setRevision] = useState(0);

  const selectAllRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    initializedRef.current = false;
    setStatus(null);
    setCheckedPaths(new Set());
    setSelectedPath('');
    setDiff(null);
    setCommitError(null);
    setLastCommit(null);
  }, [rootPath]);

  useEffect(() => {
    let disposed = false;
    const readStatus = window.electronAPI?.readGitStatus;
    const request = readStatus ? readStatus(rootPath) : Promise.reject(new Error('unavailable'));
    void request.then((result) => {
      if (disposed) return;
      setStatus(result);
      if (!result.ok) {
        setSelectedPath('');
        setCheckedPaths(new Set());
        return;
      }
      const committable = result.entries.filter((entry) => entry.status !== 'conflicted');
      setCheckedPaths((prev) => {
        if (!initializedRef.current) {
          initializedRef.current = true;
          return new Set(committable.map((entry) => entry.path));
        }
        const next = new Set<string>();
        for (const entry of committable) {
          if (prev.has(entry.path)) next.add(entry.path);
        }
        if (next.size === 0 && committable.length > 0 && prev.size === 0) {
          for (const entry of committable) next.add(entry.path);
        }
        return next;
      });
      setSelectedPath((prev) => (
        result.entries.some((entry) => entry.path === prev) ? prev : (result.entries[0]?.path ?? '')
      ));
    }).catch(() => {
      if (!disposed) setStatus({ ok: false, error: '' });
    });
    return () => { disposed = true; };
  }, [rootPath, revision]);

  const selectedEntry: GitStatusEntry | undefined = useMemo(
    () => (status?.ok ? status.entries.find((entry) => entry.path === selectedPath) : undefined),
    [status, selectedPath],
  );

  useEffect(() => {
    const readDiff = window.electronAPI?.readGitChangeDiff;
    if (!status?.ok || !selectedPath || !readDiff) {
      setDiff(null);
      return;
    }
    let disposed = false;
    setDiff(null);
    void readDiff(rootPath, selectedPath).then((result) => {
      if (!disposed) setDiff(result);
    }).catch(() => {
      if (!disposed) setDiff({ ok: false, error: '' });
    });
    return () => { disposed = true; };
  }, [rootPath, status, selectedPath]);

  const entries = status?.ok ? status.entries : [];
  const committableEntries = useMemo(
    () => entries.filter((entry) => entry.status !== 'conflicted'),
    [entries],
  );
  const selectedForCommit = useMemo(
    () => committableEntries.filter((entry) => checkedPaths.has(entry.path)).map((entry) => entry.path),
    [committableEntries, checkedPaths],
  );

  const allChecked = committableEntries.length > 0 && selectedForCommit.length === committableEntries.length;
  const someChecked = selectedForCommit.length > 0 && !allChecked;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);

  const toggleAll = () => {
    if (allChecked) setCheckedPaths(new Set());
    else setCheckedPaths(new Set(committableEntries.map((entry) => entry.path)));
  };

  const toggleEntry = (relPath: string) => {
    setCheckedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });
  };

  const handleRefresh = () => {
    setStatus(null);
    setDiff(null);
    setCommitError(null);
    setRevision((v) => v + 1);
  };

  const hasConflicts = Boolean(status?.ok && status.hasConflicts);
  const canSubmit = Boolean(
    status?.ok
    && !hasConflicts
    && selectedForCommit.length > 0
    && message.trim().length > 0
    && !committing,
  );

  const handleCommit = async () => {
    const runCommit = window.electronAPI?.commitGitChanges;
    if (!canSubmit || !runCommit) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const result = await runCommit(rootPath, selectedForCommit, message);
      if (!result.ok) {
        setCommitError(result.error || t('Git 提交失败'));
        return;
      }
      setMessage('');
      setLastCommit({ hash: result.hash, summary: result.summary });
      initializedRef.current = false;
      setDiff(null);
      setRevision((v) => v + 1);
      onCommitted?.(status?.ok ? status.branch : null);
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : t('Git 提交失败'));
    } finally {
      setCommitting(false);
    }
  };

  const lines = diff?.ok && diff.diff ? diff.diff.replace(/\r?\n$/, '').split(/\r?\n/) : [];
  const isConflictDiff = selectedEntry?.status === 'conflicted';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('Git 提交')}
      titleId="git-commit-title"
      widthClass="max-w-5xl"
      bare
      icon={<GitCommitHorizontal size={16} className="shrink-0 text-accent" aria-hidden="true" />}
    >
      {/* 顶部仓库路径、当前分支与刷新 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-subtle" title={rootPath}>
          {rootPath}
        </span>
        {status?.ok && status.branch && (
          <span
            data-git-commit-branch
            className="flex max-w-[11rem] shrink-0 items-center gap-1 rounded-full border border-violet/30 bg-violet/10 px-2 py-0.5 font-mono text-2xs text-violet"
            title={t('Git 分支：{branch}', { branch: status.branch })}
          >
            <GitBranch size={10} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{status.branch}</span>
          </span>
        )}
        <button
          type="button"
          aria-label={t('刷新变更')}
          title={t('刷新变更')}
          className="icon-btn h-6 w-6"
          onClick={handleRefresh}
          disabled={committing}
        >
          <RefreshCw size={14} className={!status ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </div>

      {/* 未解决冲突阻断提示 */}
      {hasConflicts && (
        <div
          role="alert"
          data-git-commit-conflict-banner
          className="flex shrink-0 items-center justify-between gap-3 border-b border-danger/30 bg-danger/10 px-4 py-2 text-xs text-danger"
        >
          <span className="flex min-w-0 items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
            <span>{t('当前存在未解决的 Git 冲突，请先解决冲突后再提交')}</span>
          </span>
          {onOpenConflicts && (
            <button
              type="button"
              onClick={onOpenConflicts}
              className="btn-ghost shrink-0 gap-1 border border-danger/40 px-2.5 py-1 text-xs text-danger hover:bg-danger/15"
            >
              <GitMerge size={12} aria-hidden="true" />
              <span>{t('Git 冲突对比')}</span>
            </button>
          )}
        </div>
      )}

      {/* 主体区域：变更列表 + 差异预览 */}
      {!status?.ok || entries.length === 0 ? (
        <div className="px-4 py-8 text-ui text-fg-muted" role="status">
          {!status ? (
            t('正在读取变更…')
          ) : status.ok ? (
            <div className="space-y-2">
              {lastCommit && (
                <p data-git-commit-success className="flex items-center gap-1.5 text-xs text-success">
                  <Check size={14} className="shrink-0" aria-hidden="true" />
                  <span>{t('已提交 {hash}：{summary}', { hash: lastCommit.hash, summary: lastCommit.summary })}</span>
                </p>
              )}
              <p>{t('当前没有可提交的改动')}</p>
            </div>
          ) : (
            <>
              <p className="text-danger">{t('无法读取 Git 状态')}</p>
              {status.error && <p className="mt-1 whitespace-pre-wrap break-words text-xs">{status.error}</p>}
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex h-[min(52vh,32rem)] min-h-0 flex-col overflow-hidden sm:flex-row">
            {/* 左栏：变更文件清单 */}
            <div className="flex max-h-44 shrink-0 flex-col border-b border-line sm:h-full sm:max-h-none sm:w-72 sm:border-b-0 sm:border-r">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-3 py-1.5 text-xs">
                <label className="flex cursor-pointer items-center gap-2 text-fg-muted select-none">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allChecked}
                    disabled={committableEntries.length === 0 || committing}
                    onChange={toggleAll}
                    aria-label={t('全选变更文件')}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  <span>{t('已选 {selected} / {total} 个文件', { selected: selectedForCommit.length, total: committableEntries.length })}</span>
                </label>
              </div>
              <div aria-label={t('变更文件')} className="min-h-0 flex-1 overflow-auto py-1">
                {entries.map((entry) => {
                  const badge = statusBadge(entry.status);
                  const isSelected = entry.path === selectedPath;
                  const isConflicted = entry.status === 'conflicted';
                  const isChecked = !isConflicted && checkedPaths.has(entry.path);
                  const { name, dir } = splitEntryPath(entry.path);
                  const titleText = entry.originalPath
                    ? `${entry.originalPath} -> ${entry.path}`
                    : entry.path;

                  return (
                    <div
                      key={entry.path}
                      data-git-change-row={entry.path}
                      className={`flex items-center gap-1.5 px-2.5 py-1 transition-colors ${
                        isSelected ? 'bg-selected text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isConflicted || committing}
                        onChange={() => toggleEntry(entry.path)}
                        aria-label={t('选择文件 {path}', { path: entry.path })}
                        className="h-3.5 w-3.5 shrink-0 accent-accent"
                      />
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        title={titleText}
                        onClick={() => {
                          if (entry.path !== selectedPath) {
                            setDiff(null);
                            setSelectedPath(entry.path);
                          }
                        }}
                        className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left font-mono text-xs outline-none"
                      >
                        <span className="truncate">{name}</span>
                        {dir && <span className="min-w-0 truncate text-2xs text-fg-faint">{dir}</span>}
                      </button>
                      <span
                        title={badge.label}
                        aria-label={badge.label}
                        className={`shrink-0 font-mono text-2xs font-semibold ${badge.className}`}
                      >
                        {badge.code}
                      </span>
                    </div>
                  );
                })}
                {status.truncated && status.totalCount && (
                  <p className="px-3 py-1.5 text-2xs text-fg-faint">
                    {t('仅显示前 {shown} / {total} 项', { shown: entries.length, total: status.totalCount })}
                  </p>
                )}
              </div>
            </div>

            {/* 右栏：选中文件的差异预览 */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs text-fg-subtle">
                <p className="min-w-0 truncate font-mono text-fg" title={selectedEntry?.originalPath ? `${selectedEntry.originalPath} -> ${selectedPath}` : selectedPath}>
                  {selectedEntry?.originalPath ? `${selectedEntry.originalPath} → ${selectedPath}` : selectedPath}
                </p>
                {selectedEntry && (
                  <span className={`shrink-0 text-2xs font-medium ${statusBadge(selectedEntry.status).className}`}>
                    {statusBadge(selectedEntry.status).label}
                  </span>
                )}
              </div>
              {!diff ? (
                <div className="min-h-0 overflow-auto px-3 py-3 text-ui text-fg-muted" role="status">
                  {t('正在读取差异…')}
                </div>
              ) : !diff.ok ? (
                <div className="min-h-0 overflow-auto px-3 py-3 text-ui text-fg-muted" role="status">
                  <p className="text-danger">{t('无法读取 Git 差异')}</p>
                  {diff.error && <p className="mt-1 whitespace-pre-wrap break-words text-xs">{diff.error}</p>}
                </div>
              ) : !diff.diff ? (
                <div className="min-h-0 overflow-auto px-3 py-3 text-ui text-fg-muted" role="status">
                  {t('此文件没有可显示的文本差异')}
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto" tabIndex={0}>
                  <pre className="min-w-max py-1 font-mono text-xs leading-5" data-git-change-diff>
                    {lines.slice(0, MAX_DIFF_LINES).map((line, index) => (
                      <span key={index} className={`block px-3 ${diffLineClass(line, isConflictDiff)}`}>
                        {line || ' '}
                      </span>
                    ))}
                  </pre>
                  {lines.length > MAX_DIFF_LINES && (
                    <p className="px-3 py-2 text-xs text-fg-subtle">
                      {t('仅显示前 {count} 行差异', { count: MAX_DIFF_LINES })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 底部提交说明与提交操作栏 */}
          <div className="shrink-0 space-y-2.5 border-t border-line bg-surface px-4 py-3">
            <textarea
              ref={messageInputRef}
              autoFocus
              rows={3}
              value={message}
              disabled={committing || hasConflicts}
              onChange={(e) => {
                setMessage(e.target.value);
                if (commitError) setCommitError(null);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleCommit();
                }
              }}
              aria-label={t('提交说明')}
              placeholder={t('输入提交说明（Ctrl + Enter 提交）')}
              className="input w-full resize-none font-mono text-xs leading-5 select-text"
            />
            {commitError && (
              <p role="alert" data-git-commit-error className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs text-danger">
                {commitError}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 text-xs">
                {lastCommit ? (
                  <span data-git-commit-success className="flex items-center gap-1.5 truncate text-success" title={`${lastCommit.hash}: ${lastCommit.summary}`}>
                    <Check size={13} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">{t('已提交 {hash}：{summary}', { hash: lastCommit.hash, summary: lastCommit.summary })}</span>
                  </span>
                ) : (
                  <span className="text-fg-faint">{t('仅提交勾选的文件到本地仓库，不会自动推送')}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={onClose} disabled={committing} className="btn-ghost">
                  {t('关闭')}
                </button>
                <button
                  type="button"
                  data-git-commit-submit
                  disabled={!canSubmit}
                  onClick={() => void handleCommit()}
                  className="btn-primary gap-1.5"
                >
                  {committing && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                  <span>
                    {committing
                      ? t('正在提交…')
                      : selectedForCommit.length > 0
                        ? t('提交 ({n})', { n: selectedForCommit.length })
                        : t('提交')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
