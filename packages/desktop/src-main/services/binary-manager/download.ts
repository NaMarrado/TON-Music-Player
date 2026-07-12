import { createWriteStream } from 'fs';
import fs from 'fs';
import { net } from 'electron';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';

async function cleanupFile(filePath: string): Promise<void> {
  await fs.promises.rm(filePath, { force: true }).catch(() => {});
}

export async function downloadFile(url: string, destinationPath: string): Promise<void> {
  const response = await net.fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Empty response body');
  }

  const fileStream = createWriteStream(destinationPath);
  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      fileStream.write(Buffer.from(value));
    }

    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });
  } catch (error) {
    fileStream.close();
    await cleanupFile(destinationPath);
    throw error;
  }
}

export async function downloadGzFile(url: string, destinationPath: string): Promise<void> {
  const response = await net.fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Empty response body');
  }

  const temporaryPath = `${destinationPath}.gz`;
  const temporaryStream = createWriteStream(temporaryPath);
  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      temporaryStream.write(Buffer.from(value));
    }

    temporaryStream.end();
    await new Promise<void>((resolve, reject) => {
      temporaryStream.on('finish', resolve);
      temporaryStream.on('error', reject);
    });

    await pipeline(
      fs.createReadStream(temporaryPath),
      createGunzip(),
      createWriteStream(destinationPath),
    );
    await cleanupFile(temporaryPath);
  } catch (error) {
    await Promise.all([
      cleanupFile(temporaryPath),
      cleanupFile(destinationPath),
    ]);
    throw error;
  }
}
