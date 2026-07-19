import { throwIfLibraryTransferCancelled } from './cancellation';
import { yieldToUiAsync } from './file-helpers';

type FileHandle = {
  close(): void;
  offset: number | null;
  readBytes(length: number): Uint8Array;
  size: number | null;
  writeBytes(bytes: Uint8Array): void;
};
type NativeFile = {
  create(): void;
  delete(): void;
  exists: boolean;
  open(): FileHandle;
  size: number | null;
};
type NativeFileConstructor = new (uri: string) => NativeFile;

/* eslint-disable @typescript-eslint/no-require-imports -- SDK 52 exposes sync handles via next. */
const { File } = require('expo-file-system/next') as { File: NativeFileConstructor };
/* eslint-enable @typescript-eslint/no-require-imports */

type ZipInput = { archivePath: string; filePath?: string; bytes?: Uint8Array };
type CentralEntry = {
  crc32: number;
  name: Uint8Array;
  offset: number;
  size: number;
};

const CHUNK_SIZE = 1024 * 1024;
const MAX_ZIP32 = 0xffff_ffff;
const encoder = new TextEncoder();

export async function writeStoredZipArchive(input: {
  destinationUri: string;
  entries: ZipInput[];
  shouldCancel?: (() => boolean) | null;
  onEntry?: (index: number, total: number) => void;
}): Promise<void> {
  const destination = new File(input.destinationUri);
  if (destination.exists) destination.delete();
  destination.create();
  const output = destination.open();
  const centralEntries: CentralEntry[] = [];

  try {
    for (let index = 0; index < input.entries.length; index += 1) {
      throwIfLibraryTransferCancelled(input.shouldCancel);
      const entry = input.entries[index];
      const name = encoder.encode(entry.archivePath.replace(/^\/+/, ''));
      const offset = output.offset ?? 0;
      assertZip32(offset, 'Archive is too large for ZIP export');
      output.writeBytes(localHeader(name));

      let crc = 0xffff_ffff;
      let size = 0;
      if (entry.bytes) {
        crc = updateCrc32(crc, entry.bytes);
        size = entry.bytes.length;
        output.writeBytes(entry.bytes);
      } else if (entry.filePath) {
        const source = new File(entry.filePath);
        if (!source.exists) throw new Error(`Cannot export missing Library file: ${entry.filePath}`);
        const sourceHandle = source.open();
        try {
          let remaining = sourceHandle.size ?? source.size ?? 0;
          while (remaining > 0) {
            throwIfLibraryTransferCancelled(input.shouldCancel);
            const bytes = sourceHandle.readBytes(Math.min(CHUNK_SIZE, remaining));
            if (bytes.length === 0) throw new Error(`Could not read Library file: ${entry.filePath}`);
            crc = updateCrc32(crc, bytes);
            size += bytes.length;
            assertZip32(size, 'A Library file is too large for ZIP export');
            output.writeBytes(bytes);
            remaining -= bytes.length;
            await yieldToUiAsync();
          }
        } finally {
          sourceHandle.close();
        }
      }

      const finalCrc = (crc ^ 0xffff_ffff) >>> 0;
      output.writeBytes(dataDescriptor(finalCrc, size));
      centralEntries.push({ crc32: finalCrc, name, offset, size });
      input.onEntry?.(index + 1, input.entries.length);
      await yieldToUiAsync();
    }

    throwIfLibraryTransferCancelled(input.shouldCancel);
    const centralOffset = output.offset ?? 0;
    for (const entry of centralEntries) output.writeBytes(centralHeader(entry));
    const centralSize = (output.offset ?? 0) - centralOffset;
    assertZip32(centralOffset, 'Archive is too large for ZIP export');
    assertZip32(centralSize, 'Archive is too large for ZIP export');
    if (centralEntries.length > 0xffff) throw new Error('Too many files for ZIP export');
    output.writeBytes(endOfCentralDirectory(centralEntries.length, centralSize, centralOffset));
  } catch (error) {
    output.close();
    if (destination.exists) destination.delete();
    throw error;
  }
  output.close();
}

function localHeader(name: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(30 + name.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0808, true);
  view.setUint16(8, 0, true);
  view.setUint16(26, name.length, true);
  bytes.set(name, 30);
  return bytes;
}

function dataDescriptor(crc32: number, size: number): Uint8Array {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x08074b50, true);
  view.setUint32(4, crc32, true);
  view.setUint32(8, size, true);
  view.setUint32(12, size, true);
  return bytes;
}

function centralHeader(entry: CentralEntry): Uint8Array {
  const bytes = new Uint8Array(46 + entry.name.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0808, true);
  view.setUint16(10, 0, true);
  view.setUint32(16, entry.crc32, true);
  view.setUint32(20, entry.size, true);
  view.setUint32(24, entry.size, true);
  view.setUint16(28, entry.name.length, true);
  view.setUint32(42, entry.offset, true);
  bytes.set(entry.name, 46);
  return bytes;
}

function endOfCentralDirectory(count: number, size: number, offset: number): Uint8Array {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  return bytes;
}

function assertZip32(value: number, message: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_ZIP32) throw new Error(message);
}

const crcTable = buildCrcTable();

function updateCrc32(current: number, bytes: Uint8Array): number {
  let crc = current;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return crc >>> 0;
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}
