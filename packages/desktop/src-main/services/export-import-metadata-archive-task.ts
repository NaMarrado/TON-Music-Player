import fs, { createWriteStream } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import type { ProgressPayload } from '../handlers/export-import-handler/types';
import type {
  ArchiveFileResult,
  MetadataArchiveTrack,
  PlaylistArchiveRequest,
} from './export-import-offload-types';
import { getUniqueName } from './export-import-offload-worker-shared';

export function createMetadataArchive(
  destinationPath: string,
  tracks: MetadataArchiveTrack[],
  playlistMeta: PlaylistArchiveRequest['playlist'] | null,
  onProgress: (payload: ProgressPayload) => void,
): Promise<ArchiveFileResult> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(destinationPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve({ filePath: destinationPath });
    });
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);

    const usedSongNames = new Set<string>();
    const usedArtworkNames = new Set<string>();
    const artworkNameBySource = new Map<string, string>();
    const tracksMeta: Record<string, {
      title: string | null;
      artist: string | null;
      album: string | null;
      artwork: string | null;
      position?: number;
    }> = {};

    const existingTrackFiles = tracks.filter((track) => track.file_path && fs.existsSync(track.file_path));
    const totalTracks = existingTrackFiles.length;
    let processedTracks = 0;
    let processedArtwork = 0;

    onProgress({ phase: 'tracks', current: 0, total: totalTracks });

    for (const track of existingTrackFiles) {
      const songName = getUniqueName(usedSongNames, path.basename(track.file_path));
      archive.file(track.file_path, { name: `songs/${songName}` });
      processedTracks += 1;
      onProgress({ phase: 'tracks', current: processedTracks, total: totalTracks });

      let artworkRef: string | null = null;
      const artworkSource = track.cover_art_path;
      if (artworkSource && fs.existsSync(artworkSource)) {
        let artworkName = artworkNameBySource.get(artworkSource);
        if (!artworkName) {
          artworkName = getUniqueName(usedArtworkNames, path.basename(artworkSource));
          artworkNameBySource.set(artworkSource, artworkName);
          archive.file(artworkSource, { name: `artwork/${artworkName}` });
          processedArtwork += 1;
          onProgress({
            phase: 'artwork',
            current: processedArtwork,
            total: artworkNameBySource.size,
          });
        }
        artworkRef = `artwork/${artworkName}`;
      }

      tracksMeta[songName] = {
        title: track.title || null,
        artist: track.artist || null,
        album: track.album || null,
        artwork: artworkRef,
      };
    }

    if (playlistMeta) {
      let playlistCoverRef: string | null = null;
      if (playlistMeta.cover_path && fs.existsSync(playlistMeta.cover_path)) {
        const coverName = getUniqueName(
          usedArtworkNames,
          `cover${path.extname(playlistMeta.cover_path)}`,
        );
        archive.file(playlistMeta.cover_path, { name: `artwork/${coverName}` });
        playlistCoverRef = `artwork/${coverName}`;
      }

      let position = 0;
      for (const songName of Object.keys(tracksMeta)) {
        tracksMeta[songName].position = position;
        position += 1;
      }

      archive.append(
        JSON.stringify(
          {
            name: playlistMeta.name,
            cover: playlistCoverRef,
          },
          null,
          2,
        ),
        { name: '_playlist.json' },
      );
    }

    archive.append(JSON.stringify(tracksMeta, null, 2), { name: '_tracks.json' });
    onProgress({ phase: 'done', current: totalTracks, total: totalTracks });
    void archive.finalize();
  });
}
