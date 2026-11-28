import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FolderPlus,
  Globe,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  Terminal,
} from 'lucide-react';
import { LANGUAGES, Language, t } from '../i18n';
import { sortClisAlphabetically } from '../clis';
import type { CliEnvironmentInfo, CliInstallPhase, KnownCliInfo } from '../types';
import { AppLogo } from './AppLogo';
import { BrandIcon } from './BrandIcon';
import { Modal } from './Modal';

interface OnboardingModalProps {
  isOpen: boolean;
  /** onboarding：首次启动两步引导（先选语言，再进入欢迎页）；install：从主页或设置直接打开安装页 */
  mode?: 'onboarding' | 'install';
  language: Language;
  onLanguageChange: (language: Language) => void;
  /** 本机检测到的 CLI；null 表示检测尚未完成 */
  detectedClis: Array<{ id: string; name: string; icon: string }> | null;
  /** 已知 CLI 清单（含官方安装元数据，来自主进程 known-clis.json） */
  knownClis?: KnownCliInfo[];
  /** 新任务默认使用的文件夹（本机用户主目录） */
  defaultFolder: string;
  onAddFolder: () => void;
  /** 安装完成后刷新主界面已安装的 CLI 列表 */
  onRedetectClis?: () => void | Promise<void>;
  onFinish: () => void;
}

const SHOWCASE_ICON_IDS = ['claude', 'codex', 'gemini', 'agy', 'pi', 'kimi', 'opencode', 'cursor-agent', 'copilot', 'grok', 'qwen', 'kiro-cli'];
const MAX_VISIBLE_INSTALL_CARDS = 5;
const MAX_LOG_CHARS = 64_000;
const GIT_DOWNLOAD_URL = 'https://git-scm.com/downloads/win';
const NODE_DOWNLOAD_URL = 'https://nodejs.org/';

