import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Music, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { t } from '../i18n';
import { MusicStream } from '../types';
import { defaultStreamName } from '../musicStreams';

interface Track {
  name: string;
  path?: string; // 本地文件
  url?: string;  // 在线音乐
}

interface MusicPlayerProps {
  directory: string;
  streams: MusicStream[];
}

const BAR_COUNT = 5;

export const MusicPlayer: React.FC<MusicPlayerProps> = ({ directory, streams }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  // 本地文件与在线音乐各用一个 audio 元素：跨域在线音频接入分析器会被静音，所以只有本地那个接频谱分析器
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);
  const streamAudioRef = useRef<HTMLAudioElement | null>(null);
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
  const streamsRef = useRef<MusicStream[]>(streams);
  streamsRef.current = streams;
  const streamsKey = JSON.stringify(streams.map((item) => [item.id, item.name, item.url]));

  const resetAudio = useCallback(() => {
    [localAudioRef.current, streamAudioRef.current].forEach((audio) => {
      if (!audio) return;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    });
    setPlaying(false);
    setTime(0);
    setDuration(0);
  }, []);

  // 目录或在线音乐变化时重新读取曲目（本地在前、在线在后），并停止当前播放
  useEffect(() => {
    let active = true;
    resetAudio();
    setError('');
    const local = window.electronAPI?.listMusic?.(directory || undefined)
      .then((result): Track[] => result.tracks)
      .catch((): Track[] => []) ?? Promise.resolve<Track[]>([]);
    const online = Promise.all(streamsRef.current.map(async (stream): Promise<Track[]> => {
      const base = stream.name.trim() || defaultStreamName(stream.url);
      const fallback = [{ name: '', url: stream.url }];
      const entries = await (window.electronAPI?.resolveMusicStream?.(stream.url) ?? Promise.resolve(fallback)).catch(() => fallback);
      return entries.map((entry) => ({ name: entries.length > 1 ? `${base} - ${entry.name || entry.url}` : base, url: entry.url }));
    })).then((lists) => lists.flat());
    Promise.all([local, online]).then(([localTracks, onlineTracks]) => {
      if (!active) return;
      setTracks([...localTracks, ...onlineTracks]);
      setIndex(0);
    });
    return () => { active = false; };
  }, [directory, streamsKey, resetAudio]);

  const stopBars = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    barsRef.current.forEach((bar) => { if (bar) bar.style.transform = 'scaleY(0.2)'; });
  }, []);

  const drawBars = useCallback(() => {
    const analyser = audioRef.current === localAudioRef.current ? analyserRef.current : null;
    const data = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);
    const step = () => {
      if (analyser) analyser.getByteFrequencyData(data);
      const bucket = Math.floor(data.length * 0.6 / BAR_COUNT);
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        let level: number;
        if (analyser) {
          let sum = 0;
          for (let j = 0; j < bucket; j++) sum += data[i * bucket + j];
          level = Math.min(1, sum / bucket / 200);
        } else {
          // 在线音乐没有频谱数据，用平缓的装饰动画表示正在播放
          level = 0.3 + 0.4 * Math.abs(Math.sin(performance.now() / 280 + i * 1.3));
        }
        bar.style.transform = `scaleY(${Math.max(0.2, level)})`;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    step();
  }, []);

  const createAudio = useCallback((withAnalyser: boolean) => {
    const audio = new Audio();
    audio.volume = volumeRef.current;
    const isCurrent = () => audioRef.current === audio;
    audio.addEventListener('play', () => { if (!isCurrent()) return; setPlaying(true); playingRef.current = true; ctxRef.current?.resume(); drawBars(); });
    audio.addEventListener('pause', () => { if (!isCurrent()) return; setPlaying(false); playingRef.current = false; stopBars(); });
    audio.addEventListener('ended', () => {
      if (!isCurrent()) return;
      const count = tracksRef.current.length;
      if (count > 0) loadTrack((indexRef.current + 1) % count, true);
    });
    audio.addEventListener('error', () => { if (isCurrent() && audio.getAttribute('src')) setError(t('无法播放该文件')); });
    audio.addEventListener('timeupdate', () => { if (isCurrent() && !seekingRef.current) setTime(audio.currentTime); });
    const syncDuration = () => { if (isCurrent()) setDuration(Number.isFinite(audio.duration) ? audio.duration : 0); };
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    if (withAnalyser) {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      ctx.createMediaElementSource(audio).connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
    }
    return audio;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawBars, stopBars]);

  // 取得对应类型的 audio 元素并设为当前；切换类型时先停掉另一个并断开它的连接
  const ensureAudio = useCallback((online: boolean) => {
    const ref = online ? streamAudioRef : localAudioRef;
    if (!ref.current) ref.current = createAudio(!online);
    const audio = ref.current;
    const previous = audioRef.current;
    if (previous && previous !== audio) {
      previous.pause();
      previous.removeAttribute('src');
      previous.load();
    }
    audioRef.current = audio;
    return audio;
  }, [createAudio]);

  const loadTrack = useCallback(async (next: number, autoPlay: boolean) => {
    const track = tracksRef.current[next];
    if (!track) return;
    const audio = ensureAudio(Boolean(track.url));
    setIndex(next);
    indexRef.current = next;
    setError('');
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ''; }
    setTime(0);
    setDuration(0);
    if (track.url) {
      audio.src = track.url;
      if (autoPlay) audio.play().catch((e) => { if (e?.name !== 'AbortError') setError(t('无法播放该文件')); });
      return;
    }
    const bytes = await window.electronAPI?.readMusic?.(track.path ?? '');
    if (!bytes) { setError(t('读取音频失败')); return; }
    if (indexRef.current !== next) return; // 期间已切换到其他曲目
    urlRef.current = URL.createObjectURL(new Blob([bytes as BlobPart]));
    audio.src = urlRef.current;
    if (autoPlay) audio.play().catch(() => setError(t('无法播放该文件')));
  }, [ensureAudio]);

  const toggle = () => {
    const audio = ensureAudio(Boolean(tracks[index]?.url));
    if (!audio.getAttribute('src')) { loadTrack(index, true); return; }
    if (audio.paused) audio.play().catch(() => setError(t('无法播放该文件')));
    else audio.pause();
  };

  const step = (delta: number) => {
    const count = tracks.length;
    if (count === 0) return;
    loadTrack((index + delta + count) % count, playingRef.current || !audioRef.current?.getAttribute('src'));
  };

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    localAudioRef.current?.pause();
    streamAudioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    ctxRef.current?.close();
  }, []);

  const changeVolume = (value: number) => {
    setVolume(value);
    [localAudioRef.current, streamAudioRef.current].forEach((audio) => { if (audio) audio.volume = value; });
  };

  const commitSeek = () => {
    seekingRef.current = false;
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // 没有本地音乐也没有在线音乐时不占用侧栏空间；播放目录和在线音乐在设置中配置
  if (tracks.length === 0) return null;

  const title = error || tracks[index]?.name || '';

  return (
    <div role="group" aria-label={t('音乐播放器')} className="space-y-1.5 border-t border-line px-3 py-2 text-xs text-fg-muted">
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
        <button type="button" className="icon-btn" onClick={() => step(-1)} title={t('上一首')} aria-label={t('上一首')}><SkipBack size={14} /></button>
        <button type="button" className="icon-btn text-fg" onClick={toggle} title={playing ? t('暂停') : t('播放')} aria-label={playing ? t('暂停') : t('播放')}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" className="icon-btn" onClick={() => step(1)} title={t('下一首')} aria-label={t('下一首')}><SkipForward size={14} /></button>
      </div>
      {/* 第二行：进度与音量 */}
      <div className="flex items-center gap-1.5">
        <span className="w-8 shrink-0 text-2xs tabular-nums text-fg-subtle">{fmt(time)}</span>
        <input
          type="range"
          aria-label={t('播放进度')}
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
        <button type="button" className="icon-btn" onClick={() => changeVolume(volume === 0 ? 1 : 0)} title={volume === 0 ? t('取消静音') : t('静音')} aria-label={volume === 0 ? t('取消静音') : t('静音')}>
          {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <input
          type="range"
          aria-label={t('音量')}
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
