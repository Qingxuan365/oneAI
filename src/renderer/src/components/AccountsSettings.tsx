import React, { useEffect, useState } from 'react';
import { FolderOpen, LogIn, Pencil, Plus, RotateCw, Trash2 } from 'lucide-react';
import { Account, LoginStatus } from '../types';
import { t } from '../i18n';
import { ACCOUNT_CLIS, defaultConfigDir, exampleConfigDir, toSessionAccount, validateAccount } from '../accounts';

interface AccountsSettingsProps {
  isActive: boolean;                       // 页面可见时才检查登录状态
  accounts: Account[];
  onChange: (accounts: Account[]) => void;
  onLogin: (account: Account) => void;
  /** 各账号当前的任务数，删除确认时提示 */
  taskCounts?: Record<string, number>;
}

type StatusEntry = LoginStatus | { error: string } | 'checking';

interface Draft {
  id?: string;
  cliId: Account['cliId'];
  name: string;
  configDir: string;
  env: string;
}

function newAccountId(): string {
  return `acc-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`).slice(0, 8)}`;
}

const label = 'mb-1.5 block text-xs font-medium text-fg-muted';

function StatusBadge({ entry }: { entry: StatusEntry | undefined }) {
  if (!entry || entry === 'checking') return <span className="text-xs text-fg-faint">{t('检查登录状态…')}</span>;
  if ('error' in entry) return <span className="truncate text-xs text-danger" title={entry.error}>{t('无法检查')}</span>;
  if (entry.loggedIn === null) return <span className="text-xs text-fg-faint">{t('状态未知')}</span>;
  return entry.loggedIn
    ? <span className="truncate text-xs text-success" title={entry.detail}>{t('已登录')}{entry.detail ? ` · ${entry.detail}` : ''}</span>
    : <span className="text-xs text-warning">{t('未登录')}</span>;
}

/** 设置 → 账号：为 Codex / Claude Code 维护多个账号。每个账号是一个独立的配置目录，登录由 CLI 自己完成。 */
export const AccountsSettings: React.FC<AccountsSettingsProps> = ({ isActive, accounts, onChange, onLogin, taskCounts = {} }) => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, StatusEntry>>({});

  const checkStatus = async (account: Account) => {
    setStatuses((prev) => ({ ...prev, [account.id]: 'checking' }));
    let result: StatusEntry;
    try {
      result = await window.electronAPI?.checkAccountLogin?.(toSessionAccount(account)) ?? { error: t('当前环境不支持检查') };
    } catch (err) {
      result = { error: err instanceof Error ? err.message : t('检查失败') };
    }
    setStatuses((prev) => ({ ...prev, [account.id]: result }));
  };

  // 每次打开本页，检查所有账号的登录状态（登录在终端任务里完成，回到设置时需要刷新）
  useEffect(() => {
    if (!isActive) return;
    accounts.forEach((account) => { void checkStatus(account); });
    // 只在打开本页时检查；增删改账号后由对应操作单独刷新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const openAdd = (cliId: Account['cliId']) => {
    setDraft({ cliId, name: '', configDir: '', env: '' });
    setError('');
  };

  const openEdit = (account: Account) => {
    setDraft({ id: account.id, cliId: account.cliId, name: account.name, configDir: account.configDir, env: account.env ?? '' });
    setError('');
  };

  const chooseDirectory = async () => {
    const selected = await window.electronAPI?.selectWorkspaceDirectory?.(draft?.configDir || undefined);
    if (selected && draft) setDraft({ ...draft, configDir: selected });
  };

  const save = () => {
    if (!draft) return;
    const problem = validateAccount(draft, accounts.filter((a) => a.id !== draft.id));
    if (problem) {
      setError(problem);
      return;
    }
    const saved: Account = {
      id: draft.id ?? newAccountId(),
      cliId: draft.cliId,
      name: draft.name.trim(),
      configDir: draft.configDir.trim(),
      env: draft.env.trim() || undefined,
    };
    onChange(draft.id ? accounts.map((a) => (a.id === saved.id ? saved : a)) : [...accounts, saved]);
    setDraft(null);
    void checkStatus(saved);
  };

  const remove = (account: Account) => {
    onChange(accounts.filter((a) => a.id !== account.id));
    setConfirmDeleteId(null);
    setStatuses((prev) => {
      const next = { ...prev };
      delete next[account.id];
      return next;
    });
  };

  return (
    <>
      <section className="rounded-md border border-line bg-muted px-3.5 py-3" aria-label={t('添加账号步骤')} data-account-guide>
        <h3 className="text-ui font-semibold text-fg">{t('添加步骤')}</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-fg-muted">
          <li>{t('在下方对应 CLI 一栏点「添加账号」，填写账号名称（如 work、个人），配置目录选一个新的空文件夹（如 {example}），每个账号一个，不存在会自动创建，然后保存。', { example: exampleConfigDir('codex', 'work') })}</li>
          <li>{t('点该账号右侧的「登录」，会新开一个终端任务运行登录命令，按终端里的提示在浏览器中登录这个账号。')}</li>
          <li>{t('登录完成后回到这里，点账号右侧的刷新图标，状态变为「已登录」即可使用。')}</li>
          <li>{t('使用时：点侧栏文件夹的「+」，在 CLI 下方选「用 账号名 新建」；或在「自定义命令与目录」弹窗里选账号。顶栏额度会跟随该账号。')}</li>
        </ol>
        <p className="mt-2 text-xs leading-relaxed text-fg-faint">
          {t('默认账号（原来就登录的那个）不用添加。每个账号的凭据和会话记录只保存在自己的配置目录里；OneAI 只在启动任务时设置环境变量，不复制、不读取凭据。')}
        </p>
      </section>

      {ACCOUNT_CLIS.map((cli) => {
        const list = accounts.filter((account) => account.cliId === cli.id);
        const editingHere = draft?.cliId === cli.id;
        return (
          <section key={cli.id} className="space-y-2.5" aria-label={t('{name} 账号', { name: cli.name })}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-ui font-semibold text-fg">
                {cli.name}
                <span className="ml-2 text-xs font-normal text-fg-faint">{t('环境变量 {name}', { name: cli.envVar })}</span>
              </h3>
              <button type="button" onClick={() => openAdd(cli.id)} disabled={editingHere && !draft?.id} className="btn-secondary px-2.5 py-1 text-xs">
                <Plus size={12} />{t('添加账号')}
              </button>
            </div>

            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
              <li className="flex items-center justify-between gap-3 bg-muted px-3 py-2 text-ui text-fg-muted">
                <span className="min-w-0">
                  <span className="block">{t('默认账号')}</span>
                  <span className="block truncate font-mono text-xs text-fg-faint">{defaultConfigDir(cli.id)}</span>
                </span>
                <span className="shrink-0 text-xs text-fg-faint">{t('不设置环境变量')}</span>
              </li>
              {list.map((account) => (
                <li key={account.id} data-account-id={account.id} className="flex items-center justify-between gap-3 bg-muted px-3 py-2 text-ui text-fg-muted">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-fg">{account.name}</span>
                      <StatusBadge entry={statuses[account.id]} />
                    </span>
                    <span className="block truncate font-mono text-xs text-fg-faint" title={account.configDir}>{account.configDir}</span>
                  </span>
                  {confirmDeleteId === account.id ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-xs text-danger">{taskCounts[account.id] ? t('只删除此配置，目录与凭据保留；使用此账号的 {n} 个任务将无法再启动', { n: taskCounts[account.id] }) : t('只删除此配置，目录与凭据保留')}</span>
                      <button type="button" onClick={() => remove(account)} className="btn-danger px-2.5 py-1 text-xs">{t('确认删除')}</button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="btn-secondary px-2.5 py-1 text-xs">{t('取消')}</button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => onLogin(account)} className="btn-secondary px-2.5 py-1 text-xs" title={t('在该账号环境下新开终端运行 {command}', { command: cli.loginCommand })}>
                        <LogIn size={12} />{t('登录')}
                      </button>
                      <button type="button" onClick={() => void checkStatus(account)} className="icon-btn" title={t('刷新登录状态')} aria-label={t('刷新 {name} 的登录状态', { name: account.name })}>
                        <RotateCw size={13} />
                      </button>
                      <button type="button" onClick={() => openEdit(account)} className="icon-btn" title={t('编辑')} aria-label={t('编辑 {name}', { name: account.name })}>
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(account.id)} className="icon-btn enabled:hover:text-danger" title={t('删除')} aria-label={t('删除 {name}', { name: account.name })}>
                        <Trash2 size={13} />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {editingHere && draft && (
              <form
                aria-label={draft.id ? t('编辑账号') : t('添加账号')}
                onSubmit={(e) => { e.preventDefault(); save(); }}
                className="space-y-3 rounded-md border border-accent/40 bg-canvas p-3"
              >
                {error && <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
                <div>
                  <label htmlFor="account-name" className={label}>{t('账号名称')}</label>
                  <input id="account-name" autoFocus className="input select-text" value={draft.name} placeholder={t('例如：alt、工作、个人')}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="account-dir" className={label}>{t('配置目录（{name}）', { name: cli.envVar })}</label>
                  <div className="flex gap-2">
                    <input id="account-dir" className="input min-w-0 flex-1 select-text font-mono" value={draft.configDir}
                      placeholder={t('例如：{path}', { path: exampleConfigDir(cli.id) })} onChange={(e) => setDraft({ ...draft, configDir: e.target.value })} />
                    <button type="button" onClick={() => void chooseDirectory()} className="btn-secondary"><FolderOpen size={14} />{t('选择文件夹')}</button>
                  </div>
                  <p className="mt-1.5 text-xs text-fg-faint">{t('目录不存在时启动任务会自动创建；请为每个账号使用不同的目录。')}</p>
                </div>
                <div>
                  <label htmlFor="account-env" className={label}>{t('附加环境变量（可选）')}</label>
                  <textarea id="account-env" rows={3} className="input select-text font-mono" value={draft.env} placeholder={t('每行一个：KEY=VALUE\n例如代理：HTTPS_PROXY=http://127.0.0.1:7890')}
                    onChange={(e) => setDraft({ ...draft, env: e.target.value })} />
                  <p className="mt-1.5 text-xs text-fg-faint">{t('以明文保存在本机应用设置中，不要填写密钥；{name} 由上面的配置目录决定，不会被覆盖。', { name: cli.envVar })}</p>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setDraft(null); setError(''); }} className="btn-secondary">{t('取消')}</button>
                  <button type="submit" className="btn-primary">{t('保存')}</button>
                </div>
              </form>
            )}
          </section>
        );
      })}
    </>
  );
};
