import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';

export interface QuotaData {
  cliId: string;
  cliName: string;
  model?: string;
  planType?: string;
  fiveHourPercent: number;      // 5h remaining pct (0-100)
  fiveHourResetsIn: string;     // e.g. "2h 45m"
  sevenDayPercent: number;      // 7d remaining pct (0-100)
  sevenDayResetsOn: string;     // e.g. "Resets Sun"
  lastUpdated: number;
  status: 'normal' | 'warning' | 'critical' | 'offline';
  message?: string;
}

function formatDuration(diffMs: number): string {
  if (diffMs <= 0) return '0m';
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatResetDay(targetMs: number): string {
  if (!targetMs || targetMs <= Date.now()) return '已重置';
  const date = new Date(targetMs);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = days[date.getDay()];
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `Resets ${dayName} ${hours}:${minutes}`;
}

export class QuotaService {
  private mainWindow: BrowserWindow | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private quotasCache: Record<string, QuotaData> = {};
  private cacheExpiry: Record<string, number> = {};
  private readonly CACHE_TTL_MS = 25000;

  constructor() {
    this.quotasCache = {
      kimi: {
        cliId: 'kimi',
        cliName: 'Kimi Code',
        model: 'k3',
        planType: 'Kimi Coding',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
      },
      codex: {
        cliId: 'codex',
        cliName: 'Codex',
        model: 'gpt-5.5',
        planType: 'Plus',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
      },
      claude: {
        cliId: 'claude',
        cliName: 'Claude Code',
        model: 'claude-3.7-sonnet',
        planType: 'Pro',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
      },
      opencode: {
        cliId: 'opencode',
        cliName: 'OpenCode',
        fiveHourPercent: 0,
        fiveHourResetsIn: '--',
        sevenDayPercent: 0,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'offline',
        message: '未检测到本地配置',
      },
      grok: {
        cliId: 'grok',
        cliName: 'Grok CLI',
        model: 'grok-2',
        planType: 'xAI Premium',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
      },
      terminal: {
        cliId: 'terminal',
        cliName: '系统终端',
        model: 'PowerShell / CMD',
        planType: 'Local Shell',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
        message: 'PowerShell Ready',
      },
    };
  }

  public setWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  public startPolling(intervalMs: number = 30000) {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
    this.refreshAllQuotas();

    this.intervalTimer = setInterval(() => {
      this.refreshAllQuotas();
    }, intervalMs);
  }

  public stopPolling() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  public getQuota(cliId: string = 'kimi'): QuotaData {
    return this.quotasCache[cliId] || this.quotasCache['kimi'];
  }

  public getAllQuotas(): Record<string, QuotaData> {
    return this.quotasCache;
  }

  public async refreshQuota(cliId?: string): Promise<Record<string, QuotaData>> {
    if (cliId && this.quotasCache[cliId]) {
      this.cacheExpiry[cliId] = 0;
      await this.fetchQuotaForCli(cliId);
      this.broadcast();
      return this.quotasCache;
    }
    return this.refreshAllQuotas();
  }

  public async refreshAllQuotas(): Promise<Record<string, QuotaData>> {
    const cliIds = ['kimi', 'codex', 'claude', 'opencode', 'grok'];
    await Promise.allSettled(cliIds.map((id) => this.fetchQuotaForCli(id)));
    this.broadcast();
    return this.quotasCache;
  }

  private async fetchQuotaForCli(cliId: string): Promise<void> {
    const now = Date.now();
    if (this.cacheExpiry[cliId] && now < this.cacheExpiry[cliId]) {
      return;
    }

    try {
      let data: QuotaData | null = null;
      switch (cliId) {
        case 'kimi':
          data = await this.fetchKimiQuota();
          break;
        case 'codex':
          data = await this.fetchCodexQuota();
          break;
        case 'claude':
          data = await this.fetchClaudeQuota();
          break;
        case 'opencode':
          data = await this.fetchOpenCodeQuota();
          break;
        case 'grok':
          data = await this.fetchGrokQuota();
          break;
      }

      if (data) {
        this.quotasCache[cliId] = data;
        this.cacheExpiry[cliId] = now + this.CACHE_TTL_MS;
      }
    } catch (err) {
      console.error(`[QuotaService] Error fetching quota for ${cliId}:`, err);
    }
  }

  private async fetchKimiQuota(): Promise<QuotaData> {
    const credPath = path.join(os.homedir(), '.kimi-code', 'credentials', 'kimi-code.json');
    if (!fs.existsSync(credPath)) {
      return {
        cliId: 'kimi',
        cliName: 'Kimi Code',
        fiveHourPercent: 0,
        fiveHourResetsIn: '--',
        sevenDayPercent: 0,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'offline',
        message: '未找到 Kimi 凭证文件',
      };
    }

    try {
      const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      const token = cred.access_token;
      if (!token) {
        throw new Error('access_token 不存在');
      }

      const resData = await new Promise<any>((resolve, reject) => {
        const req = https.request('https://api.kimi.com/coding/v1/usages', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          timeout: 8000,
        }, (res) => {
          let chunks = '';
          res.on('data', (chunk) => (chunks += chunk));
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve(JSON.parse(chunks));
              } catch (e) {
                reject(e);
              }
            } else {
              reject(new Error(`Kimi API status ${res.statusCode}`));
            }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Kimi API timeout'));
        });
        req.end();
      });

      const usages = resData.usages || {};
      const limit5h = usages.limit_5h || {};
      const limit7d = usages.limit_7d || {};

      const used5hRatio = typeof limit5h.used_ratio === 'number' ? limit5h.used_ratio : 0;
      const fiveHourPercent = Math.max(0, Math.min(100, Math.round((1 - used5hRatio) * 100)));

      const used7dRatio = typeof limit7d.used_ratio === 'number' ? limit7d.used_ratio : 0;
      const sevenDayPercent = Math.max(0, Math.min(100, Math.round((1 - used7dRatio) * 100)));

      let fiveHourResetsIn = '已就绪';
      if (limit5h.reset_time) {
        const resetMs = new Date(limit5h.reset_time).getTime();
        const diff = resetMs - Date.now();
        if (diff > 0) fiveHourResetsIn = formatDuration(diff);
      }

      let sevenDayResetsOn = '近期重置';
      if (limit7d.reset_time) {
        const resetMs = new Date(limit7d.reset_time).getTime();
        sevenDayResetsOn = formatResetDay(resetMs);
      }

      const minPct = Math.min(fiveHourPercent, sevenDayPercent);
      const status = minPct < 15 ? 'critical' : minPct < 40 ? 'warning' : 'normal';

      return {
        cliId: 'kimi',
        cliName: 'Kimi Code',
        model: 'k3',
        planType: 'Kimi Coding',
        fiveHourPercent,
        fiveHourResetsIn,
        sevenDayPercent,
        sevenDayResetsOn,
        lastUpdated: Date.now(),
        status,
      };
    } catch (err: any) {
      console.warn('[QuotaService] Kimi fetch fallback:', err.message);
      return this.quotasCache['kimi'] || {
        cliId: 'kimi',
        cliName: 'Kimi Code',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
      };
    }
  }

  private async fetchCodexQuota(): Promise<QuotaData> {
    const codexSessionsDir = path.join(os.homedir(), '.codex', 'sessions');
    if (!fs.existsSync(codexSessionsDir)) {
      return {
        cliId: 'codex',
        cliName: 'Codex',
        fiveHourPercent: 0,
        fiveHourResetsIn: '--',
        sevenDayPercent: 0,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'offline',
        message: '未找到 Codex 会话记录',
      };
    }

    try {
      const findJsonl = (dir: string, depth = 0): string[] => {
        if (depth > 4) return [];
        let res: string[] = [];
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
              res = res.concat(findJsonl(full, depth + 1));
            } else if (e.isFile() && e.name.endsWith('.jsonl')) {
              res.push(full);
            }
          }
        } catch {}
        return res;
      };

      const files = findJsonl(codexSessionsDir);
      const filesWithStats = files
        .map((f) => {
          try {
            return { path: f, mtime: fs.statSync(f).mtimeMs };
          } catch {
            return { path: f, mtime: 0 };
          }
        })
        .sort((a, b) => b.mtime - a.mtime);

      let foundRateLimits: any = null;
      let model = 'gpt-5.5';
      let planType = 'Plus';

      for (const item of filesWithStats.slice(0, 10)) {
        try {
          const content = fs.readFileSync(item.path, 'utf8');
          const lines = content.split('\n');
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            if (line.includes('"turn_context"') && model === 'gpt-5.5') {
              try {
                const parsed = JSON.parse(line);
                if (parsed?.payload?.model) model = parsed.payload.model;
              } catch {}
            }
            if (line.includes('"rate_limits"') && !foundRateLimits) {
              try {
                const parsed = JSON.parse(line);
                const rl = parsed?.payload?.rate_limits;
                if (rl && (rl.primary || rl.secondary)) {
                  foundRateLimits = rl;
                  if (rl.plan_type) planType = rl.plan_type.toUpperCase();
                }
              } catch {}
            }
            if (foundRateLimits && model !== 'gpt-5.5') break;
          }
          if (foundRateLimits) break;
        } catch {}
      }

      if (foundRateLimits) {
        const primary = foundRateLimits.primary || {};
        const secondary = foundRateLimits.secondary || {};

        const fiveHourUsed = typeof primary.used_percent === 'number' ? primary.used_percent : 0;
        const fiveHourPercent = Math.max(0, Math.min(100, Math.round(100 - fiveHourUsed)));

        const sevenDayUsed = typeof secondary.used_percent === 'number' ? secondary.used_percent : 0;
        const sevenDayPercent = Math.max(0, Math.min(100, Math.round(100 - sevenDayUsed)));

        let fiveHourResetsIn = '已就绪';
        if (primary.resets_at) {
          const resetMs = primary.resets_at * 1000;
          const diff = resetMs - Date.now();
          if (diff > 0) fiveHourResetsIn = formatDuration(diff);
        }

        let sevenDayResetsOn = '近期重置';
        if (secondary.resets_at) {
          const resetMs = secondary.resets_at * 1000;
          sevenDayResetsOn = formatResetDay(resetMs);
        }

        const minPct = Math.min(fiveHourPercent, sevenDayPercent);
        const status = minPct < 15 ? 'critical' : minPct < 40 ? 'warning' : 'normal';

        return {
          cliId: 'codex',
          cliName: 'Codex',
          model,
          planType,
          fiveHourPercent,
          fiveHourResetsIn,
          sevenDayPercent,
          sevenDayResetsOn,
          lastUpdated: Date.now(),
          status,
        };
      }

      return {
        cliId: 'codex',
        cliName: 'Codex',
        model,
        planType,
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
      };
    } catch (err: any) {
      console.warn('[QuotaService] Error parsing Codex sessions:', err.message);
      return this.quotasCache['codex'];
    }
  }

  private async fetchClaudeQuota(): Promise<QuotaData> {
    const statusFile = path.join(os.homedir(), '.config', 'token-tracker', 'tt-status.json');
    if (!fs.existsSync(statusFile)) {
      return {
        cliId: 'claude',
        cliName: 'Claude Code',
        model: 'Claude',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
      };
    }

    try {
      const data = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      const model = data.model?.display_name || data.model?.id || 'claude-3.7-sonnet';
      const rl = data.rate_limits || {};
      const five = rl.five_hour || {};
      const seven = rl.seven_day || {};

      let fiveHourPercent = 100;
      let fiveHourResetsIn = '已就绪';
      if (typeof five.used_percentage === 'number') {
        fiveHourPercent = Math.max(0, Math.min(100, Math.round(100 - five.used_percentage)));
        if (five.resets_at) {
          const diff = five.resets_at * 1000 - Date.now();
          if (diff > 0) fiveHourResetsIn = formatDuration(diff);
        }
      }

      let sevenDayPercent = 100;
      let sevenDayResetsOn = '近期重置';
      if (typeof seven.used_percentage === 'number') {
        sevenDayPercent = Math.max(0, Math.min(100, Math.round(100 - seven.used_percentage)));
        if (seven.resets_at) {
          sevenDayResetsOn = formatResetDay(seven.resets_at * 1000);
        }
      }

      let message = undefined;
      if (data.context_window?.used_percentage) {
        message = `Ctx: ${data.context_window.used_percentage}%`;
      }

      return {
        cliId: 'claude',
        cliName: 'Claude Code',
        model,
        planType: 'Pro',
        fiveHourPercent,
        fiveHourResetsIn,
        sevenDayPercent,
        sevenDayResetsOn,
        lastUpdated: Date.now(),
        status: 'normal',
        message,
      };
    } catch (err: any) {
      console.warn('[QuotaService] Error parsing Claude status:', err.message);
      return this.quotasCache['claude'];
    }
  }

  private async fetchOpenCodeQuota(): Promise<QuotaData> {
    return {
      cliId: 'opencode',
      cliName: 'OpenCode',
      fiveHourPercent: 0,
      fiveHourResetsIn: '--',
      sevenDayPercent: 0,
      sevenDayResetsOn: '--',
      lastUpdated: Date.now(),
      status: 'offline',
      message: '未检测到本地 CLI 或配置',
    };
  }

  private async fetchGrokQuota(): Promise<QuotaData> {
    try {
      const hasApiKey = !!(process.env.XAI_API_KEY || process.env.GROK_API_KEY);
      const xaiDir = path.join(os.homedir(), '.xai');
      const grokDir = path.join(os.homedir(), '.grok');
      const hasConfig = fs.existsSync(xaiDir) || fs.existsSync(grokDir);

      return {
        cliId: 'grok',
        cliName: 'Grok CLI',
        model: 'grok-2',
        planType: 'xAI Premium',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: hasApiKey || hasConfig ? 'normal' : 'normal',
        message: hasApiKey ? 'API Key Active' : 'Ready',
      };
    } catch {
      return this.quotasCache['grok'];
    }
  }

  private broadcast() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('quota:update', this.quotasCache);
    }
  }
}

export const quotaService = new QuotaService();
