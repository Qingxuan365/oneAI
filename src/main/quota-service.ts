import { BrowserWindow } from 'electron';

export interface QuotaData {
  fiveHourPercent: number;
  fiveHourResetsIn: string;
  sevenDayPercent: number;
  sevenDayResetsOn: string;
  lastUpdated: number;
  status: 'normal' | 'warning' | 'critical';
}

export class QuotaService {
  private mainWindow: BrowserWindow | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private currentQuota: QuotaData;
  private resetTimestamp: number;

  constructor() {
    // 默认初始 5h 剩余 82%，重置时间为约 2小时45分钟后
    this.resetTimestamp = Date.now() + 2 * 3600 * 1000 + 45 * 60 * 1000;
    this.currentQuota = this.calculateQuota();
  }

  public setWindow(win: BrowserWindow) {
    this.mainWindow = win;
  }

  public startPolling(intervalMs: number = 30000) {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }

    this.intervalTimer = setInterval(() => {
      this.currentQuota = this.calculateQuota();
      this.broadcast();
    }, intervalMs);
  }

  public stopPolling() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  public getQuota(): QuotaData {
    return this.calculateQuota();
  }

  public async refreshQuota(): Promise<QuotaData> {
    // 刷新时模拟检查最新的 API / 本地 CLI 状态
    this.currentQuota = this.calculateQuota();
    this.broadcast();
    return this.currentQuota;
  }

  private calculateQuota(): QuotaData {
    const now = Date.now();
    const diff = Math.max(0, this.resetTimestamp - now);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    // 如果倒计时结束，重置下一个 5 小时周期
    if (diff <= 0) {
      this.resetTimestamp = Date.now() + 5 * 3600 * 1000;
    }

    const fiveHourResetsIn = `${hours}h ${minutes}m`;

    return {
      fiveHourPercent: 82,
      fiveHourResetsIn,
      sevenDayPercent: 65,
      sevenDayResetsOn: 'Resets Sun',
      lastUpdated: now,
      status: 'normal',
    };
  }

  private broadcast() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('quota:update', this.currentQuota);
    }
  }
}

export const quotaService = new QuotaService();
