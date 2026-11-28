// 白噪音：用 Web Audio 实时合成雨声、风声和棕噪音，不依赖音频资源文件，关闭时关闭 AudioContext，零后台开销。
export type WhiteNoiseKind = 'off' | 'follow' | 'rain' | 'wind' | 'brown';
export type WhiteNoiseSound = 'rain' | 'wind' | 'brown';

export const WHITE_NOISE_KINDS: WhiteNoiseKind[] = ['off', 'follow', 'rain', 'wind', 'brown'];

export function isWhiteNoiseKind(value: unknown): value is WhiteNoiseKind {
  return typeof value === 'string' && (WHITE_NOISE_KINDS as string[]).includes(value);
}

export function clampWhiteNoiseVolume(value: unknown, fallback = 40): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** 把设置换算成实际播放的声音与 0~1 的响度；「跟随雨雪」按画面强度选声音并随之调节响度。 */
export function resolveWhiteNoise(
  kind: WhiteNoiseKind,
  volume: number,
  rainIntensity: number,
  snowIntensity: number,
): { sound: WhiteNoiseSound | null; level: number } {
  const base = clampWhiteNoiseVolume(volume, 0) / 100;
  if (kind === 'off' || base <= 0) return { sound: null, level: 0 };
  if (kind !== 'follow') return { sound: kind, level: base };
  if (rainIntensity > 0) return { sound: 'rain', level: base * (0.4 + 0.6 * rainIntensity / 100) };
  if (snowIntensity > 0) return { sound: 'wind', level: base * (0.4 + 0.6 * snowIntensity / 100) };
  return { sound: null, level: 0 };
}

const FADE_SECONDS = 0.6;
const MAX_GAIN = 0.5;
const BUFFER_SECONDS = 6;

interface ActiveSound {
  sound: WhiteNoiseSound;
  out: GainNode;
  stop: () => void;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let white: AudioBuffer | null = null;
let brown: AudioBuffer | null = null;
let active: ActiveSound | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let unlockBound = false;

function makeBuffer(audio: AudioContext, brownian: boolean): AudioBuffer {
  const buffer = audio.createBuffer(1, audio.sampleRate * BUFFER_SECONDS, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brownian) {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = w;
    }
  }
  return buffer;
}

function loopSource(audio: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const src = audio.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

function lfo(audio: AudioContext, hz: number, depth: number, target: AudioParam): OscillatorNode {
  const osc = audio.createOscillator();
  const amount = audio.createGain();
  osc.frequency.value = hz;
  amount.gain.value = depth;
  osc.connect(amount).connect(target);
  return osc;
}

function buildSound(audio: AudioContext, sound: WhiteNoiseSound, dest: AudioNode): ActiveSound {
  const out = audio.createGain();
  out.gain.value = 0;
  out.connect(dest);
  const sources: AudioScheduledSourceNode[] = [];

  if (sound === 'rain') {
    // 高频沙沙声加低频底噪，缓慢起伏模拟雨势变化
    const hiss = loopSource(audio, white!);
    const hissFilter = audio.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 3800;
    hissFilter.Q.value = 0.45;
    const hissGain = audio.createGain();
    hissGain.gain.value = 0.55;
    hiss.connect(hissFilter).connect(hissGain).connect(out);
    const body = loopSource(audio, brown!);
    const bodyFilter = audio.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 900;
    const bodyGain = audio.createGain();
    bodyGain.gain.value = 0.5;
    body.connect(bodyFilter).connect(bodyGain).connect(out);
    sources.push(hiss, body, lfo(audio, 0.07, 0.08, hissGain.gain));
  } else if (sound === 'wind') {
    // 棕噪音经带通滤波，中心频率与响度各自缓慢摆动，形成阵风
    const src = loopSource(audio, brown!);
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 520;
    filter.Q.value = 1.1;
    const gust = audio.createGain();
    gust.gain.value = 0.9;
    src.connect(filter).connect(gust).connect(out);
    sources.push(src, lfo(audio, 0.11, 260, filter.frequency), lfo(audio, 0.06, 0.35, gust.gain));
  } else {
    const src = loopSource(audio, brown!);
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    src.connect(filter).connect(out);
    sources.push(src);
  }

  sources.forEach((s) => s.start());
  return {
    sound,
    out,
    stop: () => {
      sources.forEach((s) => { try { s.stop(); } catch { /* 已停止 */ } });
      out.disconnect();
    },
  };
}

// 应用启动后没有用户手势时 AudioContext 会处于 suspended，首次点击或按键后恢复播放
function bindUnlock(): void {
  if (unlockBound) return;
  unlockBound = true;
  const resume = () => {
    if (ctx && ctx.state === 'suspended') void ctx.resume();
    if (ctx?.state === 'running' || !ctx) {
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
      unlockBound = false;
    }
  };
  window.addEventListener('pointerdown', resume, true);
  window.addEventListener('keydown', resume, true);
}

function ensureContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    white = makeBuffer(ctx, false);
    brown = makeBuffer(ctx, true);
  }
  return ctx;
}

function releaseContext(): void {
  const audio = ctx;
  ctx = null;
  master = null;
  white = null;
  brown = null;
  active = null;
  if (audio) void audio.close().catch(() => {});
}

/** 设置要播放的白噪音与响度（0 ~ 1）；sound 为 null 时淡出并释放音频资源。 */
export function setWhiteNoise(sound: WhiteNoiseSound | null, level: number): void {
  try {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    if (!sound || level <= 0) {
      const audio = ctx;
      if (!audio || !master) return;
      master.gain.setTargetAtTime(0, audio.currentTime, FADE_SECONDS / 3);
      closeTimer = setTimeout(() => { closeTimer = null; active?.stop(); releaseContext(); }, FADE_SECONDS * 1000 + 100);
      return;
    }
    const audio = ensureContext();
    if (audio.state === 'suspended') {
      void audio.resume();
      bindUnlock();
    }
    if (!active || active.sound !== sound) {
      const previous = active;
      if (previous) {
        previous.out.gain.setTargetAtTime(0, audio.currentTime, FADE_SECONDS / 3);
        setTimeout(() => previous.stop(), FADE_SECONDS * 1000 + 100);
      }
      active = buildSound(audio, sound, master!);
      active.out.gain.setTargetAtTime(1, audio.currentTime, FADE_SECONDS / 3);
    }
    master!.gain.setTargetAtTime(Math.min(1, level) * MAX_GAIN, audio.currentTime, FADE_SECONDS / 3);
  } catch { /* 音频不可用时静默跳过 */ }
}
