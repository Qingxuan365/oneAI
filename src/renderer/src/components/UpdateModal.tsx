import React from 'react';
import { ArrowUpCircle, CheckCircle2, Download, ExternalLink, RefreshCw, RotateCcw, AlertCircle } from 'lucide-react';
import type { UpdateState } from '../types';
import { Modal } from './Modal';
import { dateLocale, t } from '../i18n';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: UpdateState;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  onIgnoreVersion: (version: string) => void;
  onOpenRelease: () => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${Math.round(bytes)} B`;
}

function formatReleaseDate(raw?: string): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(dateLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  state,
  onCheck,
  onDownload,
  onInstall,
  onIgnoreVersion,
  onOpenRelease,
}) => {
  const { phase, currentVersion, latestVersion, releaseNotes, releaseDate, canAutoUpdate, progress, error } = state;
  const formattedDate = formatReleaseDate(releaseDate);
  const hasNewVersion = Boolean(latestVersion && (phase === 'available' || phase === 'downloading' || phase === 'downloaded' || (phase === 'error' && latestVersion !== currentVersion)));

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenRelease}
          className="btn-secondary flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-xs"
        >
          <ExternalLink size={12} aria-hidden="true" />
          <span>{t('发布页')}</span>
        </button>
        {phase === 'available' && latestVersion && (
          <button
            type="button"
            onClick={() => onIgnoreVersion(latestVersion)}
            className="whitespace-nowrap rounded-md px-2 py-1.5 text-xs text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
          >
            {t('忽略此版本')}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {phase === 'downloaded' ? (
          <>
            <button type="button" onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">
              {t('稍后')}
            </button>
            <button type="button" onClick={onInstall} className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs">
              <RotateCcw size={12} aria-hidden="true" />
              <span>{t('立即重启并安装')}</span>
            </button>
          </>
        ) : phase === 'downloading' ? (
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-1.5 text-xs">
            {t('后台下载')}
          </button>
        ) : phase === 'available' ? (
          canAutoUpdate ? (
            <button type="button" onClick={onDownload} className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs">
              <Download size={12} aria-hidden="true" />
              <span>{t('下载更新')}</span>
            </button>
          ) : (
            <button type="button" onClick={onOpenRelease} className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs">
              <ExternalLink size={12} aria-hidden="true" />
              <span>{t('前往下载')}</span>
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={onCheck}
            disabled={phase === 'checking'}
            className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs disabled:opacity-50"
          >
            <RefreshCw size={12} className={phase === 'checking' ? 'animate-spin' : ''} aria-hidden="true" />
            <span>{phase === 'checking' ? t('正在检查…') : t('重新检查')}</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="update-modal-title"
      title={t('软件更新')}
      icon={<ArrowUpCircle size={16} className="text-accent" />}
      widthClass="max-w-lg"
      footer={footer}
    >
      <div className="space-y-4 select-text">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-muted px-3.5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-fg">
              {hasNewVersion && latestVersion ? (
                <>
                  <span className="font-mono text-fg-subtle">v{currentVersion}</span>
                  <span className="text-fg-faint" aria-hidden="true">→</span>
                  <span className="font-mono text-accent">v{latestVersion}</span>
                </>
              ) : (
                <span className="font-mono">OneAI v{currentVersion}</span>
              )}
            </div>
            {formattedDate && hasNewVersion && (
              <p className="mt-0.5 text-xs text-fg-faint">{t('发布日期：{date}', { date: formattedDate })}</p>
            )}
          </div>
          {phase === 'not-available' && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success">
              <CheckCircle2 size={12} aria-hidden="true" />
              {t('已是最新')}
            </span>
          )}
          {phase === 'downloaded' && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-success">
              <CheckCircle2 size={12} aria-hidden="true" />
              {t('已下载')}
            </span>
          )}
        </div>

        {phase === 'checking' && (
          <p className="text-ui text-fg-muted">{t('正在从 GitHub 检查最新版本…')}</p>
        )}

        {phase === 'not-available' && (
          <p className="text-ui text-fg-muted">{t('当前使用的 v{version} 已是最新版本。', { version: currentVersion })}</p>
        )}

        {phase === 'available' && !canAutoUpdate && (
          <p className="rounded-md border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-fg-subtle">
            {t('当前运行环境（便携版或开发模式）不支持应用内覆盖安装，请前往 GitHub 发布页下载新版本。')}
          </p>
        )}

        {phase === 'downloading' && (
          <div className="space-y-2" data-update-progress>
            <div className="flex items-center justify-between text-xs text-fg-muted">
              <span>{t('正在下载更新…')}</span>
              <span className="font-mono tabular-nums">{progress?.percent ?? 0}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-control">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-150"
                style={{ width: `${Math.max(0, Math.min(100, progress?.percent ?? 0))}%` }}
              />
            </div>
            {progress && progress.total > 0 && (
              <div className="flex items-center justify-between font-mono text-2xs text-fg-faint tabular-nums">
                <span>{formatBytes(progress.transferred)} / {formatBytes(progress.total)}</span>
                {progress.bytesPerSecond > 0 && <span>{formatBytes(progress.bytesPerSecond)}/s</span>}
              </div>
            )}
          </div>
        )}

        {phase === 'downloaded' && (
          <p className="text-ui leading-relaxed text-fg-muted">
            {t('新版本已下载完成。点击「立即重启并安装」马上更新，或选择「稍后」在下次退出 OneAI 时自动安装。')}
          </p>
        )}

        {phase === 'error' && (
          <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs text-danger" role="alert">
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words leading-relaxed">{error || t('检查更新失败，请稍后重试')}</span>
          </div>
        )}

        {hasNewVersion && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-fg-subtle">{t('更新说明')}</div>
            <div className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface p-3 text-xs leading-relaxed text-fg-muted">
              {releaseNotes || t('暂无更新说明，可点击左下角「发布页」前往 GitHub 查看详情。')}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
