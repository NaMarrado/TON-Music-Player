import { narrowManifestToPlaylists, parseProfileBundle, type ExportManifest, type ParsedProfileBundle } from '@ton/core';
import { applyMobileProfile } from '../profile-bundle/profile-data';
import type { LibraryImportOptions } from './types';

export interface ChosenImport {
  manifest: ExportManifest;
  /** The profile to apply after the songs and playlists are in; null when the bundle has none or only playlists were chosen. */
  profile: ParsedProfileBundle | null;
}

/**
 * Asks the user which playlists to import when the caller wants a choice, and narrows the bundle to them. A profile is
 * checked here, before anything is written, so a damaged profile does not leave half an import behind. Null: cancelled.
 */
export async function chooseImport(manifest: ExportManifest, options?: LibraryImportOptions): Promise<ChosenImport | null> {
  if (options?.choosePlaylists) {
    const chosen = await options.choosePlaylists(manifest.playlists.map((playlist, index) => ({ index, name: playlist.name, trackCount: playlist.track_hashes.length })));
    if (!chosen || chosen.length === 0) return null;
    return { manifest: narrowManifestToPlaylists(manifest, chosen), profile: null };
  }
  return { manifest, profile: manifest.profile ? parseProfileBundle(manifest.profile) : null };
}

export async function applyChosenProfile(chosen: ChosenImport): Promise<boolean> {
  if (!chosen.profile) return false;
  await applyMobileProfile(chosen.profile);
  return true;
}
