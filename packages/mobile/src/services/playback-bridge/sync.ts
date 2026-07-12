import type { PlaybackRuntimeStateSnapshot } from '../playback-runtime';
import { PlaybackStateValue } from '../playback-runtime';
import { usePlaybackStore } from '../../stores/playback-store';
import { useQueueStore } from '../../stores/queue-store';
import { getTrackById } from '../db-queries';
import { ensureAudioEffectsAttached } from '../audio-settings';
import { syncVolumeOutputToState } from './volume';

export async function syncActiveTrack(event: {
  index?: number;
  track?: { id?: string | number } | unknown;
}): Promise<void> {
  const { items } = useQueueStore.getState();
  let trackId: number | null = null;

  if (event.index != null) {
    if (event.index < 0 || event.index >= items.length) {
      return;
    }

    useQueueStore.setState({ currentIndex: event.index });
    const item = items[event.index];
    trackId = item?.track_id ?? null;
  }

  if (trackId == null && event.track && typeof event.track === 'object' && 'id' in event.track) {
    const rawTrackId = event.track.id;
    const normalizedTrackId = String(rawTrackId ?? '').split('-')[0];
    const parsedTrackId = Number.parseInt(normalizedTrackId, 10);
    trackId = Number.isFinite(parsedTrackId) ? parsedTrackId : null;
  }

  if (trackId == null) {
    return;
  }

  const track = await getTrackById(trackId);
  if (!track) return;

  usePlaybackStore.setState({
    currentTrack: track,
    position: 0,
    duration: (track.duration_ms ?? 0) / 1000,
  });
  await syncVolumeOutputToState().catch(() => {});
}

export function syncPlaybackState(event: Pick<PlaybackRuntimeStateSnapshot, 'state'>): void {
  usePlaybackStore.setState({ isPlaying: event.state === PlaybackStateValue.Playing });

  if (
    event.state === PlaybackStateValue.Ready
    || event.state === PlaybackStateValue.Buffering
    || event.state === PlaybackStateValue.Playing
  ) {
    ensureAudioEffectsAttached().catch(() => {});
    syncVolumeOutputToState().catch(() => {});
  }
}

export async function handleQueueEnded(): Promise<void> {
  const { items } = useQueueStore.getState();
  if (items.length === 0) {
    usePlaybackStore.setState({ isPlaying: false });
  }
}
