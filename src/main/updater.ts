import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import updaterPkg from 'electron-updater';
import type { UpdateInfo } from 'electron-updater';
import type { UpdateState } from '../shared/types';
import type { Language } from '../shared/i18n';
import { getLanguage, t } from './i18n';

const { autoUpdater } = updaterPkg;

export const GITHUB_OWNER = 'Qingxuan365';
export const GITHUB_REPO = 'oneAI';
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const LATEST_RELEASE_WEB = `${RELEASES_PAGE_URL}/latest`;
const GITHUB_FETCH_TIMEOUT_MS = 10_000;

export function extractVersionFromReleaseUrl(url: string): string | null {
  const match = url.match(/\/releases\/tag\/([^/?#]+)/i);
  if (!match) return null;
  const tag = decodeURIComponent(match[1]).trim().replace(/^v/i, '');
  return parseSemver(tag) ? tag : null;
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function parseSemver(raw: string): ParsedSemver | null {
  const cleaned = raw.trim().replace(/^v/i, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

/** 比较两个语义化版本号：a > b 返回 1，a < b 返回 -1，相等或无法解析返回 0 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0;
  if (pa.prerelease.length === 0) return 1;
  if (pb.prerelease.length === 0) return -1;
  const len = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < len; i++) {
    const ia = pa.prerelease[i];
    const ib = pb.prerelease[i];
    if (ia === undefined) return -1;
    if (ib === undefined) return 1;
    if (ia === ib) continue;
    const na = /^\d+$/.test(ia);
    const nb = /^\d+$/.test(ib);
    if (na && nb) return Number(ia) > Number(ib) ? 1 : -1;
    if (na !== nb) return na ? -1 : 1;
    return ia > ib ? 1 : -1;
  }
  return 0;
}

export function buildReleaseUrl(version?: string): string {
  const clean = version?.trim().replace(/^v/i, '');
  return clean ? `${RELEASES_PAGE_URL}/tag/v${encodeURIComponent(clean)}` : RELEASES_PAGE_URL;
}

/** 把 GitHub Releases 或 electron-updater 的 releaseNotes（HTML / Markdown / 数组）清洗为纯文本 */
export function normalizeReleaseNotes(raw: unknown): string {
  if (!raw) return '';
  let text = '';
  if (typeof raw === 'string') {
    text = raw;
  } else if (Array.isArray(raw)) {
    text = raw
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const note = typeof (item as { note?: unknown }).note === 'string' ? (item as { note: string }).note : '';
        const ver = typeof (item as { version?: unknown }).version === 'string' ? (item as { version: string }).version : '';
        return ver && note ? `v${ver.replace(/^v/i, '')}\n${note}` : note;
      })
      .filter(Boolean)
      .join('\n\n');
  }
  if (!text) return '';
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const ZH_CN_HEADING_RE = /^(?:#{1,6}\s*)?(简体中文|更新内容|更新说明|更新日志|中文(?:说明|更新)?)\s*[:：]?\s*$/;
const ZH_TW_HEADING_RE = /^(?:#{1,6}\s*)?(繁體中文|正體中文|更新內容|更新說明|更新日誌)\s*[:：]?\s*$/;
const EN_HEADING_RE = /^(?:#{1,6}\s*)?(what'?s\s+new|release\s+notes|changelog|changes|english)\s*[:：]?\s*$/i;

/** 若更新说明包含多语言分段（简体中文 / 繁體中文 / English），按当前界面语言只保留对应语言内容；单语言说明原样返回 */
export function selectLocalizedReleaseNotes(notes: string, lang: Language = getLanguage()): string {
  const clean = notes.trim();
  if (!clean) return '';
  const lines = clean.split('\n');
  let current: 'zh-CN' | 'zh-TW' | 'en' | 'other' = 'other';
  const buckets: Record<'zh-CN' | 'zh-TW' | 'en', string[]> = { 'zh-CN': [], 'zh-TW': [], en: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    if (ZH_TW_HEADING_RE.test(trimmed)) {
      current = 'zh-TW';
      continue;
    }
    if (ZH_CN_HEADING_RE.test(trimmed)) {
      current = 'zh-CN';
      continue;
    }
    if (EN_HEADING_RE.test(trimmed)) {
      current = 'en';
      continue;
    }
    if (current !== 'other') {
      buckets[current].push(line);
    }
  }

  const zhCn = buckets['zh-CN'].join('\n').trim();
  const zhTw = buckets['zh-TW'].join('\n').trim();
  const en = buckets.en.join('\n').trim();
  const sectionCount = [zhCn, zhTw, en].filter(Boolean).length;
  if (sectionCount >= 2) {
    if (lang === 'en') return en || zhCn || zhTw;
    if (lang === 'zh-TW') return zhTw || zhCn || en;
    return zhCn || zhTw || en;
  }
  return clean;
}

export function canUseAutoUpdater(opts: {
  isPackaged: boolean;
  portableDir?: string;
  appUpdateYmlExists: boolean;
}): boolean {
  return Boolean(opts.isPackaged && !opts.portableDir && opts.appUpdateYmlExists);
}

function formatUpdaterError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (!msg) return t('检查更新失败，请稍后重试');
  if (/ERR_INTERNET_DISCONNECTED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ECONNRESET|net::/i.test(msg)) {
    return t('无法连接到 GitHub，请检查网络或代理设置后重试');
  }
  if (/\b403\b|rate limit/i.test(msg)) {
    return t('GitHub 请求过于频繁，请稍后再试或直接打开发布页');
  }
  return msg.length > 240 ? `${msg.slice(0, 240)}…` : msg;
}

interface GithubReleaseResponse {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
}

class AppUpdaterService {
  private getWindow: () => BrowserWindow | null = () => null;
  private onBeforeInstall: () => void = () => {};
  private readonly autoUpdaterSupported: boolean;
  private state: UpdateState;
  private initialized = false;
  private checkInFlight: Promise<UpdateState> | null = null;
  private lastManualCheck = false;
  private etag: string | null = null;
  private cachedGithubRelease: GithubReleaseResponse | null = null;
  private rawReleaseNotes = '';

  constructor() {
    const currentVersion = app.getVersion();
    const appUpdateYml = process.resourcesPath ? path.join(process.resourcesPath, 'app-update.yml') : '';
    const canAuto = canUseAutoUpdater({
      isPackaged: app.isPackaged,
      portableDir: process.env.PORTABLE_EXECUTABLE_DIR,
      appUpdateYmlExists: Boolean(appUpdateYml && fs.existsSync(appUpdateYml)),
    });
    this.autoUpdaterSupported = canAuto;
    this.state = {
      phase: 'idle',
      currentVersion,
      releaseUrl: RELEASES_PAGE_URL,
      canAutoUpdate: canAuto,
    };
  }

  init(getWindow: () => BrowserWindow | null, onBeforeInstall: () => void): void {
    this.getWindow = getWindow;
    this.onBeforeInstall = onBeforeInstall;
    if (this.initialized) return;
    this.initialized = true;

    if (!this.state.canAutoUpdate) return;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on('checking-for-update', () => {
      if (this.state.phase === 'downloading' || this.state.phase === 'downloaded') return;
      this.setState({
        ...this.state,
        phase: 'checking',
        error: undefined,
      });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.rawReleaseNotes = normalizeReleaseNotes(info.releaseNotes);
      this.setState({
        ...this.state,
        phase: 'available',
        latestVersion: info.version,
        releaseName: info.releaseName || `v${info.version}`,
        releaseNotes: selectLocalizedReleaseNotes(this.rawReleaseNotes),
        releaseDate: info.releaseDate,
        releaseUrl: buildReleaseUrl(info.version),
        progress: undefined,
        error: undefined,
        checkedAt: Date.now(),
      });
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.setState({
        ...this.state,
        phase: 'not-available',
        latestVersion: info?.version || this.state.currentVersion,
        releaseUrl: RELEASES_PAGE_URL,
        progress: undefined,
        error: undefined,
        checkedAt: Date.now(),
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      this.setState({
        ...this.state,
        phase: 'downloading',
        progress: {
          percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
          transferred: progress.transferred,
          total: progress.total,
          bytesPerSecond: progress.bytesPerSecond,
        },
        error: undefined,
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      const normalized = normalizeReleaseNotes(info.releaseNotes);
      if (normalized) this.rawReleaseNotes = normalized;
      this.setState({
        ...this.state,
        phase: 'downloaded',
        latestVersion: info.version || this.state.latestVersion,
        releaseName: info.releaseName || this.state.releaseName || (info.version ? `v${info.version}` : undefined),
        releaseNotes: selectLocalizedReleaseNotes(this.rawReleaseNotes) || this.state.releaseNotes,
        releaseDate: info.releaseDate || this.state.releaseDate,
        releaseUrl: buildReleaseUrl(info.version || this.state.latestVersion),
        progress: {
          percent: 100,
          transferred: this.state.progress?.total ?? 0,
          total: this.state.progress?.total ?? 0,
          bytesPerSecond: 0,
        },
        error: undefined,
      });
    });

    autoUpdater.on('error', (err) => {
      // 自动检查期间的错误在 checkForUpdates 的 catch / 降级逻辑里统一处理，避免在静默检查时闪出错误态
      if (this.checkInFlight) return;
      this.setState({
        ...this.state,
        phase: 'error',
        progress: undefined,
        error: formatUpdaterError(err),
      });
    });
  }

  getState(): UpdateState {
    return this.state;
  }

  refreshLocalizedNotes(): void {
    if (!this.rawReleaseNotes) return;
    const localized = selectLocalizedReleaseNotes(this.rawReleaseNotes);
    if (localized !== this.state.releaseNotes) {
      this.setState({ ...this.state, releaseNotes: localized });
    }
  }

  private setState(next: UpdateState): void {
    this.state = next;
    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('update:state', next);
    }
  }

  private async checkViaGithubApi(canAutoUpdate: boolean): Promise<UpdateState> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': `OneAI/${this.state.currentVersion}`,
      };
      if (this.etag && this.cachedGithubRelease) {
        headers['If-None-Match'] = this.etag;
      }
      const res = await fetch(LATEST_RELEASE_API, { headers, signal: controller.signal });
      let data: GithubReleaseResponse | null = null;
      if (res.status === 304 && this.cachedGithubRelease) {
        data = this.cachedGithubRelease;
      } else if (res.ok) {
        data = (await res.json()) as GithubReleaseResponse;
        const etag = res.headers.get('etag');
        if (etag) this.etag = etag;
        this.cachedGithubRelease = data;
      } else if (res.status === 404) {
        const next: UpdateState = {
          ...this.state,
          phase: 'not-available',
          canAutoUpdate,
          latestVersion: this.state.currentVersion,
          releaseUrl: RELEASES_PAGE_URL,
          progress: undefined,
          error: undefined,
          checkedAt: Date.now(),
        };
        this.setState(next);
        return next;
      } else if (res.status === 403) {
        // 共享代理 IP 容易触发 api.github.com 匿名限流，改查 github.com/releases/latest 跳转（不计入 API 限流）
        const webRes = await fetch(LATEST_RELEASE_WEB, {
          headers: { 'User-Agent': `OneAI/${this.state.currentVersion}` },
          redirect: 'follow',
          signal: controller.signal,
        });
        const tagFromUrl = extractVersionFromReleaseUrl(webRes.url || '');
        if (!tagFromUrl) throw new Error(`HTTP ${res.status}`);
        data = {
          tag_name: `v${tagFromUrl}`,
          name: `v${tagFromUrl}`,
          html_url: webRes.url || buildReleaseUrl(tagFromUrl),
        };
      } else {
        throw new Error(`HTTP ${res.status}`);
      }

      const tag = (data?.tag_name || '').trim().replace(/^v/i, '');
      const hasNewer = Boolean(tag && !data?.draft && !data?.prerelease && compareSemver(tag, this.state.currentVersion) > 0);
      if (hasNewer) this.rawReleaseNotes = normalizeReleaseNotes(data?.body);
      const next: UpdateState = hasNewer
        ? {
            ...this.state,
            phase: 'available',
            canAutoUpdate,
            latestVersion: tag,
            releaseName: data?.name || `v${tag}`,
            releaseNotes: selectLocalizedReleaseNotes(this.rawReleaseNotes),
            releaseDate: data?.published_at,
            releaseUrl: data?.html_url || buildReleaseUrl(tag),
            progress: undefined,
            error: undefined,
            checkedAt: Date.now(),
          }
        : {
            ...this.state,
            phase: 'not-available',
            canAutoUpdate,
            latestVersion: tag || this.state.currentVersion,
            releaseUrl: data?.html_url || RELEASES_PAGE_URL,
            progress: undefined,
            error: undefined,
            checkedAt: Date.now(),
          };
      this.setState(next);
      return next;
    } finally {
      clearTimeout(timer);
    }
  }

  async checkForUpdates(manual = false): Promise<UpdateState> {
    if (this.state.phase === 'downloading' || this.state.phase === 'downloaded') {
      return this.state;
    }
    if (!manual && this.state.checkedAt) {
      return this.state;
    }
    if (this.checkInFlight) {
      if (manual) this.lastManualCheck = true;
      return this.checkInFlight;
    }
    this.lastManualCheck = manual;
    this.setState({
      ...this.state,
      phase: 'checking',
      canAutoUpdate: this.autoUpdaterSupported,
      error: undefined,
    });

    const task = (async (): Promise<UpdateState> => {
      try {
        if (this.autoUpdaterSupported) {
          try {
            await autoUpdater.checkForUpdates();
            return this.state;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err ?? '');
            // 若线上最新 Release 缺少 latest.yml（如旧版发布），自动降级到 GitHub Releases API 检查，至少保留提示与浏览器下载入口
            if (/latest\.yml|404|Cannot find latest/i.test(msg)) {
              return await this.checkViaGithubApi(false);
            }
            throw err;
          }
        }
        return await this.checkViaGithubApi(false);
      } catch (err) {
        if (!this.lastManualCheck) {
          const silent: UpdateState = {
            ...this.state,
            phase: 'idle',
            error: undefined,
          };
          this.setState(silent);
          return silent;
        }
        const failed: UpdateState = {
          ...this.state,
          phase: 'error',
          progress: undefined,
          error: formatUpdaterError(err),
          checkedAt: Date.now(),
        };
        this.setState(failed);
        return failed;
      } finally {
        this.checkInFlight = null;
      }
    })();

    this.checkInFlight = task;
    return task;
  }

  async downloadUpdate(): Promise<{ ok: boolean; error?: string }> {
    if (!this.state.canAutoUpdate) {
      return { ok: false, error: t('当前版本不支持应用内自动下载，请在浏览器中打开发布页下载安装包') };
    }
    if (this.state.phase === 'downloading' || this.state.phase === 'downloaded') {
      return { ok: true };
    }
    if (this.state.phase !== 'available' && !(this.state.phase === 'error' && this.state.latestVersion)) {
      return { ok: false, error: t('当前没有可下载的更新') };
    }
    this.setState({
      ...this.state,
      phase: 'downloading',
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
      error: undefined,
    });
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      const error = formatUpdaterError(err);
      this.setState({
        ...this.state,
        phase: 'error',
        progress: undefined,
        error,
      });
      return { ok: false, error };
    }
  }

  installUpdate(): { ok: boolean; error?: string } {
    if (!this.state.canAutoUpdate || this.state.phase !== 'downloaded') {
      return { ok: false, error: t('更新尚未下载完成') };
    }
    this.onBeforeInstall();
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
    return { ok: true };
  }

  async openReleasePage(): Promise<boolean> {
    const url = this.state.releaseUrl || RELEASES_PAGE_URL;
    if (!url.startsWith('https://')) return false;
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  }
}

export const updaterService = new AppUpdaterService();

export function setupUpdater(getWindow: () => BrowserWindow | null, onBeforeInstall: () => void): void {
  updaterService.init(getWindow, onBeforeInstall);
  ipcMain.handle('update:get-state', () => updaterService.getState());
  ipcMain.handle('update:check', (_event, manual?: boolean) => updaterService.checkForUpdates(manual === true));
  ipcMain.handle('update:download', () => updaterService.downloadUpdate());
  ipcMain.handle('update:install', () => updaterService.installUpdate());
  ipcMain.handle('update:open-release', () => updaterService.openReleasePage());
}
