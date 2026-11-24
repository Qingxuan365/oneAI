import { Worker } from 'node:worker_threads';

/**
 * 在 worker 线程里把 BGRA 原始像素编码成 PNG。
 * 主进程的 nativeImage.toPNG() 是同步的，2560×1440 的截图就要 100ms 以上，粘贴大图时会卡住界面和所有终端。
 * 每次编码用一个一次性 worker，像素缓冲区直接转移过去，不复制。
 */
const PNG_WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const zlib = require('node:zlib');
const { width, height } = workerData;
const bgra = Buffer.from(workerData.pixels);
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
const stride = width * 4;
const raw = Buffer.alloc((stride + 1) * height);
for (let y = 0; y < height; y++) {
  const out = y * (stride + 1);
  raw[out] = 0; // 每行过滤类型 0（None）
  for (let x = 0; x < stride; x += 4) {
    const i = y * stride + x;
    const a = bgra[i + 3];
    // toBitmap() 是预乘 alpha，PNG 要求非预乘；半透明像素按 alpha 还原
    if (a === 255 || a === 0) {
      raw[out + 1 + x] = bgra[i + 2];
      raw[out + 2 + x] = bgra[i + 1];
      raw[out + 3 + x] = bgra[i];
    } else {
      raw[out + 1 + x] = Math.min(255, Math.round(bgra[i + 2] * 255 / a));
      raw[out + 2 + x] = Math.min(255, Math.round(bgra[i + 1] * 255 / a));
      raw[out + 3 + x] = Math.min(255, Math.round(bgra[i] * 255 / a));
    }
    raw[out + 4 + x] = a;
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; // 位深
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const result = png.buffer.slice(png.byteOffset, png.byteOffset + png.length);
parentPort.postMessage(result, [result]);
`;

/** bgra 的长度必须等于 width × height × 4；编码失败时 reject，由调用方回退到 toPNG() */
export function encodeBgraToPng(bgra: Buffer, width: number, height: number): Promise<Buffer> {
  if (width <= 0 || height <= 0 || bgra.length !== width * height * 4) {
    return Promise.reject(new Error('bitmap size mismatch'));
  }
  const pixels = new ArrayBuffer(bgra.length);
  new Uint8Array(pixels).set(bgra);
  return new Promise((resolve, reject) => {
    const worker = new Worker(PNG_WORKER_SOURCE, {
      eval: true,
      workerData: { pixels, width, height },
      transferList: [pixels],
    });
    worker.once('message', (data: ArrayBuffer) => {
      resolve(Buffer.from(data));
      void worker.terminate();
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`png worker exited with code ${code}`));
    });
  });
}
