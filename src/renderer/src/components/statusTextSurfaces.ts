export interface StatusTextSurface {
  node: Text;
  left: number;
  right: number;
  y: number;
}

export interface AmbientCanvasLayer {
  order: number;
  intensity: number;
  onResize: (width: number, height: number) => void;
  onDraw: (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scaleX: number,
    scaleY: number,
    dt: number,
    now: number,
  ) => void;
}

const MAX_AMBIENT_DPR = 2;
// 限制全屏氛围层画布总像素预算（约 240 万像素），避免 4K / 高分屏分配数千万像素导致 GPU 合成占用飙升
const MAX_AMBIENT_CANVAS_PIXELS = 2_400_000;
const TARGET_FRAME_INTERVAL_MS = 1000 / 36;
const MAX_DT_SEC = 0.05;

export function resolveAmbientDpr(width: number, height: number): number {
  const raw = Math.min(window.devicePixelRatio || 1, MAX_AMBIENT_DPR);
  const area = Math.max(1, width * height);
  const budget = Math.sqrt(MAX_AMBIENT_CANVAS_PIXELS / area);
  return Math.max(0.5, Math.min(raw, budget));
}

type AmbientLayerId = 'rain' | 'snow';

const layers = new Map<AmbientLayerId, AmbientCanvasLayer>();
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;
let sharedWidth = 1;
let sharedHeight = 1;
let sharedScaleX = 1;
let sharedScaleY = 1;
let sharedRafId = 0;
let sharedLastDrawTime = 0;
let sharedWindowFocused = true;
let sharedReducedMotion = false;
let sharedBound = false;

const shouldPauseAmbient = () => sharedReducedMotion || document.hidden || !sharedWindowFocused;

const syncCanvasAttributes = () => {
  if (!sharedCanvas) return;
  const rain = layers.get('rain');
  if (rain) {
    sharedCanvas.setAttribute('data-workspace-rain', '');
    sharedCanvas.setAttribute('data-rain-intensity', String(rain.intensity));
  } else {
    sharedCanvas.removeAttribute('data-workspace-rain');
    sharedCanvas.removeAttribute('data-rain-intensity');
  }
  const snow = layers.get('snow');
  if (snow) {
    sharedCanvas.setAttribute('data-workspace-snow', '');
    sharedCanvas.setAttribute('data-snow-intensity', String(snow.intensity));
  } else {
    sharedCanvas.removeAttribute('data-workspace-snow');
    sharedCanvas.removeAttribute('data-snow-intensity');
  }
};

const drawSharedFrame = (dt: number, now: number) => {
  if (!sharedCtx || layers.size === 0) return;
  sharedCtx.setTransform(sharedScaleX, 0, 0, sharedScaleY, 0, 0);
  sharedCtx.clearRect(0, 0, sharedWidth, sharedHeight);
  const ordered = [...layers.values()].sort((a, b) => a.order - b.order);
  for (let i = 0; i < ordered.length; i++) {
    ordered[i].onDraw(sharedCtx, sharedWidth, sharedHeight, sharedScaleX, sharedScaleY, dt, now);
  }
  sharedCtx.setTransform(sharedScaleX, 0, 0, sharedScaleY, 0, 0);
  sharedCtx.globalAlpha = 1;
};

const syncSharedSize = () => {
  if (!sharedCanvas || !sharedCtx) return;
  invalidateStatusTextSurfaces();
  sharedWidth = Math.max(1, window.innerWidth);
  sharedHeight = Math.max(1, window.innerHeight);
  const dpr = resolveAmbientDpr(sharedWidth, sharedHeight);
  const nextW = Math.max(1, Math.round(sharedWidth * dpr));
  const nextH = Math.max(1, Math.round(sharedHeight * dpr));
  if (sharedCanvas.width !== nextW) sharedCanvas.width = nextW;
  if (sharedCanvas.height !== nextH) sharedCanvas.height = nextH;
  sharedScaleX = nextW / sharedWidth;
  sharedScaleY = nextH / sharedHeight;
  sharedCtx.setTransform(sharedScaleX, 0, 0, sharedScaleY, 0, 0);
  for (const layer of layers.values()) layer.onResize(sharedWidth, sharedHeight);
};

const stopSharedClock = () => {
  if (sharedRafId) {
    cancelAnimationFrame(sharedRafId);
    sharedRafId = 0;
  }
};

const tickSharedClock = (now: number) => {
  sharedRafId = 0;
  if (layers.size === 0 || shouldPauseAmbient()) return;
  if (sharedLastDrawTime > 0 && now - sharedLastDrawTime < TARGET_FRAME_INTERVAL_MS - 1) {
    sharedRafId = requestAnimationFrame(tickSharedClock);
    return;
  }
  const dt = sharedLastDrawTime > 0 ? Math.min(MAX_DT_SEC, (now - sharedLastDrawTime) / 1000) : 1 / 36;
  sharedLastDrawTime = now;
  drawSharedFrame(dt, now);
  if (layers.size > 0 && !shouldPauseAmbient()) {
    sharedRafId = requestAnimationFrame(tickSharedClock);
  }
};

