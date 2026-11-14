import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MusicStream } from '../types';
import { defaultStreamName, newMusicStreamId, normalizeStreamUrl, validateMusicStream } from '../musicStreams';
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
        // 每行固定 3.25rem，最多完整显示 5 行（含分隔线与边框），超出出现滚动条
        <ul className="max-h-[calc(16.25rem+6px)] divide-y divide-line overflow-y-auto rounded-md border border-line">
          {streams.map((stream) => (
            <li key={stream.id} data-music-stream-id={stream.id} className="flex h-[3.25rem] items-center justify-between gap-3 bg-muted px-3 text-ui text-fg-muted">
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
