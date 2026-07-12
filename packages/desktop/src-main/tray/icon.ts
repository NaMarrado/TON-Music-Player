import { nativeImage } from 'electron';
import zlib from 'zlib';

export function createTrayIcon(): Electron.NativeImage {
  const size = 16;
  const centerX = 7.5;
  const centerY = 7.5;
  const radius = 6;
  const rawData = Buffer.alloc(size * (1 + size * 4));

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (1 + size * 4);
    rawData[rowOffset] = 0;

    for (let x = 0; x < size; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const pixelOffset = rowOffset + 1 + x * 4;

      if (distance <= radius) {
        rawData[pixelOffset] = 255;
        rawData[pixelOffset + 1] = 255;
        rawData[pixelOffset + 2] = 255;
        rawData[pixelOffset + 3] = 255;
      }
    }
  }

  const pngBuffer = buildPngBuffer(size, zlib.deflateSync(rawData));
  const image = nativeImage.createFromBuffer(pngBuffer);

  if (process.platform === 'darwin') {
    image.setTemplateImage(true);
  }

  return image;
}

function buildPngBuffer(size: number, compressedData: Buffer): Buffer {
  const chunks: Buffer[] = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])];
  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  chunks.push(makeChunk('IHDR', ihdr));
  chunks.push(makeChunk('IDAT', compressedData));
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function makeChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeInt32BE(crc32(Buffer.concat([typeBytes, data])));

  return Buffer.concat([length, typeBytes, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xFFFFFFFF;

  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }

  return (crc ^ 0xFFFFFFFF) | 0;
}
