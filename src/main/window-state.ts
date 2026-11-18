import { app, BrowserWindow, nativeTheme, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface TitleBarOverlayColors {
  color: string;
  symbolColor: string;
  height: number;
}

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface WindowState extends WindowBounds {
  isMaximized: boolean;
  backgroundColor: string;
  titleBarOverlay: TitleBarOverlayColors;
}

export interface DisplayWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAVE_DEBOUNCE_MS = 400;

function stateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function defaultAppearance(preferDark = true): Pick<WindowState, 'backgroundColor' | 'titleBarOverlay'> {
  return preferDark
    ? {
        backgroundColor: '#0d1117',
        titleBarOverlay: { color: '#141d27', symbolColor: '#e2e8f0', height: 44 },
      }
    : {
        backgroundColor: '#ffffff',
        titleBarOverlay: { color: '#f0f3f6', symbolColor: '#1f2328', height: 44 },
      };
}

/**
 * 校验已保存的窗口坐标是否仍在当前可见显示器工作区内，且顶栏拖动区未被顶出屏幕上沿；
 * 拔掉副屏或分辨率变化导致越界时丢弃 x/y，由系统在主屏居中显示。
 */
export function resolveVisibleBounds(
  raw: Record<string, unknown> | null | undefined,
  workAreas: ReadonlyArray<DisplayWorkArea>,
): WindowBounds {
  const rawW = typeof raw?.width === 'number' && Number.isFinite(raw.width) ? Math.round(raw.width) : DEFAULT_WIDTH;
  const rawH = typeof raw?.height === 'number' && Number.isFinite(raw.height) ? Math.round(raw.height) : DEFAULT_HEIGHT;
  const width = Math.max(MIN_WIDTH, rawW);
  const height = Math.max(MIN_HEIGHT, rawH);

  const rawX = typeof raw?.x === 'number' && Number.isFinite(raw.x) ? Math.round(raw.x) : undefined;
  const rawY = typeof raw?.y === 'number' && Number.isFinite(raw.y) ? Math.round(raw.y) : undefined;

  if (rawX !== undefined && rawY !== undefined && workAreas.length > 0) {
    for (const area of workAreas) {
      const overlapX = Math.min(rawX + width, area.x + area.width) - Math.max(rawX, area.x);
      const overlapY = Math.min(rawY + height, area.y + area.height) - Math.max(rawY, area.y);
      // 至少保留 120×80 可见区域，且窗口上沿不能高于工作区顶部太多（避免无边框顶栏无法被鼠标拖回）
      if (overlapX >= 120 && overlapY >= 80 && rawY >= area.y - 12 && rawY <= area.y + area.height - 44) {
        return {
          x: rawX,
          y: rawY,
          width: Math.max(MIN_WIDTH, Math.min(width, Math.max(MIN_WIDTH, area.width))),
          height: Math.max(MIN_HEIGHT, Math.min(height, Math.max(MIN_HEIGHT, area.height))),
        };
      }
    }
  }

  const primary = workAreas[0];
  return {
    width: primary ? Math.max(MIN_WIDTH, Math.min(width, Math.max(MIN_WIDTH, primary.width))) : width,
    height: primary ? Math.max(MIN_HEIGHT, Math.min(height, Math.max(MIN_HEIGHT, primary.height))) : height,
  };
}

export function loadWindowState(): WindowState {
  const fallback = defaultAppearance(nativeTheme?.shouldUseDarkColors ?? true);
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(fs.readFileSync(stateFile(), 'utf-8'));
  } catch {
    parsed = null;
  }

  let workAreas: DisplayWorkArea[] = [];
  try {
    const primary = screen.getPrimaryDisplay().workArea;
    const others = screen.getAllDisplays().map((d) => d.workArea).filter((a) => a.x !== primary.x || a.y !== primary.y);
    workAreas = [primary, ...others];
  } catch {
    workAreas = [];
  }

  const bounds = resolveVisibleBounds(parsed, workAreas);
  const isMaximized = parsed?.isMaximized === true;
  const backgroundColor = typeof parsed?.backgroundColor === 'string' && HEX_COLOR.test(parsed.backgroundColor)
    ? parsed.backgroundColor
    : fallback.backgroundColor;

  const rawOverlay = parsed?.titleBarOverlay && typeof parsed.titleBarOverlay === 'object'
    ? (parsed.titleBarOverlay as Record<string, unknown>)
    : null;
  const overlayColor = typeof rawOverlay?.color === 'string' && HEX_COLOR.test(rawOverlay.color)
    ? rawOverlay.color
    : fallback.titleBarOverlay.color;
  const symbolColor = typeof rawOverlay?.symbolColor === 'string' && HEX_COLOR.test(rawOverlay.symbolColor)
    ? rawOverlay.symbolColor
    : fallback.titleBarOverlay.symbolColor;
  const overlayHeight = typeof rawOverlay?.height === 'number' && rawOverlay.height >= 24 && rawOverlay.height <= 80
    ? Math.round(rawOverlay.height)
    : fallback.titleBarOverlay.height;

  return {
    ...bounds,
    isMaximized,
    backgroundColor,
    titleBarOverlay: { color: overlayColor, symbolColor, height: overlayHeight },
  };
}

