import { app, BrowserWindow, ipcMain, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ptyManager } from './pty-manager';
import { quotaService } from './quota-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 禁用硬件加速某些已知 Windows 终端闪烁问题（若需要可启用）
// app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const preloadCandidate = path.join(__dirname, '../preload/index.cjs');
  const preloadPath = fs.existsSync(preloadCandidate)
    ? preloadCandidate
    : path.resolve(__dirname, '../../src/preload/index.cjs');

  const iconCandidate = path.resolve(__dirname, '../../resources/app-icon.jpg');
  const appIcon = fs.existsSync(iconCandidate) ? iconCandidate : undefined;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e1117',
    title: 'OneAI - 多 CLI AI 编程工作台',
    icon: appIcon,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
    // 暗色主题标题栏
    titleBarStyle: 'default',
    autoHideMenuBar: true,
  });

  ptyManager.setWindow(mainWindow);
  quotaService.setWindow(mainWindow);
  quotaService.startPolling(30000); // 每 30 秒轮询一次大模型配额

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

  mainWindow.on('closed', () => {
    mainWindow = null;
    quotaService.stopPolling();
    ptyManager.destroyAll();
  });
}

// 注册 IPC 消息通道
function setupIPC() {
  ipcMain.handle('terminal:create', async (_event, options) => {
    return ptyManager.createSession(options);
  });

  ipcMain.handle('terminal:get-buffer', async (_event, { id }) => {
    return ptyManager.getSessionBuffer(id);
  });

  ipcMain.handle('terminal:write', async (_event, { id, data }) => {
    ptyManager.writeSession(id, data);
  });

  ipcMain.handle('terminal:resize', async (_event, { id, cols, rows }) => {
    ptyManager.resizeSession(id, cols, rows);
  });

  ipcMain.handle('terminal:kill', async (_event, { id }) => {
    ptyManager.killSession(id);
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

  // 读取剪贴板内容（支持纯文本，以及图片自动存盘返回临时路径）
  ipcMain.handle('clipboard:read-paste-content', async () => {
    try {
      // 1. 优先读取纯文本
      const text = clipboard.readText();
      if (text && text.trim().length > 0) {
        return { type: 'text', content: text };
      }

      // 2. 检查剪贴板是否含有图片（如截图、复制的图像）
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const pngBuffer = img.toPNG();
        const tempDir = path.join(app.getPath('temp'), 'OneAI_Images');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        const filename = `paste_${Date.now()}.png`;
        const fullPath = path.join(tempDir, filename);
        fs.writeFileSync(fullPath, pngBuffer);
        return { type: 'image-path', content: fullPath.includes(' ') ? `"${fullPath}"` : fullPath };
      }
    } catch (e) {
      console.error('[OneAI] Error reading clipboard paste content:', e);
    }
    return { type: 'none', content: '' };
  });
}

app.whenReady().then(() => {
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
