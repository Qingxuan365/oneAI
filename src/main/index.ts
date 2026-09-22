import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ptyManager } from './pty-manager';
import { quotaService } from './quota-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 禁用硬件加速某些已知 Windows 终端闪烁问题（若需要可启用）
// app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e1117',
    title: 'OneDesktop - 多 CLI AI 编程工作台',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
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

  ipcMain.handle('terminal:write', async (_event, { id, data }) => {
    ptyManager.writeSession(id, data);
  });

  ipcMain.handle('terminal:resize', async (_event, { id, cols, rows }) => {
    ptyManager.resizeSession(id, cols, rows);
  });

  ipcMain.handle('terminal:kill', async (_event, { id }) => {
    ptyManager.killSession(id);
  });

  ipcMain.handle('quota:get', async () => {
    return quotaService.getQuota();
  });

  ipcMain.handle('quota:refresh', async () => {
    return quotaService.refreshQuota();
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
