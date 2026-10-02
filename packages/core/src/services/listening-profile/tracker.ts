import { ListeningTimeAccumulator } from '../playback-session';
import type { ListeningSessionSnapshot } from '../../types/history';
import type { ListeningInterval, PlaybackObservation, PlaybackObservationKind, ProfileDevice } from '../../types/profile';

export interface ProfilePlaybackSettings {
  volume_percent: number;
  system_volume_percent: number | null;
  muted: boolean;
  playback_rate: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
}

/** Sampling jitter (media clock vs wall clock) must not shatter one audible span into many rows. */
const CONTIGUOUS_GAP_MS = 1_000;

/** One observer per actual player, used by both desktop and headless mobile. */
export class ProfilePlaybackTracker {
  private readonly clock: ListeningTimeAccumulator;
  private previous: { wall: number; settings: ProfilePlaybackSettings } | null = null;
  private serial: number;
  private played: boolean;
  readonly snapshot: ListeningSessionSnapshot;

  constructor(snapshot: ListeningSessionSnapshot, readonly device: ProfileDevice) {
    this.snapshot = { ...snapshot, device, intervals: [...snapshot.intervals ?? []], observations: [...snapshot.observations ?? []] };
    this.clock = new ListeningTimeAccumulator(snapshot.listened_ms);
    this.serial = (snapshot.intervals?.length ?? 0) + (snapshot.observations?.length ?? 0);
    this.played = snapshot.listened_ms > 0;
  }

  sample(monotonic: number, wall: number, positionSeconds: number, playing: boolean, settings: ProfilePlaybackSettings): number {
    const before = this.clock.listenedMs;
    const measured = this.clock.sample(monotonic, positionSeconds, playing, settings.playback_rate);
    const delta = measured - before;
    const previous = this.previous;
    if (delta > 0 && previous && wall >= previous.wall) {
      const start = Math.max(this.snapshot.started_at, previous.wall, wall - delta);
      const amount = Math.min(delta, wall - start);
      if (amount > 0) {
        const intervals = this.snapshot.intervals!;
        const last = intervals[intervals.length - 1];
        const values = previous.settings;
        if (last && start >= last.ended_at && start - last.ended_at <= CONTIGUOUS_GAP_MS && last.volume_percent === values.volume_percent
          && last.system_volume_percent === values.system_volume_percent && last.muted === values.muted
          && last.playback_rate === values.playback_rate && last.shuffle === values.shuffle && last.repeat === values.repeat) {
          last.ended_at = wall; last.listened_ms += amount;
        } else {
          const interval: ListeningInterval = { interval_id: `${this.snapshot.session_id}_${++this.serial}`,
            session_id: this.snapshot.session_id, device_id: this.device.device_id,
            started_at: start, ended_at: wall, listened_ms: amount, ...values };
          intervals.push(interval);
        }
      }
      if (!this.played) {
        this.observe('play', wall, positionSeconds, settings);
        this.played = true;
      }
    }
    this.snapshot.listened_ms = measured;
    this.previous = { wall, settings: { ...settings } };
    return delta;
  }

  observe(kind: PlaybackObservationKind, at: number, positionSeconds: number, settings: ProfilePlaybackSettings, previousPositionSeconds?: number): void {
    const event: PlaybackObservation = { event_id: `${this.snapshot.session_id}_${++this.serial}`,
      session_id: this.snapshot.session_id, track_id: this.snapshot.track_id, device_id: this.device.device_id,
      at, kind, position_ms: Math.max(0, Math.round(positionSeconds * 1000)),
      playback_rate: settings.playback_rate, volume_percent: settings.volume_percent,
      shuffle: settings.shuffle, repeat: settings.repeat };
    if (previousPositionSeconds != null) event.previous_position_ms = Math.max(0, Math.round(previousPositionSeconds * 1000));
    this.snapshot.observations!.push(event);
  }

  discontinuity(): void {
    this.clock.resetBaseline();
    this.previous = null;
  }

  checkpoint(): ListeningSessionSnapshot {
    return { ...this.snapshot, intervals: this.snapshot.intervals!.map((interval) => ({ ...interval })), observations: [...this.snapshot.observations!] };
  }
}
