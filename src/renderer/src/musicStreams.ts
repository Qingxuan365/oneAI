import { MusicStream } from './types';
import { t } from './i18n';

export const MAX_MUSIC_STREAMS = 20;

export function newMusicStreamId(): string {
  return `stream-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`).slice(0, 8)}`;
}

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** 名称留空时用网址的主机名代替 */
export function defaultStreamName(rawUrl: string): string {
  return parseUrl(rawUrl)?.hostname.replace(/^www\./, '') || rawUrl.trim();
}

/** 读取已保存的在线音乐时过滤掉结构不完整的条目 */
export function sanitizeMusicStreams(value: unknown): MusicStream[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is MusicStream => {
    const ok = Boolean(item) && typeof item.id === 'string' && item.id.length > 0 && !seen.has(item.id)
      && typeof item.name === 'string' && typeof item.url === 'string' && parseUrl(item.url) !== null;
    if (ok) seen.add(item.id);
    return ok;
  }).slice(0, MAX_MUSIC_STREAMS);
}

/** 添加在线音乐前的校验，返回错误文字；通过时返回空字符串 */
export function validateMusicStream(draft: Pick<MusicStream, 'name' | 'url'>, existing: MusicStream[]): string {
  const url = parseUrl(draft.url);
  if (!draft.url.trim()) return t('请填写音乐网址。');
  if (!url) return t('网址需要以 http:// 或 https:// 开头。');
  if (url.pathname.toLowerCase().endsWith('.m3u8')) return t('暂不支持 .m3u8（HLS）流。');
  if (draft.name.trim().length > 40) return t('名称不要超过 40 个字符。');
  if (existing.length >= MAX_MUSIC_STREAMS) return t('最多添加 {n} 个在线音乐。', { n: MAX_MUSIC_STREAMS });
  if (existing.some((item) => item.url === url.href)) return t('这个网址已经添加过了。');
  return '';
}

export function normalizeStreamUrl(rawUrl: string): string {
  return parseUrl(rawUrl)?.href ?? rawUrl.trim();
}