export interface WindowStateTracker {
  updateAppearance: (opts: { backgroundColor?: string; color: string; symbolColor: string; height: number }) => void;
  flushSync: () => void;
}

export function bindWindowState(win: BrowserWindow, initial: WindowState): WindowStateTracker {
  const state: WindowState = {
    ...initial,
    titleBarOverlay: { ...initial.titleBarOverlay },
  };
  let timer: NodeJS.Timeout | null = null;
  let pendingJson: string | null = null;
  let writing = false;
  let lastSavedJson = JSON.stringify(state);

  const writeAsync = async () => {
    if (writing) return;
    writing = true;
    try {
      while (pendingJson !== null) {
        const json = pendingJson;
        pendingJson = null;
        const file = stateFile();
        const tmp = `${file}.tmp`;
        try {
          await fs.promises.mkdir(path.dirname(file), { recursive: true });
          await fs.promises.writeFile(tmp, json, 'utf-8');
          await fs.promises.rename(tmp, file);
          lastSavedJson = json;
        } catch {
          // 窗口状态落盘失败不影响运行
        }
      }
    } finally {
      writing = false;
    }
  };

  const scheduleSave = () => {
    const json = JSON.stringify(state);
    if (json === (pendingJson ?? lastSavedJson)) return;
    pendingJson = json;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void writeAsync();
    }, SAVE_DEBOUNCE_MS);
  };

  const flushSync = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const json = JSON.stringify(state);
    pendingJson = null;
    if (json === lastSavedJson) return;
    const file = stateFile();
    const tmp = `${file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, json, 'utf-8');
      fs.renameSync(tmp, file);
      lastSavedJson = json;
    } catch {
      // 忽略退出落盘异常
    }
  };

  const captureNormalBounds = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    if (win.isMaximized()) {
      state.isMaximized = true;
      scheduleSave();
      return;
    }
    const b = win.getBounds();
    state.x = b.x;
    state.y = b.y;
    state.width = Math.max(MIN_WIDTH, b.width);
    state.height = Math.max(MIN_HEIGHT, b.height);
    state.isMaximized = false;
    scheduleSave();
  };

  win.on('resize', captureNormalBounds);
  win.on('move', captureNormalBounds);
  win.on('maximize', () => {
    state.isMaximized = true;
    scheduleSave();
  });
  win.on('unmaximize', () => {
    state.isMaximized = false;
    captureNormalBounds();
  });
  win.on('close', () => {
    if (!win.isDestroyed() && !win.isMinimized()) {
      state.isMaximized = win.isMaximized();
      if (!state.isMaximized) {
        const b = win.getBounds();
        state.x = b.x;
        state.y = b.y;
        state.width = Math.max(MIN_WIDTH, b.width);
        state.height = Math.max(MIN_HEIGHT, b.height);
      }
    }
    flushSync();
  });

  const onBeforeQuit = () => flushSync();
  app.on('before-quit', onBeforeQuit);
  win.on('closed', () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    app.removeListener('before-quit', onBeforeQuit);
  });

  return {
    updateAppearance(opts) {
      if (opts.backgroundColor && HEX_COLOR.test(opts.backgroundColor)) {
        state.backgroundColor = opts.backgroundColor;
      }
      state.titleBarOverlay = {
        color: opts.color,
        symbolColor: opts.symbolColor,
        height: opts.height,
      };
      scheduleSave();
    },
    flushSync,
  };
}
