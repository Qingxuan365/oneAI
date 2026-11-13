import React, { useEffect, useMemo, useState } from 'react';
import { Search, History, Trash2 } from 'lucide-react';
import { BrandIcon } from './BrandIcon';
import { Modal } from './Modal';
import { HistoryEntry } from '../types';

const CLI_LABELS: Record<HistoryEntry['cliId'], string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  kimi: 'Kimi Code',
};

const entryKey = (entry: HistoryEntry) => `${entry.cliId}-${entry.id}`;

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResume: (entry: HistoryEntry) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, onResume }) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<HistoryEntry['cliId'] | 'all'>('all');
  const [query, setQuery] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    setError('');
    window.electronAPI.listSessionHistory()
      .then((list) => { if (active) setEntries(list); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : '读取历史会话失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen]);

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
      if (failed > 0) setError(`${failed} 条会话删除失败`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除历史会话失败');
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
      title="历史会话"
      icon={<History size={16} className="text-accent" />}
      widthClass="max-w-xl"
      variant="drawer"
      bare
    >
      <div className="space-y-2.5 border-b border-line px-4 py-3">
        <label className="flex items-center gap-2 rounded-md border border-line-strong bg-canvas px-3 py-2 text-fg-subtle focus-within:border-accent">
          <Search size={14} className="shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题或目录"
            className="min-w-0 flex-1 bg-transparent text-ui text-fg outline-none placeholder:text-fg-faint select-text"
          />
          {!loading && <span className="shrink-0 text-xs tabular-nums text-fg-faint">{visible.length} 条</span>}
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', 'claude', 'codex', 'kimi'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={`px-2.5 py-1 ${filter === id ? 'option-active' : 'option'}`}
            >
              {id === 'all' ? '全部' : CLI_LABELS[id]}
            </button>
          ))}
          {visible.length > 0 && (confirmAll ? (
            <span className="ml-auto flex items-center gap-1.5">
              <button type="button" disabled={deleting} onClick={() => removeEntries(visible)} className={`${small} border-danger/60 bg-danger/10 text-danger hover:bg-danger/20`}>确认删除 {visible.length} 条</button>
              <button type="button" onClick={() => setConfirmAll(false)} className={`${small} border-line text-fg-muted hover:bg-hover`}>取消</button>
            </span>
          ) : (
            <button type="button" onClick={() => { setPendingKey(null); setConfirmAll(true); }} className={`${small} ml-auto flex items-center gap-1 border-line text-fg-subtle hover:bg-hover hover:text-danger`}>
              <Trash2 size={12} />删除列表中全部
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[12rem] flex-1 overflow-y-auto p-2">
        {loading && <p className="p-8 text-center text-sm text-fg-subtle">正在读取…</p>}
        {error && <p role="alert" className="p-4 text-center text-sm text-danger">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p className="p-8 text-center text-sm text-fg-subtle">{entries.length === 0 ? '还没有历史会话' : '没有符合条件的会话'}</p>
        )}
        {visible.map((entry) => {
          const key = entryKey(entry);
          const confirming = pendingKey === key;
          return (
            <div key={key} className="group/row flex items-center gap-1 rounded-lg transition-colors hover:bg-hover">
              <button
                type="button"
                onClick={() => onResume(entry)}
                title="恢复此会话"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left"
              >
                <BrandIcon icon={entry.cliId} size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui font-medium text-fg">{entry.title}</span>
                  <span className="block truncate font-mono text-xs text-fg-subtle" title={entry.cwd}>{entry.cwd}</span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className="block text-fg-muted">{CLI_LABELS[entry.cliId]}</span>
                  <span className="block font-mono tabular-nums text-fg-faint">{formatTime(entry.updatedAt)}</span>
                </span>
              </button>
              {confirming ? (
                <span className="flex shrink-0 items-center gap-1.5 pr-2">
                  <button type="button" disabled={deleting} onClick={() => removeEntries([entry])} className={`${small} border-danger/60 bg-danger/10 text-danger hover:bg-danger/20`}>确认删除</button>
                  <button type="button" onClick={() => setPendingKey(null)} className={`${small} border-line text-fg-muted hover:bg-elevated`}>取消</button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setConfirmAll(false); setPendingKey(key); }}
                  aria-label="删除该会话"
                  title="删除该会话"
                  className="icon-btn mr-2 opacity-0 enabled:hover:text-danger focus-visible:opacity-100 group-hover/row:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
};
