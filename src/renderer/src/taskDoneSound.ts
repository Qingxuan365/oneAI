// 任务完成提示音：用 Web Audio 合成一声两音的短提示，不依赖音频资源文件。
let ctx: AudioContext | null = null;

export function playTaskDoneSound(volume: number): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const peak = Math.min(1, Math.max(0, volume / 100)) * 0.3;
    const start = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      const t0 = start + i * 0.14;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0);
      osc.stop(t0 + 0.42);
    });
  } catch { /* 音频不可用时静默跳过 */ }
}
