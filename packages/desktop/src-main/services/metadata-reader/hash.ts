import fs from 'fs';

export function computeFileHash(filePath: string, fileSize: number): string {
  const chunkSize = 65536;
  const fd = fs.openSync(filePath, 'r');

  try {
    const headBuffer = Buffer.alloc(Math.min(chunkSize, fileSize));
    fs.readSync(fd, headBuffer, 0, headBuffer.length, 0);

    let tailBuffer = Buffer.alloc(0);
    if (fileSize > chunkSize) {
      tailBuffer = Buffer.alloc(Math.min(chunkSize, fileSize));
      fs.readSync(fd, tailBuffer, 0, tailBuffer.length, fileSize - tailBuffer.length);
    }

    let hash = 2166136261;
    for (const buffer of [headBuffer, tailBuffer]) {
      for (let i = 0; i < buffer.length; i += 1) {
        hash ^= buffer[i];
        hash = Math.imul(hash, 16777619);
      }
    }

    hash ^= fileSize;
    hash = Math.imul(hash, 16777619);
    return (hash >>> 0).toString(16).padStart(8, '0');
  } finally {
    fs.closeSync(fd);
  }
}
