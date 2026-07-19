import type { ExportManifest } from '@ton/core';
import type { LibraryExportSelection, LibraryTransferBundleType } from './types';

export function resolveExportBundleType(
  selection: LibraryExportSelection,
): LibraryTransferBundleType {
  return selection.includeLibrary || (selection.trackIds?.length ?? 0) > 0
    ? 'library'
    : 'playlist';
}

export function resolveImportBundleType(
  manifest: ExportManifest,
): LibraryTransferBundleType {
  if (manifest.bundle_type === 'library' || manifest.bundle_type === 'playlist') {
    return manifest.bundle_type;
  }

  if (manifest.library_track_hashes !== undefined) {
    if (manifest.library_track_hashes.length === 0 && manifest.playlists.length > 0) {
      return 'playlist';
    }
    return 'library';
  }

  return 'library';
}
