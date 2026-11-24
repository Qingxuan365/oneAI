import { app, BrowserWindow, ipcMain, clipboard, shell, dialog, Menu, screen, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ptyManager } from './pty-manager';
import { quotaService } from './quota-service';
import { setSystemStatsEnabled, startSystemStats } from './system-stats';
import { checkAccountLogin } from './account-login';
import { setupGitBranch } from './git-branch';
import { setupTaskSummary } from './task-summary';
import { listSessionHistory, deleteSessionHistory } from './session-history';
import { getDashboardStats, getUsageStats } from './usage-stats';
import { detectInstalledClis, listKnownClis } from './cli-detect';
import { setupWorkspaceStore } from './workspace-store';
import { registerMusicScheme, setupMusicLibrary } from './music-library';
import { allowPreviewFilePaths, isImageExtension, setupFilePreview } from './file-preview';
import { setupProjectTree } from './project-tree';
import { bindWindowState, loadWindowState, WindowStateTracker } from './window-state';
import { getLanguage, setLanguage, t } from './i18n';
import { quoteTerminalPath } from '../shared/paths';
import { encodeBgraToPng } from './png-encode';
import { startDiagnostics, timed, watchWindow } from './diagnostics';

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

  // 上次是最大化时，直接按所在屏幕工作区尺寸创建窗口，让首帧按最大化尺寸渲染；
  // 否则先按还原尺寸渲染再 maximize()，显示瞬间只有左上角一块还原尺寸的画面，其余区域空白
  const restoreBounds = {
    x: initialWindow.x ?? 0,
    y: initialWindow.y ?? 0,
    width: initialWindow.width,
    height: initialWindow.height,
  };
  const startBounds = initialWindow.isMaximized
    ? screen.getDisplayMatching(restoreBounds).workArea
    : initialWindow.x !== undefined && initialWindow.y !== undefined
      ? restoreBounds
      : { width: initialWindow.width, height: initialWindow.height };

  mainWindow = new BrowserWindow({
    ...startBounds,
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
  watchWindow(mainWindow);

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
      // 窗口按工作区尺寸创建，首次取消最大化时恢复到上次保存的还原尺寸
      mainWindow.once('unmaximize', () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (initialWindow.x !== undefined && initialWindow.y !== undefined) mainWindow.setBounds(restoreBounds);
        else { mainWindow.setSize(restoreBounds.width, restoreBounds.height); mainWindow.center(); }
      });
    }
    mainWindow.show();
    bgStartupTimer = setTimeout(() => {
      bgStartupTimer = null;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      timed('quota polling start', () => quotaService.startPolling(30000));
      stopSystemStats = timed('system stats start', () => startSystemStats(mainWindow!));
      void timed('pasted image cleanup start', () => cleanupPastedImages());
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
  setupProjectTree();
  setupGitBranch();
  setupTaskSummary();
  ipcMain.handle('history:list', (_event, accounts) => listSessionHistory(Array.isArray(accounts) ? accounts : []));
  ipcMain.handle('history:delete', (_event, items) => deleteSessionHistory(Array.isArray(items) ? items : []));
  ipcMain.handle('usage:stats', (_event, accounts) => getUsageStats(accounts));
  ipcMain.handle('dashboard:stats', (_event, accounts) => getDashboardStats(accounts));
  ipcMain.handle('app:set-language', (_event, language) => {
    const before = getLanguage();
    setLanguage(language);
    // 额度提示等文案已按旧语言缓存，语言变化后立即重新读取一次
    if (getLanguage() !== before) void quotaService.refreshAllQuotas(true);
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

  ipcMain.handle('terminal:get-snapshot', async (_event, { id }) => {
    return ptyManager.getSessionSnapshot(id);
  });

  ipcMain.handle('terminal:write', async (_event, { id, data }) => ptyManager.writeSession(id, data));

  ipcMain.handle('terminal:resize', async (_event, { id, cols, rows }) => {
    ptyManager.resizeSession(id, cols, rows);
  });

  ipcMain.handle('terminal:kill', async (_event, { id }) => {
    ptyManager.killSession(id);
  });

  ipcMain.handle('terminal:restart', async (_event, payload) => {
    const { id, ...freshOptions } = payload || {};
    return ptyManager.restartSession(id, freshOptions);
  });

  ipcMain.handle('terminal:clear-buffer', async (_event, { id }) => {
    ptyManager.clearSessionBuffer(id);
    return true;
  });

  ipcMain.on('system:set-stats-enabled', (_event, enabled: unknown) => {
    setSystemStatsEnabled(enabled !== false);
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

  // 读取剪贴板内容（支持纯文本含空白缩进、复制文件转路径，以及图片自动存盘返回临时路径）
  let pasteSeq = 0;
  ipcMain.handle('clipboard:read-paste-content', async () => {
    try {
      // 1. 优先读取纯文本（保留纯空格、缩进或换行文本，不再用 trim() 丢弃）
      const text = clipboard.readText();
      if (text && text.length > 0) {
        return { type: 'text', content: text };
      }

      // 2. 复制的是文件（资源管理器、微信等常以文件形式放图片）：readText / readImage 都为空，
      //    改读 FileNameW 拿到路径，与拖拽文件的行为一致；若是图片则同步登记至预览白名单
      const fileNameW = clipboard.readBuffer('FileNameW');
      if (fileNameW.length > 0) {
        const filePath = fileNameW.toString('utf16le').replace(/\0+$/, '');
        if (filePath) {
          try {
            await fs.promises.access(filePath);
            if (isImageExtension(filePath)) {
              await allowPreviewFilePaths([filePath]);
            }
            return { type: 'file-path', content: quoteTerminalPath(filePath) };
          } catch {}
        }
      }

      // 3. 检查剪贴板是否含有位图（如截图、复制的图像）
      // 先看格式再读取，纯文本粘贴不碰位图；PNG 编码放到 worker，主线程只取原始像素（BGRA）
      const img = clipboard.availableFormats().some((format) => format.startsWith('image/')) ? clipboard.readImage() : null;
      if (img && !img.isEmpty()) {
        const { width, height } = img.getSize();
        const pngBuffer = await encodeBgraToPng(img.toBitmap(), width, height).catch(() => img.toPNG());
        const tempDir = path.join(app.getPath('temp'), 'OneAI_Images');
        await fs.promises.mkdir(tempDir, { recursive: true });
        pasteSeq = (pasteSeq + 1) % 10000;
        const filename = pasteSeq === 1 ? `paste_${Date.now()}.png` : `paste_${Date.now()}_${pasteSeq}.png`;
        const fullPath = path.join(tempDir, filename);
        await fs.promises.writeFile(fullPath, pngBuffer);
        return { type: 'image-path', content: quoteTerminalPath(fullPath) };
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

  // 在系统资源管理器中定位并选中指定文件或文件夹
  ipcMain.handle('shell:reveal-in-explorer', async (_event, targetPath: string) => {
    try {
      if (typeof targetPath === 'string' && targetPath.trim()) {
        const resolved = path.resolve(targetPath);
        await fs.promises.lstat(resolved);
        shell.showItemInFolder(resolved);
        return true;
      }
    } catch {}
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
    if (!/^paste_\d+(?:_\d+)?\.png$/.test(name)) continue;
    const file = path.join(dir, name);
    try {
      if ((await fs.promises.stat(file)).mtimeMs < cutoff) await fs.promises.unlink(file);
    } catch { /* 文件正被占用或已删除时跳过 */ }
  }
}

// 只允许一个实例：第二个实例拿不到 localStorage 的数据库锁，会读到空设置而重新弹出首次引导（语言、主题都像被重置），
// 还会与第一个实例同时写工作区文件。再次启动时改为聚焦已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return;
  startDiagnostics();
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

app.on('before-quit', () => {
  // localStorage（设置、引导状态）由 Chromium 延迟写盘，退出前主动刷盘，避免最近的改动丢失
  try { session.defaultSession.flushStorageData(); } catch {}
  quotaService.stopPolling();
  ptyManager.destroyAll();
});

app.on('window-all-closed', () => {
  quotaService.stopPolling();
  ptyManager.destroyAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
