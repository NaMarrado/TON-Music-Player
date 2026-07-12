import * as FileSystem from 'expo-file-system';
import JSZip from 'jszip';
import type { ExportManifest } from '@ton/core';
import { EXPORT_MANIFEST_NAME } from './naming';
import {
  INVALID_LIBRARY_BUNDLE_ERROR,
  INVALID_LIBRARY_MANIFEST_ERROR,
} from './validation';

function isExportManifest(value: unknown): value is ExportManifest {
  if (typeof value !== 'object' || value == null) {
    return false;
  }

  const manifest = value as Partial<ExportManifest>;
  return Array.isArray(manifest.tracks) && Array.isArray(manifest.playlists);
}

function normalizeArchivePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

function resolveArchivePrefix(zip: JSZip): string {
  const fileNames = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => normalizeArchivePath(entry.name));

  if (fileNames.includes(EXPORT_MANIFEST_NAME)) {
    return '';
  }

  const manifestMatches = fileNames.filter((fileName) => fileName.endsWith(`/${EXPORT_MANIFEST_NAME}`));
  if (manifestMatches.length === 1) {
    return manifestMatches[0].slice(0, -EXPORT_MANIFEST_NAME.length);
  }

  throw new Error(INVALID_LIBRARY_BUNDLE_ERROR);
}

export function resolveArchiveEntryName(prefix: string, relativePath: string): string {
  const cleanRelativePath = normalizeArchivePath(relativePath);
  return `${prefix}${cleanRelativePath}`;
}

export async function loadArchiveBundleAsync(archiveUri: string): Promise<{
  zip: JSZip;
  manifest: ExportManifest;
  prefix: string;
}> {
  const archiveBase64 = await FileSystem.readAsStringAsync(archiveUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const zip = await JSZip.loadAsync(archiveBase64, {
    base64: true,
    checkCRC32: true,
  });
  const prefix = resolveArchivePrefix(zip);
  const manifestEntry = zip.file(resolveArchiveEntryName(prefix, EXPORT_MANIFEST_NAME));
  if (!manifestEntry) {
    throw new Error(INVALID_LIBRARY_MANIFEST_ERROR);
  }

  const raw = await manifestEntry.async('string');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(INVALID_LIBRARY_MANIFEST_ERROR);
  }
  if (!isExportManifest(parsed)) {
    throw new Error(INVALID_LIBRARY_MANIFEST_ERROR);
  }

  return {
    zip,
    manifest: parsed,
    prefix,
  };
}
