import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Copy,
  CornerDownLeft,
  File,
  FileArchive,
  FileCode2,
  FileCog,
  FileStack,
  FileImage,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Modal } from './Modal';
import { DirectoryTreeEntry } from '../types';
import { folderKey, folderName } from '../workspaceState';
import { t } from '../i18n';
import type { GitLocalBranchesResult } from '../../../shared/types';

interface ProjectTreeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  gitBranch?: string | null;
  onGitBranchChanged?: (dir: string, branch: string) => void;
  onOpenGitCommit?: () => void;
  onOpenGitConflicts?: () => void;
  activePreviewPath?: string | null;
  hasActiveTerminal: boolean;
  onPreviewFile: (cwd: string, filePath: string) => void;
  onInsertPath?: (relPath: string) => void;
  onRevealInExplorer?: (targetPath: string) => void;
  /** 传入当前语言，使 React.memo 在切换语言时同步重绘 */
  language?: string;
}

interface DirState {
  entries: DirectoryTreeEntry[];
  loading?: boolean;
  error?: string;
  truncated?: boolean;
  totalCount?: number;
}

interface ProjectCache {
  expanded: Set<string>;
  dirs: Map<string, DirState>;
}

type FlatRow =
  | {
      kind: 'entry';
      key: string;
      entry: DirectoryTreeEntry;
      depth: number;
      isExpanded: boolean;
      isLoading: boolean;
      parentPath: string;
      dimmed: boolean;
    }
  | { kind: 'empty'; key: string; depth: number }
  | { kind: 'error'; key: string; depth: number; message: string }
  | { kind: 'truncated'; key: string; depth: number; shown: number; total: number };

interface ContextMenuState {
  x: number;
  y: number;
  entry: DirectoryTreeEntry;
  isExpanded: boolean;
}

type FeedbackState = {
  key: string;
  kind: 'inserted' | 'copied-rel' | 'copied-full' | 'copied-file' | 'copy-failed';
};

const MAX_CACHED_PROJECTS = 20;
const EMPTY_EXPANDED: ReadonlySet<string> = new Set();
const EMPTY_DIRS: ReadonlyMap<string, DirState> = new Map();

const CODE_EXTS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts',
  'py', 'rs', 'go', 'java', 'kt', 'kts', 'swift', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs',
  'css', 'scss', 'sass', 'less', 'html', 'htm', 'vue', 'svelte', 'astro',
  'sh', 'bash', 'zsh', 'ps1', 'psm1', 'bat', 'cmd', 'sql', 'graphql', 'gql', 'rb', 'php', 'lua',
]);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);
const JSON_EXTS = new Set(['json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'xml']);
const TEXT_EXTS = new Set(['md', 'mdx', 'txt', 'rst', 'log', 'csv', 'tsv']);
const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'bz2', 'xz', 'zst', '7z', 'rar']);
const CONFIG_EXTS = new Set(['env', 'ini', 'cfg', 'conf', 'properties', 'lock', 'gitignore', 'gitattributes', 'npmrc', 'editorconfig']);
const CONFIG_NAMES = new Set(['dockerfile', 'makefile', 'gnumakefile', 'justfile', 'procfile', 'rakefile', 'gemfile']);

function renderEntryIcon(entry: DirectoryTreeEntry, isExpanded: boolean): React.ReactNode {
  if (entry.isDir) {
    return isExpanded
      ? <FolderOpen size={15} className="shrink-0 text-accent" aria-hidden="true" />
      : <Folder size={15} className="shrink-0 text-accent" aria-hidden="true" />;
  }
  const lower = entry.name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot + 1) : '';
  if (IMAGE_EXTS.has(ext)) return <FileImage size={15} className="shrink-0 text-violet" aria-hidden="true" />;
  if (JSON_EXTS.has(ext)) return <FileJson size={15} className="shrink-0 text-warning" aria-hidden="true" />;
  if (CODE_EXTS.has(ext)) return <FileCode2 size={15} className="shrink-0 text-accent" aria-hidden="true" />;
  if (TEXT_EXTS.has(ext)) return <FileText size={15} className="shrink-0 text-success" aria-hidden="true" />;
  if (ARCHIVE_EXTS.has(ext)) return <FileArchive size={15} className="shrink-0 text-fg-faint" aria-hidden="true" />;
  if (CONFIG_EXTS.has(ext) || CONFIG_NAMES.has(lower) || entry.name.startsWith('.')) {
    return <FileCog size={15} className="shrink-0 text-fg-subtle" aria-hidden="true" />;
  }
  return <File size={15} className="shrink-0 text-fg-subtle" aria-hidden="true" />;
}

