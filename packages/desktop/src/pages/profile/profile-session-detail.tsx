import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileDetailedHistory } from '@ton/core';
import { VirtualizedList } from '../../components/player/virtualized-list';
import { useProfileFormat } from './profile-format';

export function DetailFields({ fields }: { fields: { label: string; value: ReactNode; hint?: string }[] }) {
  return <dl className="profile-fields">{fields.map(({ label, value, hint }) => <div key={label} data-hint={hint}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function SessionDetail({ session }: { session: ProfileDetailedHistory }) {
  const { t } = useTranslation('pages/profile');
  const format = useProfileFormat();
  const observations = [...session.observations].sort((a, b) => a.at - b.at || a.event_id.localeCompare(b.event_id));
  const intervals = [...session.intervals].sort((a, b) => a.started_at - b.started_at || a.interval_id.localeCompare(b.interval_id));
  const status = session.completed ? t('completed') : session.skipped ? t('skipped') : session.ended_at === null ? t('openSession') : t('stopped');
  return <div className="profile-detail-content">
    <div className="profile-detail-heading"><span className="profile-eyebrow">{t('sessionDetails')}</span><h3>{session.title || t('unknownTitle')}</h3><p>{session.artist || t('unknownArtist')}</p></div>
    {!session.track?.file_path && <p className="profile-note">{t('trackUnavailable')}</p>}
    <DetailFields fields={[
      { label: t('listeningTime'), value: format.exactDuration(session.listened_ms), hint: t('hints.listeningTime') },
      { label: t('sessionStatus'), value: status, hint: t('hints.sessionStatus') },
      { label: t('startedAt'), value: format.dateTime(session.started_at), hint: t('hints.startedAt') },
      { label: t('endedAt'), value: session.ended_at === null ? t('openSession') : format.dateTime(session.ended_at), hint: t('hints.endedAt') },
      { label: t('album'), value: session.album || t('unknownAlbum'), hint: t('hints.album') },
      { label: t('genre'), value: session.genre || t('unknownGenre'), hint: t('hints.genre') },
      { label: t('device'), value: `${session.device.name} · ${t(`platforms.${session.device.platform}`)}`, hint: t('hints.device') },
      { label: t('completed'), value: t(session.completed ? 'on' : 'off'), hint: t('hints.completed') },
      { label: t('skipped'), value: t(session.skipped ? 'on' : 'off'), hint: t('hints.skipped') },
    ]} />
    <p className="profile-note">{t('sessionRangeNote')}</p>
    <details className="profile-disclosure" data-hint={t('hints.recordDetails')}><summary>{t('recordDetails')}</summary><DetailFields fields={[
      { label: t('sessionId'), value: session.session_id },
      { label: t('deviceId'), value: session.device.device_id },
      { label: t('trackIdentity'), value: session.identity },
      { label: t('startedAt'), value: String(session.started_at) },
      { label: t('endedAt'), value: session.ended_at === null ? t('unknownValue') : String(session.ended_at) },
    ]} /></details>
    <section aria-label={t('intervals')}>
      <h3 className="profile-subheading" data-hint={t('hints.intervals')}>{t('intervals')} <span>{format.number(intervals.length)}</span></h3>
      {intervals.length === 0 ? <p className="profile-empty-inline">{t('noIntervals')}</p> : <VirtualizedList
        className="profile-scroll-list profile-record-list"
        items={intervals}
        estimateSize={225}
        style={{ maxHeight: 540 }}
        keyExtractor={(interval) => `${interval.device_id}:${interval.interval_id}`}
        renderItem={(interval) => <article className="profile-record">
          <header><time dateTime={new Date(interval.started_at).toISOString()}>{format.dateTime(interval.started_at)}</time><strong>{format.exactDuration(interval.listened_ms)}</strong></header>
          <DetailFields fields={[
            { label: t('endedAt'), value: format.dateTime(interval.ended_at), hint: t('hints.endedAt') },
            { label: t('appVolume'), value: format.volume(interval.volume_percent), hint: t('hints.appVolume') },
            { label: t('systemVolume'), value: format.volume(interval.system_volume_percent), hint: t('hints.systemVolume') },
            { label: t('muteState'), value: t(interval.muted ? 'muted' : 'notMuted'), hint: t('hints.muteState') },
            { label: t('playbackRate'), value: format.rate(interval.playback_rate), hint: t('hints.playbackRate') },
            { label: t('shuffle'), value: t(interval.shuffle ? 'on' : 'off'), hint: t('hints.shuffle') },
            { label: t('repeat'), value: t(`repeatModes.${interval.repeat}`), hint: t('hints.repeat') },
          ]} />
          <details className="profile-disclosure"><summary>{t('recordDetails')}</summary><DetailFields fields={[
            { label: t('intervalId'), value: interval.interval_id },
            { label: t('sessionId'), value: interval.session_id },
            { label: t('deviceId'), value: interval.device_id },
            { label: t('startedAt'), value: String(interval.started_at) },
            { label: t('endedAt'), value: String(interval.ended_at) },
          ]} /></details>
        </article>}
      />}
    </section>
    <section aria-label={t('events')}>
      <h3 className="profile-subheading" data-hint={t('hints.events')}>{t('events')} <span>{format.number(observations.length)}</span></h3>
      {observations.length === 0 ? <p className="profile-empty-inline">{t('noEvents')}</p> : <VirtualizedList
        className="profile-scroll-list profile-record-list"
        items={observations}
        estimateSize={210}
        style={{ maxHeight: 540 }}
        keyExtractor={(event) => `${event.device_id}:${event.event_id}`}
        renderItem={(event) => <article className="profile-record">
          <header><strong data-hint={t(`hints.eventKinds.${event.kind}`)}>{t(`eventKinds.${event.kind}`)}</strong><time dateTime={new Date(event.at).toISOString()}>{format.dateTime(event.at)}</time></header>
          <DetailFields fields={[
            { label: t('position'), value: format.exactDuration(event.position_ms), hint: t('hints.position') },
            ...(event.previous_position_ms === undefined ? [] : [{ label: t('previousPosition'), value: format.exactDuration(event.previous_position_ms), hint: t('hints.previousPosition') }]),
            { label: t('appVolume'), value: format.volume(event.volume_percent), hint: t('hints.appVolume') },
            { label: t('playbackRate'), value: format.rate(event.playback_rate), hint: t('hints.playbackRate') },
            { label: t('shuffle'), value: t(event.shuffle ? 'on' : 'off'), hint: t('hints.shuffle') },
            { label: t('repeat'), value: t(`repeatModes.${event.repeat}`), hint: t('hints.repeat') },
          ]} />
          <details className="profile-disclosure"><summary>{t('recordDetails')}</summary><DetailFields fields={[
            { label: t('eventId'), value: event.event_id },
            { label: t('sessionId'), value: event.session_id },
            { label: t('deviceId'), value: event.device_id },
            { label: t('trackId'), value: String(event.track_id) },
            { label: t('recordedAt'), value: String(event.at) },
          ]} /></details>
        </article>}
      />}
    </section>
  </div>;
}