function isVersionAtLeast(current: string | undefined, minimum: string | undefined): boolean {
  if (!minimum) return true;
  if (!current) return false;
  const parse = (ver: string) => {
    const m = ver.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/i);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = parse(current);
  const b = parse(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

function compareSemverAsc(a: string, b: string): number {
  const parse = (ver: string) => {
    const m = ver.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/i);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function cliDescription(id: string): string {
  switch (id) {
    case 'claude': return t('Anthropic 官方终端编程助手');
    case 'codex': return t('OpenAI 官方终端代码代理');
    case 'agy': return t('Google Antigravity 终端智能体');
    case 'pi': return t('轻量可扩展的多模型终端编程代理');
    case 'kimi': return t('月之暗面 Kimi Code 终端助手');
    case 'cursor-agent': return t('Cursor 官方终端编程代理');
    case 'gemini': return t('Google 开源终端 AI 编程代理');
    case 'copilot': return t('GitHub 官方 Copilot 终端代理');
    case 'grok': return t('xAI 官方 Grok Build 终端代理');
    case 'kiro-cli': return t('AWS Kiro 官方终端开发代理');
    case 'opencode': return t('开源多模型终端 AI 编程代理');
    case 'qwen': return t('阿里通义千问开源终端编程代理');
    default: return '';
  }
}

/** 首次启动欢迎页与常用 CLI 一键安装页：左栏展示常见 CLI 图标墙与工作目录，右栏自动过滤已安装项并提供多选自动安装。 */
export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  mode = 'onboarding',
  language,
  onLanguageChange,
  detectedClis,
  knownClis: propKnownClis,
  defaultFolder,
  onAddFolder,
  onRedetectClis,
  onFinish,
}) => {
  const [step, setStep] = useState<1 | 2>(mode === 'install' ? 2 : 1);
  const [fetchedKnownClis, setFetchedKnownClis] = useState<KnownCliInfo[]>([]);
  const [envInfo, setEnvInfo] = useState<CliEnvironmentInfo | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installStatuses, setInstallStatuses] = useState<Record<string, CliInstallPhase>>({});
  const [installErrors, setInstallErrors] = useState<Record<string, string>>({});
  const [installWarnings, setInstallWarnings] = useState<Record<string, string>>({});
  const [sessionBatchIds, setSessionBatchIds] = useState<string[]>([]);
  const [installLog, setInstallLog] = useState('');
  const [logExpanded, setLogExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep(mode === 'install' ? 2 : 1);
    setSelectedIds([]);
    setInstallStatuses({});
    setInstallErrors({});
    setInstallWarnings({});
    setSessionBatchIds([]);
    setInstallLog('');
    setLogExpanded(false);
  }, [isOpen, mode]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    if (!propKnownClis || propKnownClis.length === 0) {
      window.electronAPI?.listKnownClis?.()
        .then((list) => { if (active && Array.isArray(list)) setFetchedKnownClis(list); })
        .catch(() => {});
    }
    window.electronAPI?.getCliEnvInfo?.()
      .then((info) => { if (active && info) setEnvInfo(info); })
      .catch(() => {});
    return () => { active = false; };
  }, [isOpen, propKnownClis]);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = window.electronAPI?.onCliInstallEvent?.((event) => {
      if (event.type === 'status') {
        setInstallStatuses((prev) => ({ ...prev, [event.cliId]: event.status }));
        if (event.error) {
          setInstallErrors((prev) => ({ ...prev, [event.cliId]: event.error! }));
        } else if (event.status === 'installing' || event.status === 'done' || event.status === 'queued') {
          setInstallErrors((prev) => {
            if (!(event.cliId in prev)) return prev;
            const next = { ...prev };
            delete next[event.cliId];
            return next;
          });
        }
        if (event.status === 'done' && event.detectedAfterInstall === false) {
          setInstallWarnings((prev) => ({
            ...prev,
            [event.cliId]: t('脚本已执行完成，但暂未在 PATH 中找到命令，可稍后在「设置 → CLI」重新检测。'),
          }));
        } else if (event.status === 'installing' || event.status === 'queued' || (event.status === 'done' && event.detectedAfterInstall !== false)) {
          setInstallWarnings((prev) => {
            if (!(event.cliId in prev)) return prev;
            const next = { ...prev };
            delete next[event.cliId];
            return next;
          });
        }
      } else if (event.type === 'log') {
        setInstallLog((prev) => {
          const combined = prev + event.chunk;
          return combined.length > MAX_LOG_CHARS ? combined.slice(-MAX_LOG_CHARS) : combined;
        });
      }
    });
    return () => unsub?.();
  }, [isOpen]);

  useEffect(() => {
    if (logExpanded && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [installLog, logExpanded]);

  const knownList = useMemo(
    () => (propKnownClis && propKnownClis.length > 0 ? propKnownClis : fetchedKnownClis),
    [propKnownClis, fetchedKnownClis],
  );

  const detectedIdSet = useMemo(
    () => new Set((detectedClis ?? []).map((cli) => cli.id)),
    [detectedClis],
  );

  // 左栏常见 CLI 图标墙：以 known-clis.json 为准，按首字母顺序排列
  const showcaseClis = useMemo(() => {
    const byId = new Map(knownList.map((cli) => [cli.id, cli]));
    const items: Array<{ id: string; name: string }> = [];
    for (const id of SHOWCASE_ICON_IDS) {
      const hit = byId.get(id);
      if (hit) items.push({ id: hit.id, name: hit.name });
    }
    if (items.length > 0) return sortClisAlphabetically(items);
    return sortClisAlphabetically((detectedClis ?? []).slice(0, 9).map((cli) => ({ id: cli.id, name: cli.name })));
  }, [knownList, detectedClis]);

  const sortedDetectedClis = useMemo(
    () => (detectedClis ? sortClisAlphabetically(detectedClis) : null),
    [detectedClis],
  );

  // 右栏支持一键安装的推荐 CLI，统一按名称首字母排序
  const installableClis = useMemo(
    () => sortClisAlphabetically(
      knownList.filter((cli): cli is KnownCliInfo & { installer: NonNullable<KnownCliInfo['installer']> } => Boolean(cli.installer?.powershellCommand)),
    ),
    [knownList],
  );

  // 前提：已安装过的不显示在未安装列表中；本次正在安装/刚装完的项留在列表里展示完成结果，避免列表突然跳动
  const batchSet = useMemo(() => new Set(sessionBatchIds), [sessionBatchIds]);
  const visibleInstallList = useMemo(() => {
    if (detectedClis === null) return [];
    return installableClis.filter((cli) => !detectedIdSet.has(cli.id) || batchSet.has(cli.id));
  }, [installableClis, detectedClis, detectedIdSet, batchSet]);

  // 仍处于未安装、可勾选状态的项
  const selectableIds = useMemo(
    () => visibleInstallList
      .filter((cli) => !detectedIdSet.has(cli.id) && installStatuses[cli.id] !== 'done')
      .map((cli) => cli.id),
    [visibleInstallList, detectedIdSet, installStatuses],
  );

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => selectableIds.includes(id)));
  }, [selectableIds]);

  const toggleSelect = (id: string) => {
    if (isInstalling || detectedIdSet.has(id) || installStatuses[id] === 'done') return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));
  const toggleSelectAll = () => {
    if (isInstalling) return;
    setSelectedIds(allSelected ? [] : [...selectableIds]);
  };

  const runInstall = async (ids: string[]) => {
    if (isInstalling || ids.length === 0 || !window.electronAPI?.installClis) return;
    setIsInstalling(true);
    setLogExpanded(true);
    setSessionBatchIds((prev) => [...new Set([...prev, ...ids])]);
    setInstallStatuses((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = 'queued';
      return next;
    });
    setInstallErrors((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    setInstallWarnings((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
    const markQueuedAsError = (message: string) => {
      setInstallStatuses((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          if (next[id] === 'queued') next[id] = 'error';
        }
        return next;
      });
      setInstallErrors((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          if (!next[id]) next[id] = message;
        }
        return next;
      });
    };
    try {
      const res = await window.electronAPI.installClis(ids);
      if (!res?.ok) {
        const message = res?.error || t('安装脚本执行失败（退出码 {code}）', { code: -1 });
        setInstallLog((prev) => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${message}\n`);
        markQueuedAsError(message);
      }
      await Promise.resolve(onRedetectClis?.());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInstallLog((prev) => `${prev}${prev && !prev.endsWith('\n') ? '\n' : ''}${message}\n`);
      markQueuedAsError(message);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCancelInstall = async () => {
    await window.electronAPI?.cancelCliInstall?.().catch(() => {});
  };

  const handleCopyCommand = async (id: string, command: string) => {
    try {
      if (window.electronAPI?.writeClipboardText) {
        await window.electronAPI.writeClipboardText(command);
      } else {
        await navigator.clipboard?.writeText(command);
      }
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
    } catch {}
  };

  const gitWarning = useMemo(() => {
    if (!envInfo || envInfo.hasGit || envInfo.platform !== 'win32') return null;
    const needed = selectedIds
      .map((id) => installableClis.find((cli) => cli.id === id))
      .filter((cli): cli is KnownCliInfo & { installer: NonNullable<KnownCliInfo['installer']> } => Boolean(cli?.installer.requiresGit));
    if (needed.length === 0) return null;
    return t('{names} 在 Windows 上运行依赖 Git for Windows，当前未检测到 Git，建议一并安装。', {
      names: needed.map((cli) => cli.name).join(' / '),
    });
  }, [envInfo, selectedIds, installableClis]);

  const nodeWarning = useMemo(() => {
    if (!envInfo) return null;
    const needed = selectedIds
      .map((id) => installableClis.find((cli) => cli.id === id))
      .filter((cli): cli is KnownCliInfo & { installer: NonNullable<KnownCliInfo['installer']> } => Boolean(cli?.installer.requiresNode));
    if (needed.length === 0) return null;
    const minVersions = needed.map((cli) => cli.installer.minNodeVersion).filter((v): v is string => Boolean(v));
    const requiredVersion = minVersions.sort(compareSemverAsc).at(-1);
    const missingNode = envInfo.hasNode === false;
    const outdatedClis = envInfo.hasNode === true && envInfo.nodeVersion
      ? needed.filter((cli) => cli.installer.minNodeVersion && !isVersionAtLeast(envInfo.nodeVersion, cli.installer.minNodeVersion))
      : [];
    if (!missingNode && outdatedClis.length === 0) return null;
    if (missingNode) {
      const names = needed.map((cli) => cli.name).join(' / ');
      return requiredVersion
        ? t('{names} 需要 Node.js {version} 或更高版本，当前未检测到 Node.js，请先安装后再继续。', { names, version: requiredVersion })
        : t('{names} 运行依赖 Node.js，当前未检测到 Node.js，请先安装后再继续。', { names });
    }
    const outdatedMinVersion = outdatedClis
      .map((cli) => cli.installer.minNodeVersion)
      .filter((v): v is string => Boolean(v))
      .sort(compareSemverAsc)
      .at(-1)!;
    return t('{names} 需要 Node.js {version} 或更高版本，当前版本为 v{current}，建议先升级后再继续。', {
      names: outdatedClis.map((cli) => cli.name).join(' / '),
      version: outdatedMinVersion,
      current: envInfo.nodeVersion!,
    });
  }, [envInfo, selectedIds, installableClis]);

  const isWelcomeStep = step === 2;
  const isInstallOnly = mode === 'install';
  const canInstallAction = Boolean(window.electronAPI?.installClis);
  const hasAllRecommendedInstalled = detectedClis !== null && installableClis.length > 0 && visibleInstallList.length === 0;
  const finishLabel = isInstallOnly
    ? t('完成')
    : selectedIds.length > 0 && !isInstalling
      ? t('跳过，开始使用')
      : t('开始使用');

  return (
    <Modal
      isOpen={isOpen}
      onClose={isInstallOnly ? onFinish : () => {}}
      closeDisabled={!isInstallOnly || isInstalling}
      titleId="onboarding-title"
      title={step === 1 ? t('界面语言') : isInstallOnly ? t('安装常用 CLI') : t('欢迎使用 OneAI')}
      icon={step === 1
        ? <Globe size={16} className="text-accent" />
        : isInstallOnly
          ? <Download size={16} className="text-accent" />
          : <Sparkles size={16} className="text-accent" />}
      widthClass={isWelcomeStep ? 'max-w-4xl' : 'max-w-lg'}
      bare={isWelcomeStep}
      footer={step === 1 ? (
        <button type="button" autoFocus onClick={() => setStep(2)} className="btn-primary px-5" data-onboarding-next>{t('下一步')}</button>
      ) : (
        <>
          {!isInstallOnly && (
            <button type="button" onClick={() => setStep(1)} disabled={isInstalling} className="btn-secondary mr-auto">{t('上一步')}</button>
          )}
          {isInstallOnly && isInstalling && (
            <span className="mr-auto text-xs text-fg-faint">{t('正在按顺序安装，请稍候…')}</span>
          )}
          {isInstalling ? (
            <button type="button" onClick={() => void handleCancelInstall()} className="btn-danger px-4" data-cli-install-cancel>
              <Square size={12} />{t('停止安装')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onFinish}
                className={selectedIds.length > 0 ? 'btn-secondary px-4' : 'btn-primary px-5'}
                data-onboarding-finish
              >
                {finishLabel}
              </button>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  autoFocus
                  disabled={!canInstallAction}
                  onClick={() => void runInstall(selectedIds)}
                  className="btn-primary px-5"
                  data-cli-install-start
                >
                  <Download size={14} />{t('安装所选（{n}）', { n: selectedIds.length })}
                </button>
              )}
            </>
          )}
        </>
      )}
    >
      {step === 1 ? (
        <div className="space-y-4" data-onboarding-step="language">
          <p className="text-ui text-fg-muted">{t('选择界面语言，之后可以在「设置 → 外观」里随时切换。')}</p>
          <div className="grid grid-cols-3 gap-3" role="group" aria-label={t('界面语言')}>
            {LANGUAGES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                lang={id}
                aria-pressed={language === id}
                onClick={() => onLanguageChange(id)}
                className={`py-3 text-base ${language === id ? 'option-active' : 'option'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-line overflow-y-auto md:grid-cols-12 md:divide-x md:divide-y-0 md:overflow-hidden"
          data-onboarding-step="welcome"
        >
          {/* 左栏：OneAI 简介、常见 CLI 图标墙与工作目录 */}
          <aside className="flex min-h-0 flex-col gap-4 bg-surface p-5 md:col-span-5 md:overflow-y-auto" data-welcome-cli-showcase>
            <div className="flex items-center gap-3">
              <AppLogo size={34} className="shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-fg">OneAI</h3>
                <p className="text-xs leading-relaxed text-fg-muted">{t('在一个工作台里并行驱动多款 AI 编程 CLI')}</p>
              </div>
            </div>

            {showcaseClis.length > 0 && (
              <section className="space-y-2" aria-label={t('常见 CLI')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-fg-subtle">{t('常见 CLI')}</span>
                  {detectedClis !== null && (
                    <span className="text-2xs text-fg-faint">{t('已检测 {n} 个', { n: detectedClis.length })}</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {showcaseClis.map((cli) => {
                    const ready = detectedIdSet.has(cli.id);
                    return (
                      <div
                        key={cli.id}
                        data-showcase-cli={cli.id}
                        title={ready ? `${cli.name} · ${t('已安装')}` : cli.name}
                        className={`relative flex min-w-0 flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-center transition-colors ${
                          ready
                            ? 'border-success/40 bg-elevated text-fg'
                            : 'border-line bg-canvas/50 text-fg-faint opacity-75'
                        }`}
                      >
                        {ready && (
                          <span
                            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-success"
                            aria-hidden="true"
                          />
                        )}
                        <BrandIcon icon={cli.id} size={22} />
                        <span className="w-full truncate text-2xs font-medium">{cli.name}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="space-y-1.5" aria-label={t('检测到的 CLI')}>
              <h4 className="text-xs font-semibold text-fg">{t('检测到的 CLI')}</h4>
              {detectedClis === null && <p className="text-xs text-fg-faint">{t('检测中…')}</p>}
              {sortedDetectedClis !== null && sortedDetectedClis.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" data-onboarding-clis>
                  {sortedDetectedClis.map((cli) => (
                    <li key={cli.id} className="flex items-center gap-1.5 rounded-md border border-line bg-elevated px-2 py-0.5 text-xs text-fg-muted">
                      <BrandIcon icon={cli.icon} size={13} />
                      <span>{cli.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              {detectedClis !== null && detectedClis.length === 0 && (
                <p className="rounded-md border border-dashed border-line px-2.5 py-2 text-xs leading-relaxed text-fg-faint" data-onboarding-no-cli>
                  {t('本机暂未检测到已知的 AI 编程 CLI，可直接在右侧勾选并自动安装，或稍后在「设置 → CLI」重新检测。')}
                </p>
              )}
            </section>

            {!isInstallOnly && (
              <section className="mt-auto space-y-1.5 border-t border-line pt-3" aria-label={t('工作文件夹')}>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-fg">{t('工作文件夹')}</h4>
                  <button type="button" onClick={onAddFolder} className="btn-secondary px-2 py-1 text-xs">
                    <FolderPlus size={12} />{t('添加文件夹…')}
                  </button>
                </div>
                <p className="break-all font-mono text-2xs text-fg-faint" title={defaultFolder || '~'}>
                  {t('默认位置：{folder}', { folder: defaultFolder || '~' })}
                </p>
              </section>
            )}
          </aside>

          {/* 右栏：未安装 CLI 多选自动安装 */}
          <section className="flex min-h-0 flex-col gap-3 p-5 md:col-span-7 md:overflow-y-auto" aria-label={t('一键安装常用 CLI')}>
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-ui font-semibold text-fg">{t('一键安装常用 CLI')}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                  {t('已自动过滤本机已安装的工具；勾选后点击下方安装，将按队列运行官方安装脚本。')}
                </p>
              </div>
              {selectableIds.length > 1 && (
                <button
                  type="button"
                  disabled={isInstalling}
                  onClick={toggleSelectAll}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-hover disabled:opacity-50"
                  data-cli-select-all
                >
                  {allSelected ? t('取消全选') : t('全选')}
                </button>
              )}
            </div>

            {gitWarning && (
              <div className="flex shrink-0 items-start gap-2 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning" role="note" data-cli-git-warning>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1 leading-relaxed">
                  <span>{gitWarning}</span>
                  <button
                    type="button"
                    onClick={() => void window.electronAPI?.openExternal?.(GIT_DOWNLOAD_URL)}
                    className="ml-1.5 inline-flex items-center gap-0.5 font-medium underline hover:opacity-80"
                  >
                    {t('下载 Git')}
                    <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            )}

            {nodeWarning && (
              <div className="flex shrink-0 items-start gap-2 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning" role="note" data-cli-node-warning>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1 leading-relaxed">
                  <span>{nodeWarning}</span>
                  <button
                    type="button"
                    onClick={() => void window.electronAPI?.openExternal?.(NODE_DOWNLOAD_URL)}
                    className="ml-1.5 inline-flex items-center gap-0.5 font-medium underline hover:opacity-80"
                  >
                    {t('下载 Node.js')}
                    <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            )}

            {detectedClis === null ? (
              <div className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-line py-10 text-xs text-fg-faint">
                <Loader2 size={14} className="animate-spin" />
                <span>{t('正在检测本机已安装的 CLI…')}</span>
              </div>
            ) : hasAllRecommendedInstalled ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-success/30 bg-success/5 px-5 py-8 text-center" data-all-clis-installed>
                <CheckCircle2 size={28} className="text-success" />
                <div className="space-y-1">
                  <p className="text-ui font-semibold text-fg">{t('推荐 CLI 已全部安装')}</p>
                  <p className="text-xs leading-relaxed text-fg-muted">
                    {t('展示的 {n} 款常用 CLI 均已就绪，可以直接开始使用。', { n: installableClis.length })}
                  </p>
                </div>
              </div>
            ) : installableClis.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line px-4 py-8 text-xs text-fg-faint">
                {t('暂未读取到可自动安装的 CLI 清单，可前往「设置 → CLI」手动管理。')}
              </div>
            ) : (
              // 最多完整展示 5 张安装卡片（单卡约 5.5rem + 边框，间距 0.5rem），超出时内部滚动，避免撑高欢迎页弹窗
              <div
                className={
                  visibleInstallList.length > MAX_VISIBLE_INSTALL_CARDS
                    ? 'min-h-[12rem] max-h-[calc(29.5rem+16px)] space-y-2 overflow-y-auto pr-1'
                    : 'space-y-2'
                }
                data-installable-cli-list
              >
                {visibleInstallList.map((cli) => {
                  const status: CliInstallPhase = installStatuses[cli.id] ?? (detectedIdSet.has(cli.id) ? 'done' : 'idle');
                  const isDone = status === 'done';
                  const isRunningThis = status === 'installing';
                  const isQueued = status === 'queued';
                  const isError = status === 'error';
                  const isCanceled = status === 'canceled';
                  const checked = selectedIds.includes(cli.id);
                  const disabled = isInstalling || isDone;
                  const errMsg = installErrors[cli.id];
                  const warnMsg = installWarnings[cli.id];

                  return (
                    <div
                      key={cli.id}
                      data-installable-cli={cli.id}
                      data-install-status={status}
                      className={`rounded-lg border px-3 py-2.5 transition-colors ${
                        isDone
                          ? 'border-success/40 bg-success/5'
                          : isRunningThis
                            ? 'border-accent bg-accent/5'
                            : checked
                              ? 'border-accent/65 bg-surface'
                              : 'border-line bg-muted hover:border-line-strong'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          id={`cli-install-check-${cli.id}`}
                          type="checkbox"
                          checked={checked || isDone}
                          disabled={disabled}
                          onChange={() => toggleSelect(cli.id)}
                          aria-label={t('选择安装 {name}', { name: cli.name })}
                          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)] disabled:cursor-default"
                        />
                        <label
                          htmlFor={`cli-install-check-${cli.id}`}
                          className={`flex min-w-0 flex-1 items-start gap-2.5 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          <BrandIcon icon={cli.id} size={20} className="mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-ui font-medium text-fg">{cli.name}</span>
                              <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-2xs text-fg-subtle">{cli.command}</code>
                              {cli.installer.requiresNode && !isDone && (() => {
                                const minVer = cli.installer.minNodeVersion;
                                const nodeProblem = Boolean(
                                  envInfo && (
                                    envInfo.hasNode === false
                                    || (envInfo.hasNode === true && minVer && envInfo.nodeVersion && !isVersionAtLeast(envInfo.nodeVersion, minVer))
                                  ),
                                );
                                return (
                                  <span
                                    data-cli-node-badge={cli.id}
                                    data-node-problem={nodeProblem ? 'true' : undefined}
                                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs ${
                                      nodeProblem
                                        ? 'border-warning/40 bg-warning/10 font-medium text-warning'
                                        : 'border-line bg-canvas text-fg-faint'
                                    }`}
                                  >
                                    {nodeProblem && <AlertTriangle size={10} aria-hidden="true" />}
                                    <span>{minVer ? t('需 Node.js {version}+', { version: minVer }) : t('需 Node.js')}</span>
                                  </span>
                                );
                              })()}
                              {isDone && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                                  <Check size={12} />{t('已安装')}
                                </span>
                              )}
                              {isRunningThis && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                                  <Loader2 size={12} className="animate-spin" />{t('安装中…')}
                                </span>
                              )}
                              {isQueued && (
                                <span className="text-xs text-fg-faint">{t('等待中…')}</span>
                              )}
                              {isError && (
                                <span className="text-xs font-medium text-danger">{t('安装失败')}</span>
                              )}
                              {isCanceled && (
                                <span className="text-xs text-fg-faint">{t('已取消')}</span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs text-fg-muted">{cliDescription(cli.id)}</span>
                          </span>
                        </label>
                        <div className="flex shrink-0 items-center gap-1">
                          {(isError || isCanceled) && !isInstalling && (
                            <button
                              type="button"
                              onClick={() => void runInstall([cli.id])}
                              className="btn-secondary px-2 py-1 text-2xs"
                              title={t('重新安装 {name}', { name: cli.name })}
                            >
                              <RotateCcw size={11} />{t('重试')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleCopyCommand(cli.id, cli.installer.powershellCommand)}
                            className="icon-btn"
                            title={t('复制安装命令')}
                            aria-label={t('复制 {name} 安装命令', { name: cli.name })}
                          >
                            {copiedId === cli.id ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => void window.electronAPI?.openExternal?.(cli.installer.docsUrl)}
                            className="icon-btn"
                            title={t('查看官方文档')}
                            aria-label={t('查看 {name} 官方文档', { name: cli.name })}
                          >
                            <ExternalLink size={13} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-1.5 pl-6">
                        <code className="block truncate rounded bg-canvas/80 px-2 py-1 font-mono text-2xs text-fg-faint select-text" title={cli.installer.powershellCommand}>
                          {cli.installer.powershellCommand}
                        </code>
                        {errMsg && (
                          <p className="mt-1 break-words text-xs text-danger">{errMsg}</p>
                        )}
                        {warnMsg && (
                          <p className="mt-1 break-words text-xs text-warning">{warnMsg}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(installLog || isInstalling) && (
              <div className="shrink-0 rounded-lg border border-line bg-surface" data-cli-install-log>
                <button
                  type="button"
                  onClick={() => setLogExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-fg-muted hover:text-fg"
                >
                  <span className="flex items-center gap-1.5">
                    <Terminal size={12} />
                    <span>{t('安装日志')}</span>
                  </span>
                  {logExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                {logExpanded && (
                  <pre
                    ref={logRef}
                    className="max-h-36 overflow-auto border-t border-line bg-canvas p-2.5 font-mono text-2xs leading-relaxed text-fg-muted select-text whitespace-pre-wrap break-all"
                  >
                    {installLog || t('正在启动安装脚本…')}
                  </pre>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
};
