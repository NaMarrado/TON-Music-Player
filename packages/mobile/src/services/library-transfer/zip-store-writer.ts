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
const MAX_ZIP16 = 0xffff;
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
    const requiresZip64 = centralOffset >= MAX_ZIP32
      || centralSize >= MAX_ZIP32
      || centralEntries.length >= MAX_ZIP16
      || centralEntries.some((entry) => entry.offset >= MAX_ZIP32);
    if (requiresZip64) {
      const zip64Offset = output.offset ?? 0;
      output.writeBytes(zip64EndOfCentralDirectory(
        centralEntries.length,
        centralSize,
        centralOffset,
      ));
      output.writeBytes(zip64EndOfCentralDirectoryLocator(zip64Offset));
    }
    output.writeBytes(endOfCentralDirectory(
      centralEntries.length,
      centralSize,
      centralOffset,
      requiresZip64,
    ));
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
  const sizeRequiresZip64 = entry.size >= MAX_ZIP32;
  const offsetRequiresZip64 = entry.offset >= MAX_ZIP32;
  const zip64ValueCount = (sizeRequiresZip64 ? 2 : 0) + (offsetRequiresZip64 ? 1 : 0);
  const zip64ExtraSize = zip64ValueCount > 0 ? 4 + (zip64ValueCount * 8) : 0;
  const bytes = new Uint8Array(46 + entry.name.length + zip64ExtraSize);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, zip64ExtraSize > 0 ? 45 : 20, true);
  view.setUint16(6, zip64ExtraSize > 0 ? 45 : 20, true);
  view.setUint16(8, 0x0808, true);
  view.setUint16(10, 0, true);
  view.setUint32(16, entry.crc32, true);
  view.setUint32(20, sizeRequiresZip64 ? MAX_ZIP32 : entry.size, true);
  view.setUint32(24, sizeRequiresZip64 ? MAX_ZIP32 : entry.size, true);
  view.setUint16(28, entry.name.length, true);
  view.setUint16(30, zip64ExtraSize, true);
  view.setUint32(42, offsetRequiresZip64 ? MAX_ZIP32 : entry.offset, true);
  bytes.set(entry.name, 46);

  if (zip64ExtraSize > 0) {
    let cursor = 46 + entry.name.length;
    view.setUint16(cursor, 0x0001, true);
    view.setUint16(cursor + 2, zip64ExtraSize - 4, true);
    cursor += 4;
    if (sizeRequiresZip64) {
      setUint64(view, cursor, entry.size);
      setUint64(view, cursor + 8, entry.size);
      cursor += 16;
    }
    if (offsetRequiresZip64) setUint64(view, cursor, entry.offset);
  }
  return bytes;
}

function zip64EndOfCentralDirectory(count: number, size: number, offset: number): Uint8Array {
  const bytes = new Uint8Array(56);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06064b50, true);
  setUint64(view, 4, 44);
  view.setUint16(12, 45, true);
  view.setUint16(14, 45, true);
  setUint64(view, 24, count);
  setUint64(view, 32, count);
  setUint64(view, 40, size);
  setUint64(view, 48, offset);
  return bytes;
}

function zip64EndOfCentralDirectoryLocator(zip64Offset: number): Uint8Array {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x07064b50, true);
  setUint64(view, 8, zip64Offset);
  view.setUint32(16, 1, true);
  return bytes;
}

function endOfCentralDirectory(
  count: number,
  size: number,
  offset: number,
  zip64: boolean,
): Uint8Array {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, zip64 ? MAX_ZIP16 : count, true);
  view.setUint16(10, zip64 ? MAX_ZIP16 : count, true);
  view.setUint32(12, zip64 ? MAX_ZIP32 : size, true);
  view.setUint32(16, zip64 ? MAX_ZIP32 : offset, true);
  return bytes;
}

function setUint64(view: DataView, offset: number, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('ZIP64 value exceeds the supported file size');
  }
  const high = Math.floor(value / 0x1_0000_0000);
  const low = value - (high * 0x1_0000_0000);
  view.setUint32(offset, low, true);
  view.setUint32(offset + 4, high, true);
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
