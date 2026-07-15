import { scheduleTrackLoudnessAnalysis } from '../loudness-analysis';
import type { PreparedImportTrack } from './import-helpers';

export function enqueueMissingImportLoudness(
  preparedTracks: PreparedImportTrack[],
  trackIdsByHash: Record<string, number>,
): void {
  for (const preparedTrack of preparedTracks) {
    if (
      preparedTrack.metadata.loudness_lufs != null
      && preparedTrack.metadata.loudness_gain != null
    ) {
      continue;
    }

    const trackId = trackIdsByHash[preparedTrack.fileHash];
    if (trackId) {
      scheduleTrackLoudnessAnalysis(trackId);
    }
  }
}
