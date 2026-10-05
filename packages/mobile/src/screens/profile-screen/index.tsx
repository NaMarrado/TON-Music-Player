import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { ProfileAnalytics, ProfilePeriod } from '@ton/core';
import { useProfileFormat, type ProfileFormat } from './profile-format';
import { BackButton, SessionDetail, TrackDetail } from './profile-details';
import { ProfileExplorer, type ProfileSelection } from './profile-explorer';
import { BarChart, Chips, Muted, Panel, VolumeList, type ChartPoint } from './profile-parts';
import { useProfileSummary } from './use-profile-summary';

const PERIODS: ProfilePeriod[] = ['week', 'month', 'year', 'all'];

function buildPoints(analytics: ProfileAnalytics, kind: 'timeline' | 'hours' | 'weekdays', format: ProfileFormat): ChartPoint[] {
  if (kind === 'timeline') {
    return analytics.timeline.map((point) => ({ key: point.date, label: format.day(point.date, true), listened_ms: point.listened_ms, plays: point.plays }));
  }
  const buckets = kind === 'hours' ? analytics.hours : analytics.weekdays;
  const name = kind === 'hours' ? format.hour : format.weekday;
  return buckets.map((bucket) => ({ key: String(bucket.index), label: name(bucket.index), listened_ms: bucket.listened_ms, plays: bucket.plays }));
}

