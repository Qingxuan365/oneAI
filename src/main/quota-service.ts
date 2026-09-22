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
        model: this.getKimiCurrentModel(),
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
        model: this.getCodexCurrentModel(),
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
        model: this.getClaudeCurrentModel(),
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
        model: this.getOpenCodeCurrentModel(),
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
        model: this.getGrokCurrentModel(),
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

    this.setupFileWatchers();
  }

  private setupFileWatchers(): void {
    const watchList: Array<{ filePath: string; cliId: string }> = [
      { filePath: path.join(os.homedir(), '.kimi-code', 'config.toml'), cliId: 'kimi' },
      { filePath: path.join(os.homedir(), '.codex', 'config.toml'), cliId: 'codex' },
      { filePath: path.join(os.homedir(), '.claude', 'settings.json'), cliId: 'claude' },
      { filePath: path.join(os.homedir(), '.claude.json'), cliId: 'claude' },
      { filePath: path.join(os.homedir(), '.grok', 'settings_cache.json'), cliId: 'grok' },
      { filePath: path.join(os.homedir(), '.grok', 'config.toml'), cliId: 'grok' },
    ];

    const debounceMap = new Map<string, NodeJS.Timeout>();

    for (const item of watchList) {
      try {
        if (fs.existsSync(item.filePath)) {
          fs.watch(item.filePath, () => {
            const prev = debounceMap.get(item.cliId);
            if (prev) clearTimeout(prev);
            const t = setTimeout(() => {
              this.refreshQuota(item.cliId);
            }, 300);
            debounceMap.set(item.cliId, t);
          });
        }
      } catch (err) {
        console.warn(`[QuotaService] Failed to watch ${item.filePath}:`, err);
      }
    }
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

  private getKimiCurrentModel(): string {
    const configPath = path.join(os.homedir(), '.kimi-code', 'config.toml');
    if (!fs.existsSync(configPath)) {
      return 'K3';
    }

    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const defaultModelMatch = content.match(/default_model\s*=\s*["']([^"']+)["']/);
      const defaultModelKey = defaultModelMatch ? defaultModelMatch[1] : '';

      if (defaultModelKey) {
        const escapedKey = defaultModelKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sectionRegex = new RegExp(`\\[models\\."?${escapedKey}"?\\]([\\s\\S]*?)(?=\\n\\[|$)`);
        const sectionMatch = content.match(sectionRegex);
        if (sectionMatch) {
          const displayMatch = sectionMatch[1].match(/display_name\s*=\s*["']([^"']+)["']/);
          if (displayMatch && displayMatch[1]) {
            return displayMatch[1];
          }
        }

        if (defaultModelKey.includes('highspeed')) return 'K2.7 Highspeed';
        if (defaultModelKey.includes('kimi-for-coding')) return 'K2.8 Preview';
        if (defaultModelKey.includes('k3')) return 'K3';
        return defaultModelKey.split('/').pop() || defaultModelKey;
      }
    } catch (e) {
      console.warn('[QuotaService] Error parsing Kimi config:', e);
    }

    return 'K3';
  }

  private getCodexCurrentModel(): string {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        const m = content.match(/model\s*=\s*["']([^"']+)["']/);
        if (m && m[1]) return m[1];
      } catch (e) {
        console.warn('[QuotaService] Error reading Codex config:', e);
      }
    }
    if (process.env.CODEX_MODEL) return process.env.CODEX_MODEL;
    return 'Auto';
  }

  private getClaudeCurrentModel(): string {
    // 1. 优先读取 ~/.claude/settings.json
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      try {
        const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (s.env && s.env.ANTHROPIC_MODEL) {
          return s.env.ANTHROPIC_MODEL;
        }
        if (s.model) {
          const m = String(s.model).toLowerCase();
          if (m === 'sonnet') return 'Claude 3.7 Sonnet';
          if (m === 'opus') return 'Claude 3 Opus';
          if (m === 'haiku') return 'Claude 3.5 Haiku';
          return s.model;
        }
      } catch (e) {
        console.warn('[QuotaService] Error reading Claude settings:', e);
      }
    }

    // 2. 读取 ~/.claude.json 中的最近使用记录
    const claudeJsonPath = path.join(os.homedir(), '.claude.json');
    if (fs.existsSync(claudeJsonPath)) {
      try {
        const c = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'));
        for (const key of Object.keys(c)) {
          if (c[key] && c[key].lastModelUsage) {
            const used = Object.keys(c[key].lastModelUsage);
            if (used.length > 0) return used[used.length - 1];
          }
        }
      } catch {}
    }

    // 3. 读取 token-tracker 状态
    const statusFile = path.join(os.homedir(), '.config', 'token-tracker', 'tt-status.json');
    if (fs.existsSync(statusFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        if (data.model?.display_name || data.model?.id) {
          return data.model.display_name || data.model.id;
        }
      } catch {}
    }

    if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
    if (process.env.CLAUDE_MODEL) return process.env.CLAUDE_MODEL;

    return 'Claude 3.7 Sonnet';
  }

  private getGrokCurrentModel(): string {
    // 1. 读取 ~/.grok/settings_cache.json
    const grokSettings = path.join(os.homedir(), '.grok', 'settings_cache.json');
    if (fs.existsSync(grokSettings)) {
      try {
        const raw = JSON.parse(fs.readFileSync(grokSettings, 'utf8'));
        const payload = typeof raw.payload === 'string' ? JSON.parse(raw.payload) : raw.payload;
        if (payload && payload.settings && payload.settings.default_model) {
          const modelId = payload.settings.default_model;
          const modelsCache = path.join(os.homedir(), '.grok', 'models_cache.json');
          if (fs.existsSync(modelsCache)) {
            try {
              const mc = JSON.parse(fs.readFileSync(modelsCache, 'utf8'));
              if (mc.models && mc.models[modelId]?.info?.name) {
                return mc.models[modelId].info.name;
              }
            } catch {}
          }
          return modelId;
        }
      } catch (e) {
        console.warn('[QuotaService] Error reading Grok settings_cache:', e);
      }
    }

    // 2. 读取 ~/.grok/config.toml
    const grokConfig = path.join(os.homedir(), '.grok', 'config.toml');
    if (fs.existsSync(grokConfig)) {
      try {
        const content = fs.readFileSync(grokConfig, 'utf8');
        const m = content.match(/model\s*=\s*["']([^"']+)["']/);
        if (m && m[1]) return m[1];
      } catch {}
    }

    if (process.env.GROK_MODEL) return process.env.GROK_MODEL;
    if (process.env.XAI_MODEL) return process.env.XAI_MODEL;

    return 'Grok 4.7';
  }

  private getOpenCodeCurrentModel(): string {
    if (process.env.OPENCODE_MODEL) return process.env.OPENCODE_MODEL;
    const opencodeConfig = path.join(os.homedir(), '.opencode', 'config.json');
    if (fs.existsSync(opencodeConfig)) {
      try {
        const c = JSON.parse(fs.readFileSync(opencodeConfig, 'utf8'));
        if (c.model) return c.model;
      } catch {}
    }
    return 'Auto';
  }

  private async fetchKimiQuota(): Promise<QuotaData> {
    const credPath = path.join(os.homedir(), '.kimi-code', 'credentials', 'kimi-code.json');
    const currentModel = this.getKimiCurrentModel();

    if (!fs.existsSync(credPath)) {
      return {
        cliId: 'kimi',
        cliName: 'Kimi Code',
        model: currentModel,
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
        model: currentModel,
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
        model: currentModel,
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
    const currentModel = this.getCodexCurrentModel();
    const codexSessionsDir = path.join(os.homedir(), '.codex', 'sessions');
    if (!fs.existsSync(codexSessionsDir)) {
      return {
        cliId: 'codex',
        cliName: 'Codex',
        model: currentModel,
        planType: 'Plus',
        fiveHourPercent: 100,
        fiveHourResetsIn: '--',
        sevenDayPercent: 100,
        sevenDayResetsOn: '--',
        lastUpdated: Date.now(),
        status: 'normal',
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
      let model = currentModel;
      let planType = 'Plus';

      for (const item of filesWithStats.slice(0, 10)) {
        try {
          const content = fs.readFileSync(item.path, 'utf8');
          const lines = content.split('\n');
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (!line) continue;
            if (line.includes('"turn_context"') && (!model || model === 'Auto')) {
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
            if (foundRateLimits && model && model !== 'Auto') break;
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
    const currentModel = this.getClaudeCurrentModel();
    const statusFile = path.join(os.homedir(), '.config', 'token-tracker', 'tt-status.json');
    if (!fs.existsSync(statusFile)) {
      return {
        cliId: 'claude',
        cliName: 'Claude Code',
        model: currentModel,
        planType: 'Pro',
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
      const model = data.model?.display_name || data.model?.id || currentModel;
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
      model: this.getOpenCodeCurrentModel(),
      fiveHourPercent: 0,
      fiveHourResetsIn: '--',
      sevenDayPercent: 0,
      sevenDayResetsOn: '--',
      lastUpdated: Date.now(),
      status: 'offline',
      message: '未检测到本地配置',
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
        model: this.getGrokCurrentModel(),
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
