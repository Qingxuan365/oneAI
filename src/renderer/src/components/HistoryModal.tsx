import React, { useEffect, useMemo, useState } from 'react';
import { Search, History, Trash2, GitBranch } from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import { Modal } from './Modal';
import { HistoryEntry } from '../types';
import { folderKey, folderName } from '../workspaceState';
import { formatAgo } from '../taskSummary';
import { t } from '../i18n';

const CLI_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  kimi: 'Kimi Code',
};

const cliLabel = (cliId: string) => CLI_LABELS[cliId] ?? cliId;

const entryKey = (entry: HistoryEntry) => `${entry.cliId}-${entry.id}`;

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 按本地日期分段：今天 / 昨天 / 更早 */
function dayGroup(timestamp: number): '今天' | '昨天' | '更早' {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday) return '今天';
  if (timestamp >= startOfToday - 86_400_000) return '昨天';
  return '更早';
}

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResume: (entry: HistoryEntry) => void;
  /** 已在侧栏里有对应任务的会话 id（点击会切换过去，而不是再开一个） */
  openHistoryIds?: ReadonlySet<string>;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, onResume, openHistoryIds }) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all')  // 'all' 或历史记录里出现过的 cliId;
  const [query, setQuery] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [branches, setBranches] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    setError('');
    window.electronAPI.listSessionHistory()
      .then((list) => {
        if (!active) return;
        setEntries(list);
        // 目录上的 Git 分支（只读 .git/HEAD），最多读 64 个不同目录
        const dirs = [...new Set(list.map((entry) => entry.cwd))].slice(0, 64);
        void window.electronAPI.getGitBranches?.(dirs).then((result) => {
          if (!active) return;
          const byKey: Record<string, string | null> = {};
          for (const [dir, branch] of Object.entries(result)) byKey[folderKey(dir)] = branch;
          setBranches(byKey);
        }).catch(() => {});
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : t('读取历史会话失败')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen]);

  // 下拉选项来自实际读到的历史记录，新增 CLI 的历史出现后自动可选
  const filterOptions = useMemo(() => {
    const ids = [...new Set(entries.map((entry) => entry.cliId))];
    ids.sort((a, b) => cliLabel(a).localeCompare(cliLabel(b)));
    return [{ id: 'all', label: t('全部') }, ...ids.map((id) => ({ id, label: cliLabel(id) }))];
  }, [entries]);

  // 选中的 CLI 已没有历史（如刚删完）时回到「全部」
  useEffect(() => {
    if (filter !== 'all' && !entries.some((entry) => entry.cliId === filter)) setFilter('all');
  }, [entries, filter]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return entries.filter((entry) =>
      (filter === 'all' || entry.cliId === filter)
      && (!keyword || `${entry.title} ${entry.cwd}`.toLowerCase().includes(keyword)));
  }, [entries, filter, query]);

  useEffect(() => { setPendingKey(null); setConfirmAll(false); }, [filter, query, isOpen]);

  const removeEntries = async (targets: HistoryEntry[]) => {
    setDeleting(true);
    setError('');
    try {
      await window.electronAPI.deleteSessionHistory(targets.map(({ cliId, id }) => ({ cliId, id })));
      const fresh = await window.electronAPI.listSessionHistory();
      setEntries(fresh);
      const stillThere = new Set(fresh.map(entryKey));
      const failed = targets.filter((entry) => stillThere.has(entryKey(entry))).length;
      if (failed > 0) setError(t('{n} 条会话删除失败', { n: failed }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('删除历史会话失败'));
    } finally {
      setDeleting(false);
      setPendingKey(null);
      setConfirmAll(false);
    }
  };

  const small = 'rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="history-title"
      title={t('历史会话')}
      icon={<History size={16} className="text-accent" />}
      widthClass="max-w-xl"
      variant="drawer"
      bare
    >
      <div className="space-y-2.5 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-line-strong bg-canvas px-3 py-2 text-fg-subtle">
            <Search size={14} className="shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('搜索标题或目录')}
              className="min-w-0 flex-1 bg-transparent text-ui text-fg !outline-none placeholder:text-fg-faint select-text"
            />
            {!loading && <span className="shrink-0 text-xs tabular-nums text-fg-faint">{t('{n} 条', { n: visible.length })}</span>}
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label={t('按 CLI 筛选')}
            className="input !w-auto shrink-0"
          >
            {filterOptions.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        {visible.length > 0 && (
          <div className="flex justify-end">
            {confirmAll ? (
              <span className="flex items-center gap-1.5">
                <button type="button" disabled={deleting} onClick={() => removeEntries(visible)} className={`${small} border-danger/60 bg-danger/10 text-danger hover:bg-danger/20`}>{t('确认删除 {n} 条（同时删除本机会话文件）', { n: visible.length })}</button>
                <button type="button" onClick={() => setConfirmAll(false)} className={`${small} border-line text-fg-muted hover:bg-hover`}>{t('取消')}</button>
              </span>
            ) : (
              <button type="button" onClick={() => { setPendingKey(null); setConfirmAll(true); }} className={`${small} flex items-center gap-1 border-line text-fg-subtle hover:bg-hover hover:text-danger`}>
                <Trash2 size={12} />{t('删除列表中全部')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="min-h-[12rem] flex-1 overflow-y-auto p-2">
        {loading && <p className="p-8 text-center text-sm text-fg-subtle">{t('正在读取…')}</p>}
        {error && <p role="alert" className="p-4 text-center text-sm text-danger">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <div className="p-8 text-center text-sm text-fg-subtle">
            <p>{entries.length === 0 ? t('还没有历史会话') : t('没有符合条件的会话')}</p>
            {entries.length === 0 && <p className="mt-1.5 text-xs text-fg-faint">{t('只读取 Claude Code、Codex、Kimi Code 的本机会话，其他 CLI 暂无可读的历史。')}</p>}
          </div>
        )}
        {visible.map((entry, index) => {
          const key = entryKey(entry);
          const confirming = pendingKey === key;
          const group = dayGroup(entry.updatedAt);
          const showGroup = index === 0 || dayGroup(visible[index - 1].updatedAt) !== group;
          const isOpenTask = openHistoryIds?.has(entry.id) ?? false;
          const branch = branches[folderKey(entry.cwd)];
          return (
            <React.Fragment key={key}>
            {showGroup && <p className="px-3 pb-1 pt-3 text-xs font-medium text-fg-faint" data-history-group>{t(group)}</p>}
            <div className="group/row flex items-center gap-1 rounded-lg transition-colors hover:bg-hover">
              <button
                type="button"
                onClick={() => onResume(entry)}
                title={isOpenTask ? t('已在侧栏打开，点击切换过去') : t('恢复此会话')}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left"
              >
                <BrandIcon icon={entry.cliId} size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui font-medium text-fg">{entry.title}</span>
                  <span className="flex items-center gap-1.5 text-xs text-fg-subtle" title={entry.cwd}>
                    <span className="truncate">{folderName(entry.cwd)}</span>
                    {branch && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full border border-violet/30 bg-violet/10 px-1.5 text-2xs text-violet" data-git-branch>
                        <GitBranch size={10} aria-hidden="true" /><span className="max-w-[6rem] truncate font-mono">{branch}</span>
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className="block text-fg-muted">{cliLabel(entry.cliId)}</span>
                  <span className="block tabular-nums text-fg-faint" title={formatTime(entry.updatedAt)}>{formatAgo(entry.updatedAt)}</span>
                  {isOpenTask && <span className="mt-0.5 inline-block rounded-full bg-accent/15 px-1.5 text-2xs font-medium text-accent" data-history-open>{t('已打开')}</span>}
                </span>
              </button>
              {confirming ? (
                <span className="flex shrink-0 items-center gap-1.5 pr-2">
                  <button type="button" disabled={deleting} onClick={() => removeEntries([entry])} className={`${small} border-danger/60 bg-danger/10 text-danger hover:bg-danger/20`}>{t('确认删除')}</button>
                  <button type="button" onClick={() => setPendingKey(null)} className={`${small} border-line text-fg-muted hover:bg-elevated`}>{t('取消')}</button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setConfirmAll(false); setPendingKey(key); }}
                  aria-label={t('删除该会话')}
                  title={t('删除该会话')}
                  className="icon-btn mr-2 opacity-0 enabled:hover:text-danger focus-visible:opacity-100 group-hover/row:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            </React.Fragment>
          );
        })}
      </div>
    </Modal>
  );
};
