import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MusicStream } from '../types';
import { defaultStreamName, newMusicStreamId, normalizeStreamUrl, validateMusicStream } from '../musicStreams';
import { MUSIC_PRESETS } from '../musicPresets';
import { t } from '../i18n';

interface MusicStreamsSettingsProps {
  streams: MusicStream[];
  onChange: (streams: MusicStream[]) => void;
}

/** 设置 → 提醒 → 音乐播放器：添加 / 删除在线音乐（音频直链、电台流、.m3u / .pls 歌单地址） */
export const MusicStreamsSettings: React.FC<MusicStreamsSettingsProps> = ({ streams, onChange }) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const add = () => {
    const problem = validateMusicStream({ name, url }, streams);
    if (problem) { setError(problem); return; }
    onChange([...streams, { id: newMusicStreamId(), name: name.trim(), url: normalizeStreamUrl(url) }]);
    setName('');
    setUrl('');
    setError('');
  };

  return (
    <div className="space-y-2" role="group" aria-label={t('在线音乐')}>
      <div>
        <span className="block text-ui text-fg-muted">{t('在线音乐')}</span>
        <p className="text-xs text-fg-faint">{t('填写音频直链、网络电台流或 .m3u / .pls 歌单地址，歌曲会排在本地音乐之后出现在播放器里。不支持 .m3u8（HLS）流，也不支持需要登录的网页播放器。')}</p>
      </div>
      {streams.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {streams.map((stream) => (
            <li key={stream.id} data-music-stream-id={stream.id} className="flex items-center justify-between gap-3 bg-muted px-3 py-2 text-ui text-fg-muted">
              <span className="min-w-0">
                <span className="block truncate font-medium text-fg">{stream.name || defaultStreamName(stream.url)}</span>
                <span className="block truncate font-mono text-xs text-fg-faint" title={stream.url}>{stream.url}</span>
              </span>
              <button type="button" onClick={() => onChange(streams.filter((item) => item.id !== stream.id))} className="icon-btn shrink-0 enabled:hover:text-danger" title={t('删除')} aria-label={t('删除 {name}', { name: stream.name || defaultStreamName(stream.url) })}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1.5">
        <span className="block text-xs text-fg-faint">{t('内置的免费电台，点一下加入播放器：')}</span>
        <div className="flex flex-wrap gap-1.5">
          {MUSIC_PRESETS.map((preset) => {
            const added = streams.some((item) => item.url === preset.url);
            return (
              <button
                key={preset.url}
                type="button"
                disabled={added}
                onClick={() => {
                  const problem = validateMusicStream(preset, streams);
                  if (problem) { setError(problem); return; }
                  onChange([...streams, { id: newMusicStreamId(), name: preset.name, url: preset.url }]);
                  setError('');
                }}
                className="btn-secondary px-2.5 py-1 text-xs"
                title={added ? t('已添加') : preset.url}
              >
                {added ? null : <Plus size={12} />}{preset.name}
              </button>
            );
          })}
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="space-y-2" aria-label={t('添加在线音乐')}>
        {error && <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        <div className="flex items-center gap-2">
          <input className="input select-text w-32 shrink-0" aria-label={t('名称（可选）')} value={name} placeholder={t('名称（可选）')} onChange={(e) => setName(e.target.value)} />
          <input className="input select-text min-w-0 flex-1 font-mono" aria-label={t('音乐网址')} value={url} placeholder="https://example.com/radio.mp3" onChange={(e) => setUrl(e.target.value)} />
          <button type="submit" className="btn-secondary shrink-0 px-2.5 py-1 text-xs"><Plus size={12} />{t('添加')}</button>
        </div>
      </form>
    </div>
  );
};
