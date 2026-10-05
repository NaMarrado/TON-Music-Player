import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { narrowManifestToPlaylists, parseProfileBundle, type ExportManifest } from '@ton/core';
import { saveDesktopCloudConfig } from '../../services/cloud-sync/config';
import { getDb } from '../../services/database';
import { notifyDesktopProfileChanges } from '../../services/listening-profile/store';
import { applyDesktopProfile } from '../../services/profile-bundle';
import { pickImportBundlePath } from './dialogs';
import { cleanupImportTempDir } from './import-data';
import { importOpenedBundle, openImportBundle, type OpenedImportBundle } from './import-runner';
import { createProgressSender } from './progress';
import type { ExportKind, ImportInspectResult, ImportResult, ImportStartOptions } from './types';

const EMPTY: ImportResult = { importedTracks: 0, skippedTracks: 0, importedPlaylists: 0 };
/** Bundles opened by import:inspect and waiting for the user's choice. */
const opened = new Map<string, OpenedImportBundle>();

function resolveEventWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  try {
    return BrowserWindow.fromWebContents(event.sender);
  } catch {
    return null;
  }
}

function kindOf(manifest: ExportManifest): ExportKind {
  return manifest.bundle_type ?? 'library';
}

/** Opens a bundle and tells the renderer what is in it, so the user can choose playlists before anything is imported. */
export async function inspectImport(
  event: Electron.IpcMainInvokeEvent,
  options?: { bundlePath?: string },
): Promise<ImportInspectResult> {
  const bundlePath = await pickImportBundlePath(resolveEventWindow(event), options?.bundlePath);
  if (!bundlePath) return null;
  const bundle = await openImportBundle(bundlePath, createProgressSender(event.sender, 'import:progress'));
  const token = randomUUID();
  opened.set(token, bundle);
  const { manifest } = bundle;
  return {
    token,
    kind: kindOf(manifest),
    trackCount: manifest.tracks.length,
    playlists: manifest.playlists.map((playlist, index) => ({ index, name: playlist.name, trackCount: playlist.track_hashes.length })),
  };
}

/** Forgets an inspected bundle the user decided not to import. */
export function discardImport(_event: Electron.IpcMainInvokeEvent, token: string): void {
  const bundle = opened.get(token);
  opened.delete(token);
  if (bundle) cleanupImportTempDir(bundle.tempDir);
}

export async function startLibraryImport(
  event: Electron.IpcMainInvokeEvent,
  options?: ImportStartOptions,
): Promise<ImportResult> {
  const sendProgress = createProgressSender(event.sender, 'import:progress');
  let bundle = options?.inspectToken ? opened.get(options.inspectToken) ?? null : null;
  if (options?.inspectToken) opened.delete(options.inspectToken);
  if (!bundle) {
    const bundlePath = await pickImportBundlePath(resolveEventWindow(event), options?.bundlePath);
    if (!bundlePath) return EMPTY;
    bundle = await openImportBundle(bundlePath, sendProgress);
  }

  try {
    const chosen = options?.playlistIndexes;
    const manifest = chosen ? narrowManifestToPlaylists(bundle.manifest, chosen) : bundle.manifest;
    // A profile is checked before anything is written, so a damaged profile does not leave half an import behind.
    const profile = !chosen && manifest.profile ? parseProfileBundle(manifest.profile) : null;
    const result = await importOpenedBundle(bundle, manifest, sendProgress);
    if (profile) {
      applyDesktopProfile(getDb(), profile);
      if (profile.bundle.cloud) saveDesktopCloudConfig(profile.bundle.cloud);
      notifyDesktopProfileChanges();
    }
    return {
      importedTracks: result.importedTracks,
      skippedTracks: result.skippedTracks,
      importedPlaylists: result.importedPlaylists,
      profileApplied: profile !== null,
    };
  } finally {
    cleanupImportTempDir(bundle.tempDir);
  }
}