function getTreeItemButtons(container: HTMLElement | null): HTMLButtonElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[role="treeitem"]'));
}

export const ProjectTreeDrawer: React.FC<ProjectTreeDrawerProps> = React.memo(({
  isOpen,
  onClose,
  rootPath,
  gitBranch,
  onGitBranchChanged,
  onOpenGitCommit,
  onOpenGitConflicts,
  activePreviewPath,
  hasActiveTerminal,
  onPreviewFile,
  onInsertPath,
  onRevealInExplorer,
}) => {
  const cacheRef = useRef<Map<string, ProjectCache>>(new Map());
  const dirSeqRef = useRef<Map<string, number>>(new Map());
  const mountedRef = useRef(true);
  const treeRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const feedbackTimerRef = useRef(0);

  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [gitBranches, setGitBranches] = useState<{
    root: string;
    result: GitLocalBranchesResult;
  } | null>(null);
  const [gitSwitchError, setGitSwitchError] = useState<{ root: string; message: string; switched?: boolean } | null>(null);
  const [switchingGitBranch, setSwitchingGitBranch] = useState(false);
  const [gitChangeCount, setGitChangeCount] = useState<{ root: string; count: number } | null>(null);

  const bump = useCallback(() => {
    if (mountedRef.current) setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const ensureProjectCache = useCallback((projKey: string): ProjectCache => {
    const map = cacheRef.current;
    const existing = map.get(projKey);
    if (existing) {
      map.delete(projKey);
      map.set(projKey, existing);
      return existing;
    }
    const created: ProjectCache = { expanded: new Set(), dirs: new Map() };
    map.set(projKey, created);
    while (map.size > MAX_CACHED_PROJECTS) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
    return created;
  }, []);

  const fetchDir = useCallback(async (
    targetRoot: string,
    relDir: string,
    opts?: { silent?: boolean; pruneIfInvalid?: boolean },
  ): Promise<boolean> => {
    const projKey = folderKey(targetRoot);
    const seqKey = `${projKey}\0${relDir}`;
    const seq = (dirSeqRef.current.get(seqKey) ?? 0) + 1;
    dirSeqRef.current.set(seqKey, seq);

    const cache = ensureProjectCache(projKey);
    const prev = cache.dirs.get(relDir);
    if (!opts?.silent) {
      cache.dirs.set(relDir, {
        entries: prev?.entries ?? [],
        truncated: prev?.truncated,
        totalCount: prev?.totalCount,
        loading: true,
      });
      bump();
    }

    const listDirectory = window.electronAPI?.listDirectory;
    if (!listDirectory) {
      if (!mountedRef.current || dirSeqRef.current.get(seqKey) !== seq) return false;
      cache.dirs.set(relDir, { entries: [], error: t('读取失败') });
      bump();
      return false;
    }

    try {
      const res = await listDirectory(targetRoot, relDir);
      if (!mountedRef.current || dirSeqRef.current.get(seqKey) !== seq) return false;
      const latest = ensureProjectCache(projKey);
      if (res.ok) {
        latest.dirs.set(relDir, {
          entries: res.entries,
          truncated: res.truncated,
          totalCount: res.totalCount,
        });
        bump();
        return true;
      }
      if (opts?.pruneIfInvalid && relDir !== '') {
        for (const key of [...latest.expanded]) {
          if (key === relDir || key.startsWith(`${relDir}/`)) latest.expanded.delete(key);
        }
        for (const key of [...latest.dirs.keys()]) {
          if (key === relDir || key.startsWith(`${relDir}/`)) latest.dirs.delete(key);
        }
      } else {
        latest.dirs.set(relDir, {
          entries: prev?.entries ?? [],
          error: res.error || t('读取失败'),
        });
      }
      bump();
      return false;
    } catch (error) {
      if (!mountedRef.current || dirSeqRef.current.get(seqKey) !== seq) return false;
      const latest = ensureProjectCache(projKey);
      latest.dirs.set(relDir, {
        entries: prev?.entries ?? [],
        error: error instanceof Error ? error.message : t('读取失败'),
      });
      bump();
      return false;
    }
  }, [ensureProjectCache, bump]);

  const refreshAll = useCallback(async (targetRoot: string, silentWhenCached: boolean) => {
    const projKey = folderKey(targetRoot);
    const cache = ensureProjectCache(projKey);
    const dirsToLoad = ['', ...cache.expanded];
    setRefreshing(true);
    try {
      await Promise.all(
        dirsToLoad.map((relDir) =>
          fetchDir(targetRoot, relDir, {
            silent: silentWhenCached && cache.dirs.has(relDir),
            pruneIfInvalid: relDir !== '',
          }),
        ),
      );
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [ensureProjectCache, fetchDir]);

  useEffect(() => {
    if (!isOpen) {
      setContextMenu(null);
      return;
    }
    void refreshAll(rootPath, true);
  }, [isOpen, rootPath, refreshAll]);

  useEffect(() => {
    setFilter('');
    setContextMenu(null);
  }, [rootPath]);

  useEffect(() => {
    const list = window.electronAPI?.listLocalGitBranches;
    if (!isOpen || !gitBranch || !list) return;
    let disposed = false;
    void list(rootPath).then((result) => {
      if (!disposed) setGitBranches({ root: rootPath, result });
    }).catch(() => {
      if (!disposed) setGitBranches({ root: rootPath, result: { ok: false, error: '' } });
    });
    return () => { disposed = true; };
  }, [isOpen, rootPath, gitBranch]);

  const refreshGitChangeCount = useCallback((targetRoot: string) => {
    const readStatus = window.electronAPI?.readGitStatus;
    if (!gitBranch || !readStatus) return;
    void readStatus(targetRoot).then((result) => {
      if (!mountedRef.current) return;
      if (result.ok) {
        setGitChangeCount({ root: targetRoot, count: result.totalCount ?? result.entries.length });
      } else {
        setGitChangeCount(null);
      }
    }).catch(() => {
      if (mountedRef.current) setGitChangeCount(null);
    });
  }, [gitBranch]);

  useEffect(() => {
    if (!isOpen || !gitBranch) return;
    refreshGitChangeCount(rootPath);
  }, [isOpen, rootPath, gitBranch, refreshGitChangeCount]);

  useEffect(() => {
    if (isOpen) setGitSwitchError(null);
  }, [isOpen, rootPath]);

  const handleSwitchGitBranch = async (branch: string) => {
    const switchBranch = window.electronAPI?.switchLocalGitBranch;
    if (!branch || switchingGitBranch || !switchBranch) return;
    setSwitchingGitBranch(true);
    setGitSwitchError(null);
    try {
      const result = await switchBranch(rootPath, branch);
      if (!result.ok) {
        setGitSwitchError({ root: rootPath, message: result.error, switched: Boolean(result.currentBranch) });
      }
      const currentBranch = result.ok ? branch : result.currentBranch;
      if (!currentBranch) return;
      setGitBranches((state) => state?.root === rootPath && state.result.ok
        ? { root: rootPath, result: { ...state.result, currentBranch } }
        : state);
      onGitBranchChanged?.(rootPath, currentBranch);
      await refreshAll(rootPath, false);
      refreshGitChangeCount(rootPath);
    } catch {
      setGitSwitchError({ root: rootPath, message: '' });
    } finally {
      setSwitchingGitBranch(false);
    }
  };

  useEffect(() => {
    if (!contextMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [contextMenu]);

  const showFeedback = useCallback((key: string, kind: FeedbackState['kind']) => {
    setFeedback({ key, kind });
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setFeedback(null);
    }, 1500);
  }, []);

  const copyText = useCallback(async (text: string, key: string, kind: 'copied-rel' | 'copied-full') => {
    try {
      if (window.electronAPI?.writeClipboardText) {
        const ok = await window.electronAPI.writeClipboardText(text);
        if (!ok) throw new Error('Clipboard write rejected');
      } else {
        await navigator.clipboard.writeText(text);
      }
      showFeedback(key, kind);
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        showFeedback(key, kind);
      } catch {
        showFeedback(key, 'copy-failed');
      }
    }
  }, [showFeedback]);

  const copyFile = useCallback(async (entry: DirectoryTreeEntry) => {
    try {
      const ok = await window.electronAPI?.copyProjectFile?.(rootPath, entry.relPath);
      showFeedback(entry.relPath, ok ? 'copied-file' : 'copy-failed');
    } catch {
      showFeedback(entry.relPath, 'copy-failed');
    }
  }, [rootPath, showFeedback]);

  const handleInsert = useCallback((entry: DirectoryTreeEntry) => {
    onInsertPath?.(entry.relPath);
    showFeedback(entry.relPath, 'inserted');
  }, [onInsertPath, showFeedback]);

  const toggleFolder = useCallback((relPath: string) => {
    const cache = ensureProjectCache(folderKey(rootPath));
    if (cache.expanded.has(relPath)) {
      cache.expanded.delete(relPath);
      bump();
      return;
    }
    cache.expanded.add(relPath);
    bump();
    void fetchDir(rootPath, relPath, { silent: false, pruneIfInvalid: false });
  }, [ensureProjectCache, rootPath, bump, fetchDir]);

  const collapseAll = useCallback(() => {
    const cache = cacheRef.current.get(folderKey(rootPath));
    if (!cache || cache.expanded.size === 0) return;
    cache.expanded.clear();
    setContextMenu(null);
    bump();
  }, [rootPath, bump]);

  const projKey = folderKey(rootPath);
  const projectCache = cacheRef.current.get(projKey);
  const expanded = projectCache?.expanded ?? EMPTY_EXPANDED;
  const dirs = projectCache?.dirs ?? EMPTY_DIRS;
  const rootState = dirs.get('');

  const flatRows = useMemo((): FlatRow[] => {
    const keyword = filter.trim().toLowerCase();

    const buildRows = (
      relDir: string,
      depth: number,
      parentDimmed: boolean,
    ): { rows: FlatRow[]; hasMatch: boolean } => {
      const state = dirs.get(relDir);
      if (!state) return { rows: [], hasMatch: false };
      if (state.error) {
        return {
          rows: [{ kind: 'error', key: `err:${relDir}`, depth, message: state.error }],
          hasMatch: false,
        };
      }
      if (state.entries.length === 0) {
        if (!keyword && !state.loading) {
          return { rows: [{ kind: 'empty', key: `empty:${relDir}`, depth }], hasMatch: false };
        }
        return { rows: [], hasMatch: false };
      }

      const rows: FlatRow[] = [];
      let hasMatch = false;
      for (const entry of state.entries) {
        const selfMatch = !keyword
          || entry.name.toLowerCase().includes(keyword)
          || entry.relPath.toLowerCase().includes(keyword);
        const isExpanded = entry.isDir && expanded.has(entry.relPath);
        const entryDimmed = Boolean(parentDimmed || entry.dimmed);
        if (isExpanded) {
          const child = buildRows(entry.relPath, depth + 1, entryDimmed);
          if (!keyword || selfMatch || child.hasMatch) {
            if (selfMatch || child.hasMatch) hasMatch = true;
            rows.push({
              kind: 'entry',
              key: entry.relPath,
              entry,
              depth,
              isExpanded: true,
              isLoading: Boolean(dirs.get(entry.relPath)?.loading),
              parentPath: relDir,
              dimmed: entryDimmed,
            });
            rows.push(...child.rows);
          }
        } else if (selfMatch) {
          hasMatch = true;
          rows.push({
            kind: 'entry',
            key: entry.relPath,
            entry,
            depth,
            isExpanded: false,
            isLoading: false,
            parentPath: relDir,
            dimmed: entryDimmed,
          });
        }
      }

      if (state.truncated && !keyword) {
        rows.push({
          kind: 'truncated',
          key: `trunc:${relDir}`,
          depth,
          shown: state.entries.length,
          total: state.totalCount ?? state.entries.length,
        });
      }

      return { rows, hasMatch };
    };

    return buildRows('', 0, false).rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, dirs, expanded, filter, projKey, projectCache, rootState]);

  const handleTreeItemKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    row: Extract<FlatRow, { kind: 'entry' }>,
  ) => {
    const buttons = getTreeItemButtons(treeRef.current);
    const index = buttons.indexOf(e.currentTarget);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (index >= 0 && index + 1 < buttons.length) buttons[index + 1].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index > 0) buttons[index - 1].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
    } else if (e.key === 'ArrowRight' && row.entry.isDir) {
      e.preventDefault();
      if (!row.isExpanded) {
        toggleFolder(row.entry.relPath);
      } else if (index >= 0 && index + 1 < buttons.length) {
        buttons[index + 1].focus();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (row.entry.isDir && row.isExpanded) {
        toggleFolder(row.entry.relPath);
      } else if (row.parentPath) {
        const parentRow = treeRef.current?.querySelector<HTMLButtonElement>(
          `[data-tree-path="${CSS.escape(row.parentPath)}"] button[role="treeitem"]`,
        );
        parentRow?.focus();
      }
    }
  };

  const handleDrawerClose = useCallback(() => {
    if (contextMenu) setContextMenu(null);
    else onClose();
  }, [contextMenu, onClose]);

  const titleLabel = folderName(rootPath) || rootPath;
  const isInitialLoading = Boolean(rootState?.loading && rootState.entries.length === 0);
  const activeKey = activePreviewPath ? folderKey(activePreviewPath) : '';
  const branchOptions = gitBranches?.root === rootPath ? gitBranches.result : null;
  const branchValue = branchOptions?.ok ? branchOptions.currentBranch ?? '' : '';
  const branchError = gitSwitchError?.root === rootPath
    ? [gitSwitchError.switched ? t('Git 分支已切换，后续操作出现错误') : t('无法切换 Git 分支'), gitSwitchError.message].filter(Boolean)
    : branchOptions && !branchOptions.ok
      ? [t('无法读取本地 Git 分支'), branchOptions.error].filter(Boolean)
      : null;

  const menuItemClass = 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg';
  const menuLeft = contextMenu ? Math.max(8, Math.min(contextMenu.x, window.innerWidth - 208)) : 0;
  const menuTop = contextMenu ? Math.max(48, Math.min(contextMenu.y, window.innerHeight - 220)) : 0;

  let statusText = t('单击文件预览，右键更多操作');
  let statusOk = false;
  let statusErr = false;
  if (feedback) {
    if (feedback.kind === 'inserted') { statusText = t('已插入路径到终端'); statusOk = true; }
    else if (feedback.kind === 'copied-rel') { statusText = t('已复制相对路径'); statusOk = true; }
    else if (feedback.kind === 'copied-full') { statusText = t('已复制完整路径'); statusOk = true; }
    else if (feedback.kind === 'copied-file') { statusText = t('已复制文件'); statusOk = true; }
    else { statusText = t('复制失败'); statusErr = true; }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleDrawerClose}
      titleId="project-tree-title"
      title={titleLabel}
      icon={<FolderTree size={16} className="shrink-0 text-accent" />}
      widthClass="max-w-sm"
      variant="drawer"
      bare
    >
      {/* 顶部工具栏：项目路径、Git 分支、快捷操作与筛选框 */}
      <div className="shrink-0 space-y-2 border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-2xs text-fg-faint" title={rootPath}>
            {rootPath}
          </span>
          {gitBranch && (window.electronAPI?.switchLocalGitBranch && window.electronAPI?.listLocalGitBranches ? (
            <div className="relative flex max-w-[8.5rem] shrink-0 items-center rounded-full border border-violet/30 bg-violet/10 text-2xs text-violet" aria-busy={switchingGitBranch}>
              <GitBranch size={10} className="pointer-events-none absolute left-1.5" aria-hidden="true" />
              <select
                data-git-branch
                value={branchValue}
                onChange={(event) => void handleSwitchGitBranch(event.target.value)}
                disabled={switchingGitBranch || !branchOptions?.ok || branchOptions.branches.length === 0}
                aria-label={t('切换 Git 分支')}
                title={t('Git 分支：{branch}', { branch: branchValue || gitBranch })}
                className="w-full min-w-0 cursor-pointer appearance-none truncate rounded-full bg-transparent pl-5 pr-5 font-mono text-violet focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent disabled:cursor-default"
              >
                {!branchValue && <option className="bg-elevated text-fg" value="" disabled>{gitBranch}</option>}
                {branchOptions?.ok && branchOptions.branches.map((branch) => (
                  <option key={branch} className="bg-elevated text-fg" value={branch}>{branch}</option>
                ))}
              </select>
              <ChevronDown size={10} className="pointer-events-none absolute right-1.5" aria-hidden="true" />
            </div>
          ) : (
            <span
              className="flex max-w-[6.5rem] shrink-0 items-center gap-1 rounded-full border border-violet/30 bg-violet/10 px-1.5 text-2xs text-violet"
              title={t('Git 分支：{branch}', { branch: gitBranch })}
              data-git-branch
            >
              <GitBranch size={10} className="shrink-0" aria-hidden="true" />
              <span className="truncate font-mono">{gitBranch}</span>
            </span>
          ))}
          {gitBranch && onOpenGitCommit && (
            <button
              type="button"
              className="icon-btn relative h-6 w-6 shrink-0"
              onClick={onOpenGitCommit}
              aria-label={t('Git 提交')}
              title={
                gitChangeCount?.root === rootPath && gitChangeCount.count > 0
                  ? t('Git 提交（{n} 个变更）', { n: gitChangeCount.count })
                  : t('Git 提交')
              }
              data-git-commit-trigger
            >
              <GitCommitHorizontal size={13} aria-hidden="true" />
              {gitChangeCount?.root === rootPath && gitChangeCount.count > 0 && (
                <span
                  data-git-change-count
                  className="pointer-events-none absolute -right-1 -top-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-semibold leading-none text-white"
                >
                  {gitChangeCount.count > 99 ? '99+' : gitChangeCount.count}
                </span>
              )}
            </button>
          )}
          {gitBranch && onOpenGitConflicts && (
            <button type="button" className="icon-btn h-6 w-6 shrink-0" onClick={onOpenGitConflicts}
              aria-label={t('Git 冲突对比')} title={t('Git 冲突对比')}>
              <GitMerge size={13} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void refreshAll(rootPath, false);
              refreshGitChangeCount(rootPath);
            }}
            aria-label={t('刷新目录')}
            title={t('刷新目录')}
            className="icon-btn h-6 w-6"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={collapseAll}
            disabled={expanded.size === 0}
            aria-label={t('全部折叠')}
            title={t('全部折叠')}
            className="icon-btn h-6 w-6"
          >
            <ChevronsDownUp size={13} />
          </button>
          {onRevealInExplorer && (
            <button
              type="button"
              onClick={() => onRevealInExplorer(rootPath)}
              aria-label={t('在资源管理器中打开')}
              title={t('在资源管理器中打开')}
              className="icon-btn h-6 w-6"
            >
              <FolderOpen size={13} />
            </button>
          )}
        </div>
        {branchError && (
          <p role="status" className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-2xs text-danger">
            {branchError.join('\n')}
          </p>
        )}

        <label className="flex items-center gap-2 rounded-md border border-line-strong bg-canvas px-2.5 py-1.5 text-fg-subtle">
          <Search size={13} className="shrink-0" />
          <input
            ref={filterInputRef}
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                const first = getTreeItemButtons(treeRef.current)[0];
                if (first) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
            placeholder={t('筛选已展开的文件与文件夹')}
            className="min-w-0 flex-1 bg-transparent text-xs text-fg !outline-none placeholder:text-fg-faint select-text"
          />
          {filter && (
            <button
              type="button"
              onClick={() => { setFilter(''); filterInputRef.current?.focus(); }}
              aria-label={t('清除筛选')}
              title={t('清除筛选')}
              className="rounded p-0.5 text-fg-faint hover:bg-hover hover:text-fg"
            >
              <X size={12} />
            </button>
          )}
        </label>
      </div>

      {/* 目录树正文 */}
      <div
        ref={treeRef}
        role="tree"
        aria-label={t('项目目录树')}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1 select-none"
      >
        {isInitialLoading && (
          <p className="p-6 text-center text-xs text-fg-subtle">{t('正在读取…')}</p>
        )}

        {!isInitialLoading && rootState?.error && (
          <p role="alert" className="p-4 text-center text-xs text-danger">{rootState.error}</p>
        )}

        {!isInitialLoading && !rootState?.error && flatRows.length === 0 && (
          <p className="p-6 text-center text-xs text-fg-faint">
            {filter.trim() ? t('没有匹配的文件或文件夹') : t('此文件夹为空')}
          </p>
        )}

        {flatRows.map((row) => {
          if (row.kind === 'empty') {
            return (
              <div
                key={row.key}
                className="relative py-1 pr-3 text-2xs italic text-fg-faint"
                style={{ paddingLeft: `${26 + row.depth * 14}px` }}
              >
                {Array.from({ length: row.depth }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 top-0 w-px bg-line/70"
                    style={{ left: `${15 + i * 14}px` }}
                  />
                ))}
                {t('此文件夹为空')}
              </div>
            );
          }

          if (row.kind === 'error') {
            return (
              <div
                key={row.key}
                className="relative truncate py-1 pr-3 text-2xs text-danger"
                style={{ paddingLeft: `${26 + row.depth * 14}px` }}
                title={row.message}
              >
                {row.message}
              </div>
            );
          }

          if (row.kind === 'truncated') {
            return (
              <div
                key={row.key}
                className="relative py-1 pr-3 text-2xs text-fg-faint"
                style={{ paddingLeft: `${26 + row.depth * 14}px` }}
              >
                {t('仅显示前 {shown} / {total} 项', { shown: row.shown, total: row.total })}
              </div>
            );
          }

          const { entry, depth, isExpanded, isLoading, dimmed } = row;
          const isActive = !entry.isDir && Boolean(activeKey) && folderKey(entry.fullPath) === activeKey;
          const insertedNow = feedback?.key === entry.relPath && feedback.kind === 'inserted';
          const copiedNow = feedback?.key === entry.relPath && feedback.kind === 'copied-rel';
          const fileCopiedNow = feedback?.key === entry.relPath && feedback.kind === 'copied-file';

          return (
            <div
              key={row.key}
              data-tree-path={entry.relPath}
              data-tree-dir={entry.isDir ? 'true' : undefined}
              data-tree-dimmed={dimmed ? 'true' : undefined}
              className={`group/row relative flex items-center pr-1.5 transition-colors ${isActive ? 'bg-selected text-fg font-medium' : 'text-fg-muted hover:bg-hover hover:text-fg'}`}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ x: e.clientX, y: e.clientY, entry, isExpanded });
              }}
            >
              {Array.from({ length: depth }, (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 top-0 w-px bg-line/70"
                  style={{ left: `${15 + i * 14}px` }}
                />
              ))}

              <button
                type="button"
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={entry.isDir ? isExpanded : undefined}
                aria-selected={isActive}
                onClick={() => {
                  if (entry.isDir) {
                    toggleFolder(entry.relPath);
                  } else {
                    onPreviewFile(rootPath, entry.fullPath);
                    onClose();
                  }
                }}
                onKeyDown={(e) => handleTreeItemKeyDown(e, row)}
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                title={entry.relPath}
                className={`flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-xs outline-none focus-visible:bg-hover focus-visible:text-fg ${dimmed && !isActive ? 'opacity-55 group-hover/row:opacity-95' : ''}`}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-fg-faint">
                  {entry.isDir ? (
                    isLoading ? (
                      <Loader2 size={12} className="animate-spin text-accent" />
                    ) : (
                      <ChevronRight
                        size={13}
                        className={`transition-transform duration-150 ${isExpanded ? 'rotate-90 text-fg-subtle' : ''}`}
                      />
                    )
                  ) : null}
                </span>
                {renderEntryIcon(entry, isExpanded)}
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              </button>

              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
                {hasActiveTerminal && onInsertPath && (
                  <button
                    type="button"
                    onClick={() => handleInsert(entry)}
                    aria-label={t('插入路径到当前终端')}
                    title={t('插入路径到当前终端')}
                    className="icon-btn h-6 w-6"
                  >
                    {insertedNow ? <Check size={12} className="text-success" /> : <CornerDownLeft size={12} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void copyText(entry.relPath, entry.relPath, 'copied-rel')}
                  aria-label={t('复制相对路径')}
                  title={t('复制相对路径')}
                  className="icon-btn h-6 w-6"
                >
                  {copiedNow ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                </button>
                {!entry.isDir && window.electronAPI?.copyProjectFile && (
                  <button
                    type="button"
                    onClick={() => void copyFile(entry)}
                    aria-label={t('复制文件')}
                    title={t('复制文件')}
                    className="icon-btn h-6 w-6"
                  >
                    {fileCopiedNow ? <Check size={12} className="text-success" /> : <FileStack size={12} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部提示 / 即时操作反馈 */}
      <div className="flex shrink-0 items-center justify-between border-t border-line/70 bg-surface/65 px-3 py-1.5 text-2xs">
        <span className={statusErr ? 'text-danger' : statusOk ? 'text-success' : 'text-fg-faint'}>
          {statusText}
        </span>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          role="menu"
          style={{ left: menuLeft, top: menuTop }}
          className="glass-popover fixed z-50 w-48 overflow-hidden rounded-xl border border-line-strong/80 py-1"
        >
          {contextMenu.entry.isDir ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                toggleFolder(contextMenu.entry.relPath);
                setContextMenu(null);
              }}
              className={menuItemClass}
            >
              <ChevronRight size={13} className={`text-fg-subtle ${contextMenu.isExpanded ? 'rotate-90' : ''}`} />
              <span>{contextMenu.isExpanded ? t('折叠') : t('展开')}</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const target = contextMenu.entry;
                setContextMenu(null);
                onPreviewFile(rootPath, target.fullPath);
                onClose();
              }}
              className={menuItemClass}
            >
              <FileText size={13} className="text-fg-subtle" />
              <span>{t('预览文件')}</span>
            </button>
          )}
          {hasActiveTerminal && onInsertPath && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const target = contextMenu.entry;
                setContextMenu(null);
                handleInsert(target);
              }}
              className={menuItemClass}
            >
              <CornerDownLeft size={13} className="text-fg-subtle" />
              <span>{t('插入路径到终端')}</span>
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const target = contextMenu.entry;
              setContextMenu(null);
              void copyText(target.relPath, target.relPath, 'copied-rel');
            }}
            className={menuItemClass}
          >
            <Copy size={13} className="text-fg-subtle" />
            <span>{t('复制相对路径')}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const target = contextMenu.entry;
              setContextMenu(null);
              void copyText(target.fullPath, target.relPath, 'copied-full');
            }}
            className={menuItemClass}
          >
            <Copy size={13} className="text-fg-subtle" />
            <span>{t('复制完整路径')}</span>
          </button>
          {onRevealInExplorer && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const target = contextMenu.entry;
                setContextMenu(null);
                onRevealInExplorer(target.fullPath);
              }}
              className={menuItemClass}
            >
              <FolderOpen size={13} className="text-fg-subtle" />
              <span>{t('在资源管理器中显示')}</span>
            </button>
          )}
        </div>
      )}
    </Modal>
  );
});

ProjectTreeDrawer.displayName = 'ProjectTreeDrawer';
