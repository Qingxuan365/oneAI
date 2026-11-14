import { MusicStream } from './types';

/** 内置的免费网络电台，设置里点一下即可加入播放器；只提供官方公开的流地址，不会在用户添加之前发起任何请求 */
export const MUSIC_PRESETS: Array<Pick<MusicStream, 'name' | 'url'>> = [
  { name: 'Radio Paradise - Main Mix', url: 'https://stream.radioparadise.com/mp3-128' },
  { name: 'Radio Paradise - Mellow Mix', url: 'https://stream.radioparadise.com/mellow-128' },
  { name: 'Radio Paradise - Rock Mix', url: 'https://stream.radioparadise.com/rock-128' },
  { name: 'Radio Paradise - Global Mix', url: 'https://stream.radioparadise.com/world-etc-128' },
  { name: 'KEXP 90.3 Seattle', url: 'https://kexp.streamguys1.com/kexp160.aac' },
];
