import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { Decompress as ZstdDecompress } from 'fzstd';

/** 按平台归一化绝对路径比较键（Windows 下忽略大小写） */
export function normalizePathKey(target: string): string {
  const resolved = path.resolve(target);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** 判断两个目录路径是否指向同一位置 */
export function isSamePath(a: string, b: string): boolean {
  return normalizePathKey(a) === normalizePathKey(b);
}

/** 判断 target 是否位于 root 目录内部（基于已解析的真实路径，Windows 忽略大小写） */
export function isPathInside(root: string, target: string): boolean {
  const normRoot = normalizePathKey(root);
  const normTarget = normalizePathKey(target);
  const relative = path.relative(normRoot, normTarget);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** 读取文件开头或末尾最多 bytes 字节（UTF-8） */
export async function readSlice(file: string, from: 'head' | 'tail', bytes: number): Promise<string> {
  const handle = await fs.promises.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, bytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, from === 'head' ? 0 : size - length);
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}

/** 流式读取 .jsonl.zst 开头指定字节即中止解压，避免为提取会话元数据解压整个归档文件 */
export async function readZstHead(file: string, maxBytes: number): Promise<string> {
  const decoder = new StringDecoder('utf8');
  let out = '';
  let total = 0;
  const stream = fs.createReadStream(file, { highWaterMark: 16 * 1024 });
  try {
    const zstd = new ZstdDecompress((chunk) => {
      if (total >= maxBytes) return;
      const remain = maxBytes - total;
      const slice = chunk.byteLength > remain ? chunk.subarray(0, remain) : chunk;
      total += slice.byteLength;
      out += decoder.write(Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength));
    });
    for await (const chunk of stream) {
      zstd.push(chunk as Buffer);
      if (total >= maxBytes) break;
    }
    if (total < maxBytes) zstd.push(new Uint8Array(0), true);
    out += decoder.end();
    return out;
  } finally {
    stream.destroy();
  }
}

/** 流式解压 .jsonl.zst 并仅保留末尾滑动窗口字节，用于读取归档会话的最近消息而不全量驻留内存 */
export async function readZstTail(file: string, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let buffered = 0;
  const stream = fs.createReadStream(file, { highWaterMark: 64 * 1024 });
  try {
    const zstd = new ZstdDecompress((chunk) => {
      if (chunk.byteLength === 0) return;
      const copy = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      chunks.push(copy);
      buffered += copy.length;
      while (buffered > maxBytes && chunks.length > 0) {
        const overflow = buffered - maxBytes;
        if (chunks[0].length <= overflow) {
          buffered -= chunks[0].length;
          chunks.shift();
        } else {
          chunks[0] = chunks[0].subarray(overflow);
          buffered -= overflow;
        }
      }
    });
    for await (const chunk of stream) {
      zstd.push(chunk as Buffer);
    }
    zstd.push(new Uint8Array(0), true);
    return Buffer.concat(chunks, buffered).toString('utf8');
  } finally {
    stream.destroy();
  }
}

/** 向 Map 写入键值并按插入顺序（LRU / FIFO）维持最大容量，避免超限时 clear() 造成整表缓存雪崩 */
export function setBoundedMap<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}
