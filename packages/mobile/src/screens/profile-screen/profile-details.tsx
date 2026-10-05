import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ProfileAnalytics, ProfileDetailedHistory, ProfileTrackStat } from '@ton/core';
import { useProfileFormat } from './profile-format';
import { Disclosure, Fields, Muted, Panel, VolumeList } from './profile-parts';

export function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center mx-4 mt-4 self-start py-1">
      <Feather name="chevron-left" size={18} color="#e8e8e8" />
      <Text className="text-white text-[14px] font-medium ml-1">{label}</Text>
    </Pressable>
  );
}

function Heading({ eyebrow, title, subtitle, unavailable }: { eyebrow: string; title: string; subtitle: string; unavailable: boolean }) {
  const { t } = useTranslation('profile');
  return (
    <View className="mx-4 mt-3">
      <Text className="text-text-muted text-[11px] font-semibold uppercase tracking-widest">{eyebrow}</Text>
      <Text className="text-white text-xl font-bold mt-1">{title}</Text>
      <Text className="text-text-secondary text-[14px] mt-0.5">{subtitle}</Text>
      {unavailable && <Text className="text-text-muted text-[12px] mt-2">{t('trackUnavailable')}</Text>}
    </View>
  );
}

export function TrackDetail({ stat, analytics, onOpenSession }: {
  stat: ProfileTrackStat;
  analytics: ProfileAnalytics;
  onOpenSession: (sessionId: string) => void;
}) {
  const { t } = useTranslation('profile');
  const format = useProfileFormat();
  const deviceName = (id: string) => analytics.devices.find((device) => device.device_id === id)?.name ?? id;
  const sessions = analytics.history.filter((entry) => entry.identity === stat.identity).sort((a, b) => b.started_at - a.started_at);
  return (
    <>
      <Heading
        eyebrow={t('trackDetails')}
        title={stat.title || stat.track?.title || t('unknownTitle')}
        subtitle={stat.artist || t('unknownArtist')}
        unavailable={!stat.track?.file_path}
      />
      <Panel title={t('selectedPeriod')}>
        <Fields fields={[
          { label: t('listeningTime'), value: format.exactDuration(stat.listened_ms) },
          { label: t('totalPlays'), value: format.number(stat.plays) },
          { label: t('completed'), value: format.number(stat.completed) },
          { label: t('skipped'), value: format.number(stat.skipped) },
          { label: t('album'), value: stat.album || t('unknownAlbum') },
          { label: t('genre'), value: stat.genre || t('unknownGenre') },
          { label: t('trackDuration'), value: stat.duration_ms === null ? t('unknownValue') : format.exactDuration(stat.duration_ms) },
          { label: t('firstPlayed'), value: format.dateTime(stat.first_played_at) },
          { label: t('lastPlayed'), value: format.dateTime(stat.last_played_at) },
          { label: t('deviceActivity'), value: stat.device_ids.map(deviceName).join(', ') || t('unknownValue') },
        ]} />
      </Panel>
      <VolumeList volume={stat.volume} />
      <Panel title={`${t('sessions')} · ${format.number(sessions.length)}`}>
        {sessions.length === 0 ? <Muted>{t('noSessions')}</Muted> : sessions.map((entry) => (
          <Pressable key={entry.session_id} onPress={() => onOpenSession(entry.session_id)} className="flex-row items-center py-2.5" style={{ gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text className="text-white text-[13px]">{format.dateTime(entry.started_at)}</Text>
              <Text className="text-text-secondary text-[12px]">{deviceName(entry.device.device_id)}</Text>
            </View>
            <Text className="text-white text-[13px] font-medium">{format.duration(entry.listened_ms)}</Text>
            <Feather name="chevron-right" size={16} color="#666" />
          </Pressable>
        ))}
      </Panel>
    </>
  );
}

export function SessionDetail({ session }: { session: ProfileDetailedHistory }) {
  const { t } = useTranslation('profile');
  const format = useProfileFormat();
  const observations = [...session.observations].sort((a, b) => a.at - b.at || a.event_id.localeCompare(b.event_id));
  const intervals = [...session.intervals].sort((a, b) => a.started_at - b.started_at || a.interval_id.localeCompare(b.interval_id));
  const status = session.completed ? t('completed') : session.skipped ? t('skipped') : session.ended_at === null ? t('openSession') : t('stopped');
  return (
    <>
      <Heading
        eyebrow={t('sessionDetails')}
        title={session.title || t('unknownTitle')}
        subtitle={session.artist || t('unknownArtist')}
        unavailable={!session.track?.file_path}
      />
      <Panel title={t('sessionDetails')}>
        <Fields fields={[
          { label: t('listeningTime'), value: format.exactDuration(session.listened_ms) },
          { label: t('sessionStatus'), value: status },
          { label: t('startedAt'), value: format.dateTime(session.started_at) },
          { label: t('endedAt'), value: session.ended_at === null ? t('openSession') : format.dateTime(session.ended_at) },
          { label: t('album'), value: session.album || t('unknownAlbum') },
          { label: t('genre'), value: session.genre || t('unknownGenre') },
          { label: t('device'), value: `${session.device.name} · ${t(`platforms.${session.device.platform}`)}` },
        ]} />
        <Disclosure title={t('recordDetails')}>
          <Fields fields={[
            { label: t('sessionId'), value: session.session_id },
            { label: t('deviceId'), value: session.device.device_id },
            { label: t('trackIdentity'), value: session.identity },
          ]} />
        </Disclosure>
      </Panel>
      <Panel title={`${t('intervals')} · ${format.number(intervals.length)}`}>
        {intervals.length === 0 ? <Muted>{t('noIntervals')}</Muted> : intervals.map((interval) => (
          <View key={`${interval.device_id}:${interval.interval_id}`} className="py-2 border-b border-white/5">
            <View className="flex-row justify-between">
              <Text className="text-white text-[13px]">{format.dateTime(interval.started_at)}</Text>
              <Text className="text-white text-[13px] font-semibold">{format.exactDuration(interval.listened_ms)}</Text>
            </View>
            <Fields fields={[
              { label: t('appVolume'), value: interval.muted ? t('muted') : format.volume(interval.volume_percent) },
              { label: t('playbackRate'), value: format.rate(interval.playback_rate) },
              { label: t('shuffle'), value: t(interval.shuffle ? 'on' : 'off') },
              { label: t('repeat'), value: t(`repeatModes.${interval.repeat}`) },
            ]} />
          </View>
        ))}
      </Panel>
      <Panel title={`${t('events')} · ${format.number(observations.length)}`}>
        {observations.length === 0 ? <Muted>{t('noEvents')}</Muted> : observations.map((event) => (
          <View key={`${event.device_id}:${event.event_id}`} className="py-2 border-b border-white/5">
            <View className="flex-row justify-between">
              <Text className="text-white text-[13px] font-semibold">{t(`eventKinds.${event.kind}`)}</Text>
              <Text className="text-text-secondary text-[12px]">{format.dateTime(event.at)}</Text>
            </View>
            <Fields fields={[
              { label: t('position'), value: format.exactDuration(event.position_ms) },
              ...(event.previous_position_ms === undefined ? [] : [{ label: t('previousPosition'), value: format.exactDuration(event.previous_position_ms) }]),
              { label: t('appVolume'), value: format.volume(event.volume_percent) },
            ]} />
          </View>
        ))}
      </Panel>
    </>
  );
}