const startSharedClock = () => {
  if (layers.size === 0) return;
  if (sharedReducedMotion) {
    drawSharedFrame(0, performance.now());
    return;
  }
  if (shouldPauseAmbient() || sharedRafId) return;
  sharedLastDrawTime = 0;
  sharedRafId = requestAnimationFrame(tickSharedClock);
};

const onSharedFocus = () => {
  sharedWindowFocused = true;
  startSharedClock();
};

const onSharedBlur = () => {
  sharedWindowFocused = false;
  stopSharedClock();
};

const onSharedVisibility = () => {
  if (shouldPauseAmbient()) stopSharedClock();
  else startSharedClock();
};

const onSharedResize = () => {
  syncSharedSize();
  if (sharedReducedMotion) drawSharedFrame(0, performance.now());
};

const ensureSharedCanvas = () => {
  if (!sharedCanvas) {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'pointer-events-none fixed inset-0 z-40 h-full w-full';
    document.body.appendChild(canvas);
    sharedCanvas = canvas;
    sharedCtx = canvas.getContext('2d');
  }
  if (!sharedBound) {
    sharedWindowFocused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    sharedReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.addEventListener('resize', onSharedResize);
    window.addEventListener('focus', onSharedFocus);
    window.addEventListener('blur', onSharedBlur);
    document.addEventListener('visibilitychange', onSharedVisibility);
    sharedBound = true;
  }
};

const teardownSharedCanvas = () => {
  stopSharedClock();
  sharedLastDrawTime = 0;
  if (sharedBound) {
    window.removeEventListener('resize', onSharedResize);
    window.removeEventListener('focus', onSharedFocus);
    window.removeEventListener('blur', onSharedBlur);
    document.removeEventListener('visibilitychange', onSharedVisibility);
    sharedBound = false;
  }
  if (sharedCanvas) {
    sharedCanvas.remove();
    sharedCanvas = null;
    sharedCtx = null;
  }
};

/**
 * 雨雪氛围层共用同一个全屏 Canvas 与 36 FPS 帧时钟：
 * 两者同时开启时只需 1 次清屏与 1 个全屏合成层，避免双全屏 Canvas 在 4K 下产生额外 GPU 合成开销；
 * 全部关闭时从 DOM 彻底卸载，零常驻开销。
 */
export function registerAmbientCanvasLayer(id: AmbientLayerId, layer: AmbientCanvasLayer): () => void {
  const isFirst = layers.size === 0;
  ensureSharedCanvas();
  layers.set(id, layer);
  syncCanvasAttributes();
  if (isFirst) {
    syncSharedSize();
  } else {
    layer.onResize(sharedWidth, sharedHeight);
  }
  startSharedClock();
  return () => {
    if (layers.get(id) !== layer) return;
    layers.delete(id);
    if (layers.size === 0) {
      teardownSharedCanvas();
    } else {
      syncCanvasAttributes();
      if (sharedReducedMotion) drawSharedFrame(0, performance.now());
    }
  };
}

export function updateAmbientLayerIntensity(id: AmbientLayerId, intensity: number) {
  const layer = layers.get(id);
  if (!layer) return;
  layer.intensity = intensity;
  syncCanvasAttributes();
  if (sharedReducedMotion) drawSharedFrame(0, performance.now());
}

let nextRefresh = 0;
let surfaces: StatusTextSurface[] = [];

// 雨和雪共用文字位置。限频读取布局，窗口缩放时立即刷新。
export function readStatusTextSurfaces(now: number): readonly StatusTextSurface[] {
  if (now < nextRefresh) return surfaces;
  nextRefresh = now + 1000;
  const bar = document.getElementById('oneai-statusbar');
  const row = bar?.lastElementChild;
  if (!row) {
    if (surfaces.length) surfaces = [];
    return surfaces;
  }

  const rowRect = row.getBoundingClientRect();
  if (!rowRect.width || !rowRect.height) {
    if (surfaces.length) surfaces = [];
    return surfaces;
  }
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const clipCache = new Map<Element, DOMRect>();
  const next: StatusTextSurface[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (parent?.closest('[aria-hidden="true"]')) continue;
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= rowRect.top || rect.top >= rowRect.bottom) continue;
    const clipEl = parent?.closest('.overflow-hidden, .truncate');
    let clip = rowRect;
    if (clipEl) {
      const cached = clipCache.get(clipEl);
      if (cached) {
        clip = cached;
      } else {
        clip = clipEl.getBoundingClientRect();
        clipCache.set(clipEl, clip);
      }
    }
    const left = Math.max(rowRect.left, clip.left, rect.left);
    const right = Math.min(rowRect.right, clip.right, rect.right);
    if (right > left) next.push({ node: node as Text, left, right, y: Math.max(rowRect.top, rect.top + 2) });
  }
  next.sort((a, b) => a.y - b.y);
  if (next.length !== surfaces.length || next.some(({ node, left, right, y }, i) => {
    const previous = surfaces[i];
    return node !== previous.node || left !== previous.left || right !== previous.right || y !== previous.y;
  })) surfaces = next;
  return surfaces;
}

export function invalidateStatusTextSurfaces() {
  nextRefresh = 0;
}