export function ProfileScreen() {
  const { t } = useTranslation('profile');
  const format = useProfileFormat();
  const scrollRef = useRef<ScrollView>(null);
  const navigation = useNavigation();
  useLayoutEffect(() => navigation.setOptions({ title: t('title') }), [navigation, t]);
  const [period, setPeriod] = useState<ProfilePeriod>('all');
  const [year, setYear] = useState(new Date().getFullYear());
  const [deviceId, setDeviceId] = useState('');
  const [metric, setMetric] = useState<'time' | 'plays'>('time');
  const [selection, setSelection] = useState<ProfileSelection | null>(null);
  const { summary, failed, loading, refresh } = useProfileSummary({
    period,
    ...(period === 'year' ? { year } : {}),
    ...(deviceId ? { device_id: deviceId } : {}),
  });
  const analytics = summary?.analytics ?? null;
  const timeline = useMemo(() => analytics ? buildPoints(analytics, 'timeline', format) : [], [analytics, format]);
  const hours = useMemo(() => analytics ? buildPoints(analytics, 'hours', format) : [], [analytics, format]);
  const weekdays = useMemo(() => analytics ? buildPoints(analytics, 'weekdays', format) : [], [analytics, format]);
  const years = useMemo(() => [...new Set([new Date().getFullYear(), ...(analytics?.available_years ?? [])])].sort((a, b) => b - a), [analytics]);
  const deviceTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const entry of analytics?.history ?? []) totals[entry.device.device_id] = (totals[entry.device.device_id] ?? 0) + entry.listened_ms;
    return totals;
  }, [analytics]);

  const select = (next: ProfileSelection | null) => {
    setSelection(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const selectedStat = selection && analytics ? analytics.tracks.find((stat) => stat.identity === selection.identity) ?? null : null;
  const selectedSession = selection?.session && analytics ? analytics.history.find((entry) => entry.session_id === selection.session) ?? null : null;

  // The system Back button leaves a detail view before it leaves the screen.
  useFocusEffect(useCallback(() => {
    if (!selection) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelection(selection.session && selection.fromTrack ? { ...selection, session: null } : null);
      return true;
    });
    return () => subscription.remove();
  }, [selection]));

  let content;
  if (!analytics || !summary) {
    content = <View className="px-4 py-6">{failed ? (
      <>
        <Muted>{t('loadFailed')}</Muted>
        <Pressable onPress={refresh} className="mt-3 self-start px-4 py-2 rounded-full bg-white">
          <Text className="text-black text-[13px] font-semibold">{t('retry')}</Text>
        </Pressable>
      </>
    ) : <Muted>{t('loading')}</Muted>}</View>;
  } else if (selection && selectedSession) {
    content = (
      <>
        <BackButton
          label={t(selection.fromTrack && selectedStat ? 'backToTrack' : 'backToList')}
          onPress={() => select(selection.fromTrack && selectedStat ? { ...selection, session: null } : null)}
        />
        <SessionDetail session={selectedSession} />
      </>
    );
  } else if (selection && selectedStat) {
    content = (
      <>
        <BackButton label={t('backToList')} onPress={() => select(null)} />
        <TrackDetail
          stat={selectedStat}
          analytics={analytics}
          onOpenSession={(session) => select({ identity: selectedStat.identity, session, fromTrack: true })}
        />
      </>
    );
  } else {
    const totals = analytics.totals;
    const stats: [string, string][] = [
      ['listeningTime', format.exactDuration(totals.listened_ms)],
      ['totalPlays', format.number(totals.plays)],
      ['uniqueTracks', format.number(totals.unique_tracks)],
      ['uniqueArtists', format.number(totals.unique_artists)],
      ['activeDays', format.number(totals.active_days)],
      ['completed', format.number(totals.completed)],
      ['skipped', format.number(totals.skipped)],
      ['repeatPlays', format.number(totals.repeat_plays)],
      ['pauses', format.number(totals.pauses)],
      ['seeks', format.number(totals.seeks)],
      ['averageSession', format.duration(totals.average_session_ms)],
      ['longestSession', format.duration(totals.longest_session_ms)],
    ];
    content = (
      <View style={{ opacity: loading ? 0.6 : 1 }}>
        <View className="flex-row flex-wrap px-3 mt-4">
          {stats.map(([label, value]) => (
            <View key={label} style={{ width: '50%', padding: 4 }}>
              <View className="rounded-2xl bg-bg-surface px-3.5 py-3">
                <Text className="text-text-secondary text-[12px]" numberOfLines={1}>{t(label)}</Text>
                <Text className="text-white text-[17px] font-bold mt-1" numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
                {label === 'listeningTime' && analytics.change_percent !== null && (
                  <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={2}>
                    {t('periodChange', { change: `${analytics.change_percent > 0 ? '+' : ''}${format.decimal(analytics.change_percent)}%` })}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
        {analytics.unlocated_listened_ms > 0 && (
          <View className="px-4 mt-2"><Muted>{t('chartCoverage', { time: format.duration(analytics.unlocated_listened_ms) })}</Muted></View>
        )}
        <View className="mt-4">
          <Chips
            options={[{ value: 'time' as const, label: t('timeMetric') }, { value: 'plays' as const, label: t('playsMetric') }]}
            value={metric}
            onChange={setMetric}
          />
        </View>
        <BarChart title={t('trends')} points={timeline} metric={metric} />
        <BarChart title={t('hourPattern')} points={hours} metric={metric} />
        <BarChart title={t('weekdayPattern')} points={weekdays} metric={metric} />
        <VolumeList volume={analytics.volume} />
        <Panel title={t('deviceActivity')}>
          {analytics.devices.length === 0 ? <Muted>{t('noObservations')}</Muted> : analytics.devices.map((device) => (
            <View key={device.device_id} className="flex-row justify-between py-1.5">
              <Text className="text-text-secondary text-[13px]">{device.name} · {t(`platforms.${device.platform}`)}</Text>
              <Text className="text-white text-[13px] font-medium">{format.duration(deviceTotals[device.device_id] ?? 0)}</Text>
            </View>
          ))}
        </Panel>
        <ProfileExplorer analytics={analytics} favorites={summary.favorites} onInspect={select} />
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-bg-deep"
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor="#e8e8e8" />}
    >
      {!selection && (
        <View className="pt-3">
          <Chips
            options={PERIODS.map((entry) => ({ value: entry, label: t(`periods.${entry}`) }))}
            value={period}
            onChange={(next) => { setPeriod(next); setSelection(null); }}
          />
          {period === 'year' && (
            <View className="mt-2">
              <Chips options={years.map((entry) => ({ value: String(entry), label: String(entry) }))} value={String(year)} onChange={(next) => setYear(Number(next))} />
            </View>
          )}
          {analytics && analytics.devices.length > 1 && (
            <View className="mt-2">
              <Chips
                options={[
                  { value: '', label: t('allDevices') },
                  ...analytics.devices.map((device) => ({ value: device.device_id, label: device.name })),
                ]}
                value={deviceId}
                onChange={setDeviceId}
              />
            </View>
          )}
        </View>
      )}
      {content}
    </ScrollView>
  );
}
