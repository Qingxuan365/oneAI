import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

interface Track {
  name: string;
  path: string;
}

interface MusicPlayerProps {
  directory: string;
}

const BAR_COUNT = 5;

export const MusicPlayer: React.FC<MusicPlayerProps> = ({ directory }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef('');
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const rafRef = useRef(0);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const seekingRef = useRef(false);
  const [volume, setVolume] = useState(1);
  const volumeRef = useRef(1);
  volumeRef.current = volume;
  const playingRef = useRef(false);
  const tracksRef = useRef<Track[]>([]);
  const indexRef = useRef(0);
  tracksRef.current = tracks;
  indexRef.current = index;

  // 目录变化时重新扫描，并停止当前播放
  useEffect(() => {
    let active = true;
    audioRef.current?.pause();
    setPlaying(false);
    setError('');
    window.electronAPI?.listMusic?.(directory || undefined).then((result) => {
      if (!active) return;
      setTracks(result.tracks);
      setIndex(0);
    }).catch(() => active && setTracks([]));
    return () => { active = false; };
  }, [directory]);

  const stopBars = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    barsRef.current.forEach((bar) => { if (bar) bar.style.transform = 'scaleY(0.2)'; });
  }, []);

  const drawBars = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const step = () => {
      analyser.getByteFrequencyData(data);
      const bucket = Math.floor(data.length * 0.6 / BAR_COUNT);
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        let sum = 0;
        for (let j = 0; j < bucket; j++) sum += data[i * bucket + j];
        const level = Math.min(1, sum / bucket / 200);
        bar.style.transform = `scaleY(${Math.max(0.2, level)})`;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    step();
  }, []);

  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const audio = new Audio();
    audio.volume = volumeRef.current;
    audio.addEventListener('play', () => { setPlaying(true); playingRef.current = true; ctxRef.current?.resume(); drawBars(); });
    audio.addEventListener('pause', () => { setPlaying(false); playingRef.current = false; stopBars(); });
    audio.addEventListener('ended', () => {
      const count = tracksRef.current.length;
      if (count > 0) loadTrack((indexRef.current + 1) % count, true);
    });
    audio.addEventListener('error', () => setError('无法播放该文件'));
    audio.addEventListener('timeupdate', () => { if (!seekingRef.current) setTime(audio.currentTime); });
    const syncDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    ctx.createMediaElementSource(audio).connect(analyser);
    analyser.connect(ctx.destination);
    ctxRef.current = ctx;
    analyserRef.current = analyser;
    audioRef.current = audio;
    return audio;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawBars, stopBars]);

  const loadTrack = useCallback(async (next: number, autoPlay: boolean) => {
    const list = tracksRef.current;
    if (!list[next]) return;
    const audio = ensureAudio();
    setIndex(next);
    setError('');
    const bytes = await window.electronAPI?.readMusic?.(list[next].path);
    if (!bytes) { setError('读取音频失败'); return; }
    if (indexRef.current !== next) return; // 期间已切换到其他曲目
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(new Blob([bytes as BlobPart]));
    setTime(0);
    setDuration(0);
    audio.src = urlRef.current;
    if (autoPlay) audio.play().catch(() => setError('无法播放该文件'));
  }, [ensureAudio]);

  const toggle = () => {
    const audio = ensureAudio();
    if (!audio.src) { loadTrack(index, true); return; }
    if (audio.paused) audio.play().catch(() => setError('无法播放该文件'));
    else audio.pause();
  };

  const step = (delta: number) => {
    const count = tracks.length;
    if (count === 0) return;
    loadTrack((index + delta + count) % count, playingRef.current || !audioRef.current?.src);
  };

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    ctxRef.current?.close();
  }, []);

  const changeVolume = (value: number) => {
    setVolume(value);
    if (audioRef.current) audioRef.current.volume = value;
  };

  const commitSeek = () => {
    seekingRef.current = false;
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // 目录里没有音乐时不占用侧栏空间；播放目录在设置中选择
  if (tracks.length === 0) return null;

  const title = error || tracks[index]?.name || '';

  return (
    <div role="group" aria-label="音乐播放器" className="space-y-1.5 border-t border-line px-3 py-2 text-xs text-fg-muted">
      {/* 第一行：曲名与播放控制 */}
      <div className="flex items-center gap-1.5">
        {playing ? (
          <span className="flex h-3.5 w-[18px] shrink-0 items-end gap-[2px]" aria-hidden="true">
            {Array.from({ length: BAR_COUNT }, (_, i) => (
              <span
                key={i}
                ref={(el) => { barsRef.current[i] = el; }}
                className="h-full flex-1 origin-bottom rounded-sm bg-accent"
                style={{ transform: 'scaleY(0.2)' }}
              />
            ))}
          </span>
        ) : (
          <Music size={14} className="w-[18px] shrink-0 text-fg-subtle" aria-hidden="true" />
        )}
        <span className={`min-w-0 flex-1 truncate ${error ? 'text-danger' : ''}`} title={title}>{title}</span>
        <button type="button" className="icon-btn" onClick={() => step(-1)} title="上一首" aria-label="上一首"><SkipBack size={14} /></button>
        <button type="button" className="icon-btn text-fg" onClick={toggle} title={playing ? '暂停' : '播放'} aria-label={playing ? '暂停' : '播放'}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" className="icon-btn" onClick={() => step(1)} title="下一首" aria-label="下一首"><SkipForward size={14} /></button>
      </div>
      {/* 第二行：进度与音量 */}
      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0 text-2xs tabular-nums text-fg-subtle">{fmt(time)}</span>
        <input
          type="range"
          aria-label="播放进度"
          className="slim min-w-0 flex-1"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          disabled={duration === 0}
          onPointerDown={() => { seekingRef.current = true; }}
          onChange={(e) => setTime(Number(e.target.value))}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
        />
        <span className="w-8 shrink-0 text-right text-2xs tabular-nums text-fg-subtle">{fmt(duration)}</span>
        <button type="button" className="icon-btn" onClick={() => changeVolume(volume === 0 ? 1 : 0)} title={volume === 0 ? '取消静音' : '静音'} aria-label={volume === 0 ? '取消静音' : '静音'}>
          {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <input
          type="range"
          aria-label="音量"
          className="slim w-12 shrink-0"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );
};
