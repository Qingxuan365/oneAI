import { app, BrowserWindow, ipcMain, clipboard, shell, dialog, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ptyManager } from './pty-manager';
import { quotaService } from './quota-service';
import { startSystemStats } from './system-stats';
import { checkAccountLogin } from './account-login';
import { setupGitBranch } from './git-branch';
import { setupTaskSummary } from './task-summary';
import { listSessionHistory, deleteSessionHistory } from './session-history';
import { getUsageStats } from './usage-stats';
import { detectInstalledClis, listKnownClis } from './cli-detect';
import { setupWorkspaceStore } from './workspace-store';
import { registerMusicScheme, setupMusicLibrary } from './music-library';
import { setupFilePreview } from './file-preview';
import { bindWindowState, loadWindowState, WindowStateTracker } from './window-state';
import { getLanguage, setLanguage, t } from './i18n';

registerMusicScheme();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 禁用硬件加速某些已知 Windows 终端闪烁问题（若需要可启用）
// app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let windowStateTracker: WindowStateTracker | null = null;

function createWindow() {
  const preloadCandidate = path.join(__dirname, '../preload/index.cjs');
  const preloadPath = fs.existsSync(preloadCandidate)
    ? preloadCandidate
    : path.resolve(__dirname, '../../src/preload/index.cjs');

  const iconCandidate = path.resolve(__dirname, '../../resources/icon.png');
  const appIcon = fs.existsSync(iconCandidate) ? iconCandidate : undefined;
  const initialWindow = loadWindowState();

  mainWindow = new BrowserWindow({
    ...(initialWindow.x !== undefined && initialWindow.y !== undefined ? { x: initialWindow.x, y: initialWindow.y } : {}),
    width: initialWindow.width,
    height: initialWindow.height,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: initialWindow.backgroundColor,
    title: 'OneAI',
    icon: appIcon,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    // 隐藏原生标题栏，由顶栏承担拖动与标题栏职责；窗口控件（最小化 / 最大化 / 关闭）以覆盖层显示在右上角，颜色由渲染进程随主题同步
    titleBarStyle: 'hidden',
    titleBarOverlay: initialWindow.titleBarOverlay,
    autoHideMenuBar: true,
  });

  windowStateTracker = bindWindowState(mainWindow, initialWindow);

  // 应用只有一个页面：文件拖到终端以外的区域时 Chromium 会把窗口导航到该文件，整个界面被替换。
  // 一律拦截页面跳转（重新加载不经过 will-navigate，不受影响），新窗口也不打开（链接由 shell:open-external 处理）
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximized-change', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized-change', false));

  ptyManager.setWindow(mainWindow);
  quotaService.setWindow(mainWindow);

  // 首帧渲染完成（ready-to-show）后再一次性显示窗口，彻底消除启动空框；
  // 常驻 PowerShell 系统资源采样、配额轮询与过期截图清理延后 800 ms 启动，让出冷启动期的 CPU 与磁盘开销
  let stopSystemStats: (() => void) | null = null;
  let bgStartupTimer: NodeJS.Timeout | null = null;
  let shown = false;
  const revealWindow = () => {
    if (shown || !mainWindow || mainWindow.isDestroyed()) return;
    shown = true;
    clearTimeout(showFallbackTimer);
    if (initialWindow.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
    bgStartupTimer = setTimeout(() => {
      bgStartupTimer = null;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      quotaService.startPolling(30000);
      stopSystemStats = startSystemStats(mainWindow);
      void cleanupPastedImages();
    }, 800);
  };
  const showFallbackTimer = setTimeout(revealWindow, 3000);
  mainWindow.once('ready-to-show', revealWindow);

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Log ${level}]: ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Renderer Failed Load] code=${errorCode}, desc=${errorDescription}, url=${validatedURL}`);
  });

  // 区分开发与生产环境加载路径
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // 还有终端进程在运行时，关闭窗口先交给界面确认，避免误关丢掉所有 CLI 会话
  let closeConfirmed = false;
  ipcMain.removeAllListeners('window:confirm-close');
  ipcMain.on('window:confirm-close', () => {
    closeConfirmed = true;
    mainWindow?.close();
  });
  let closeRequestedAt = 0;
  // 系统关机或注销时不拦截
  mainWindow.on('session-end', () => { closeConfirmed = true; });
  mainWindow.on('close', (event) => {
    const win = mainWindow;
    if (closeConfirmed || !win || ptyManager.aliveCount() === 0 || win.webContents.isCrashed()) return;
    // 界面没有响应确认请求时，隔 1.5 秒以上再点一次关闭就直接关，避免窗口关不掉
    const now = Date.now();
    if (closeRequestedAt && now - closeRequestedAt > 1500) return;
    closeRequestedAt = now;
    event.preventDefault();
    win.webContents.send('window:close-request', ptyManager.aliveCount());
  });
  ipcMain.removeAllListeners('window:cancel-close');
  ipcMain.on('window:cancel-close', () => { closeRequestedAt = 0; });

  mainWindow.on('closed', () => {
    clearTimeout(showFallbackTimer);
    if (bgStartupTimer) {
      clearTimeout(bgStartupTimer);
      bgStartupTimer = null;
    }
    windowStateTracker = null;
    mainWindow = null;
    stopSystemStats?.();
    stopSystemStats = null;
    quotaService.stopPolling();
    ptyManager.destroyAll();
  });
}

// 注册 IPC 消息通道
function setupIPC() {
  setupWorkspaceStore();
  setupMusicLibrary(() => mainWindow);
  setupFilePreview();
  setupGitBranch();
  setupTaskSummary();
  ipcMain.handle('history:list', (_event, accounts) => listSessionHistory(Array.isArray(accounts) ? accounts : []));
  ipcMain.handle('history:delete', (_event, items) => deleteSessionHistory(Array.isArray(items) ? items : []));
  ipcMain.handle('usage:stats', (_event, accounts) => getUsageStats(accounts));
  ipcMain.handle('app:set-language', (_event, language) => {
    const before = getLanguage();
    setLanguage(language);
    // 额度提示等文案已按旧语言缓存，语言变化后立即重新读取一次
    if (getLanguage() !== before) void quotaService.refreshAllQuotas();
  });
  ipcMain.on('app:home-dir', (event) => { event.returnValue = app.getPath('home'); });
  ipcMain.handle('cli:known', () => listKnownClis());
  ipcMain.handle('cli:detect', (_event, custom) => detectInstalledClis(Array.isArray(custom) ? custom : []));
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle('workspace:select-directory', async (_event, currentPath?: string) => {
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: t('选择工作目录'),
      defaultPath: currentPath && fs.existsSync(currentPath) ? currentPath : app.getPath('home'),
      properties: ['openDirectory'],
    });
    return canceled ? null : filePaths[0] || null;
  });

  ipcMain.handle('terminal:create', async (_event, options) => {
    return ptyManager.createSession(options);
  });

  ipcMain.handle('terminal:get-buffer', async (_event, { id }) => {
    return ptyManager.getSessionBuffer(id);
  });

  ipcMain.handle('terminal:write', async (_event, { id, data }) => ptyManager.writeSession(id, data));

  ipcMain.handle('terminal:resize', async (_event, { id, cols, rows }) => {
    ptyManager.resizeSession(id, cols, rows);
  });

  ipcMain.handle('terminal:kill', async (_event, { id }) => {
    ptyManager.killSession(id);
  });

  ipcMain.handle('terminal:restart', async (_event, { id }) => {
    return ptyManager.restartSession(id);
  });

  ipcMain.handle('terminal:clear-buffer', async (_event, { id }) => {
    ptyManager.clearSessionBuffer(id);
    return true;
  });

  ipcMain.on('terminal:set-active', (_event, id: unknown, cliId?: unknown) => {
    ptyManager.setActiveSession(typeof id === 'string' && id ? id : null);
    quotaService.setActiveCli(typeof cliId === 'string' && cliId ? cliId : null);
  });

  ipcMain.handle('quota:get', async (_event, cliId?: string) => {
    return quotaService.getQuota(cliId);
  });

  ipcMain.handle('quota:get-all', async () => {
    return quotaService.getAllQuotas();
  });

  ipcMain.handle('quota:refresh', async (_event, cliId?: string) => {
    return quotaService.refreshQuota(cliId);
  });

  // 窗口控件覆盖层与窗口底色随主题变色并持久化；只接受 #rrggbb 与合理的高度
  ipcMain.on('window:set-title-bar-overlay', (_event, opts: { color?: unknown; symbolColor?: unknown; height?: unknown; backgroundColor?: unknown }) => {
    const hex = /^#[0-9a-f]{6}$/i;
    if (typeof opts?.color !== 'string' || !hex.test(opts.color) || typeof opts.symbolColor !== 'string' || !hex.test(opts.symbolColor)) return;
    const height = typeof opts.height === 'number' && opts.height >= 24 && opts.height <= 80 ? Math.round(opts.height) : 44;
    const backgroundColor = typeof opts.backgroundColor === 'string' && hex.test(opts.backgroundColor) ? opts.backgroundColor : undefined;
    try { mainWindow?.setTitleBarOverlay({ color: opts.color, symbolColor: opts.symbolColor, height }); } catch {}
    if (backgroundColor) {
      try { mainWindow?.setBackgroundColor(backgroundColor); } catch {}
    }
    windowStateTracker?.updateAppearance({ color: opts.color, symbolColor: opts.symbolColor, height, backgroundColor });
  });

  ipcMain.handle('account:login-status', (_event, account) => checkAccountLogin(account));

  // 多账号：渲染进程同步账号列表，额度服务按各账号的配置目录单独读取
  ipcMain.handle('quota:set-accounts', async (_event, accounts: Array<{ key: string; cliId: string; configDir: string }>) => {
    quotaService.setAccounts(Array.isArray(accounts) ? accounts : []);
  });

  // 读取剪贴板内容（支持纯文本，以及图片自动存盘返回临时路径）
  ipcMain.handle('clipboard:read-paste-content', async () => {
    try {
      // 1. 优先读取纯文本
      const text = clipboard.readText();
      if (text && text.trim().length > 0) {
        return { type: 'text', content: text };
      }

      // 2. 复制的是文件（资源管理器、微信等常以文件形式放图片）：readText / readImage 都为空，
      //    改读 FileNameW 拿到路径，与拖拽文件的行为一致；Electron 只能读到第一个文件
      const fileNameW = clipboard.readBuffer('FileNameW');
      if (fileNameW.length > 0) {
        const filePath = fileNameW.toString('utf16le').replace(/\0+$/, '');
        if (filePath) {
          try {
            await fs.promises.access(filePath);
            return { type: 'file-path', content: filePath.includes(' ') ? `"${filePath}"` : filePath };
          } catch {}
        }
      }

      // 3. 检查剪贴板是否含有位图（如截图、复制的图像）
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const pngBuffer = img.toPNG();
        const tempDir = path.join(app.getPath('temp'), 'OneAI_Images');
        await fs.promises.mkdir(tempDir, { recursive: true });
        const filename = `paste_${Date.now()}.png`;
        const fullPath = path.join(tempDir, filename);
        await fs.promises.writeFile(fullPath, pngBuffer);
        return { type: 'image-path', content: fullPath.includes(' ') ? `"${fullPath}"` : fullPath };
      }
    } catch (e) {
      console.error('[OneAI] Error reading clipboard paste content:', e);
    }
    return { type: 'none', content: '' };
  });

  // 写入系统剪贴板纯文本
  ipcMain.handle('clipboard:write-text', async (_event, text: string) => {
    try {
      if (typeof text === 'string') {
        clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      console.error('[OneAI] Error writing text to clipboard:', e);
    }
    return false;
  });

  // 在系统默认浏览器中打开外部超链接
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    try {
      if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
        await shell.openExternal(url);
        return true;
      }
    } catch (e) {
      console.error('[OneAI] Error opening external URL:', e);
    }
    return false;
  });

  // 在资源管理器中打开任务的工作目录；只接受已存在的文件夹
  ipcMain.handle('shell:open-directory', async (_event, dir: string) => {
    try {
      if (typeof dir === 'string' && (await fs.promises.stat(dir)).isDirectory()) {
        return (await shell.openPath(dir)) === '';
      }
    } catch {
      // 目录不存在或无法访问
    }
    return false;
  });

  // 弹出保存文件对话框，将终端完整日志存盘
  ipcMain.handle('dialog:save-log-file', async (_event, { defaultName, content }: { defaultName: string; content: string }) => {
    try {
      if (!mainWindow) return { success: false, error: 'No main window' };
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: t('导出终端会话完整日志'),
        defaultPath: defaultName || `terminal-log-${Date.now()}.txt`,
        filters: [
          { name: t('Markdown 文档 (*.md)'), extensions: ['md'] },
          { name: t('文本文件 (*.txt)'), extensions: ['txt'] },
          { name: t('所有文件 (*.*)'), extensions: ['*'] },
        ],
      });
      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return { success: true, filePath };
    } catch (e: any) {
      console.error('[OneAI] Error saving log file:', e);
      return { success: false, error: e?.message || String(e) };
    }
  });
}

/** 粘贴截图时存入临时目录的 paste_<时间戳>.png 只在粘贴当下有用：启动时删掉 7 天前的，只动这个命名格式的文件 */
async function cleanupPastedImages(): Promise<void> {
  const dir = path.join(app.getPath('temp'), 'OneAI_Images');
  const cutoff = Date.now() - 7 * 24 * 3600_000;
  let names: string[];
  try { names = await fs.promises.readdir(dir); } catch { return; }
  for (const name of names) {
    if (!/^paste_\d+\.png$/.test(name)) continue;
    const file = path.join(dir, name);
    try {
      if ((await fs.promises.stat(file)).mtimeMs < cutoff) await fs.promises.unlink(file);
    } catch { /* 文件正被占用或已删除时跳过 */ }
  }
}

app.whenReady().then(() => {
  // 去掉 Electron 默认菜单：它的 Ctrl+W 关窗、Ctrl+R 刷新与 CLI 常用键冲突，按 Alt 还会弹出菜单栏抢走焦点。
  // 开发模式保留，方便用 Ctrl+Shift+I 打开开发者工具。
  if (!process.env.VITE_DEV_SERVER_URL) Menu.setApplicationMenu(null);
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  quotaService.stopPolling();
  ptyManager.destroyAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
