import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileAnalytics, ProfilePeriod } from '@ton/core';
import { Button } from '../../components/ui/button';
import { ActivityChart, VolumeDistribution, type ChartPoint } from './profile-charts';
import { ProfileExplorer } from './profile-explorer';
import { useProfileFormat, type ProfileFormat } from './profile-format';
import { ProfileHintLayer } from './profile-hint-layer';
import { ProfileSelect } from './profile-select';
import { useProfileData } from './use-profile-data';
import './profile.css';

const PERIODS: ProfilePeriod[] = ['week', 'month', 'year', 'all'];

function buildPoints(analytics: ProfileAnalytics, kind: 'timeline' | 'hours' | 'weekdays', format: ProfileFormat): ChartPoint[] {
  if (kind === 'timeline') {
    return analytics.timeline.map((point) => ({ key: point.date, label: format.day(point.date), shortLabel: format.day(point.date, true), listened_ms: point.listened_ms, plays: point.plays }));
  }
  const buckets = kind === 'hours' ? analytics.hours : analytics.weekdays;
  const name = kind === 'hours' ? format.hour : format.weekday;
  return buckets.map((bucket) => ({ key: String(bucket.index), label: name(bucket.index), shortLabel: name(bucket.index), listened_ms: bucket.listened_ms, plays: bucket.plays }));
}

export function ProfilePage() {
  const { t } = useTranslation('pages/profile');
  const format = useProfileFormat();
  const [period, setPeriod] = useState<ProfilePeriod>('all');
  const [year, setYear] = useState<number | undefined>(undefined);
  const [deviceId, setDeviceId] = useState('');
  const [metric, setMetric] = useState<'time' | 'plays'>('time');
  const { summary, devices, years, failed, loading, refresh } = useProfileData({
    period,
    ...(period === 'year' && year !== undefined ? { year } : {}),
    ...(deviceId ? { device_id: deviceId } : {}),
  });
  const analytics = summary?.analytics ?? null;
  const timeline = useMemo(() => analytics ? buildPoints(analytics, 'timeline', format) : [], [analytics, format]);
  const hours = useMemo(() => analytics ? buildPoints(analytics, 'hours', format) : [], [analytics, format]);
  const weekdays = useMemo(() => analytics ? buildPoints(analytics, 'weekdays', format) : [], [analytics, format]);
  const yearOptions = useMemo(() => [...new Set([new Date().getFullYear(), ...years])].sort((a, b) => b - a), [years]);

  const deviceTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const entry of analytics?.history ?? []) totals[entry.device.device_id] = (totals[entry.device.device_id] ?? 0) + entry.listened_ms;
    return totals;
  }, [analytics]);

  const totals = analytics?.totals;
  const stats = totals ? [
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
  ] as const : [];

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="profile-page">
        <ProfileHintLayer />
        <header className="profile-header">
          <h1>{t('title')}</h1>
          <div className="profile-controls">
            <div className="profile-tabs" role="group" aria-label={t('period')} data-hint={t('hints.period')}>
              {PERIODS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={period === entry}
                  onClick={() => {
                    setPeriod(entry);
                    if (entry === 'year' && year === undefined) setYear(new Date().getFullYear());
                  }}
                >
                  {t(`periods.${entry}`)}
                </button>
              ))}
            </div>
            {period === 'year' && (
              <ProfileSelect
                value={String(year ?? new Date().getFullYear())}
                options={yearOptions.map((option) => ({ value: String(option), label: String(option) }))}
                onChange={(value) => setYear(Number(value))}
                label={t('year')}
                hint={t('hints.period')}
              />
            )}
            {devices.length > 1 && (
              <ProfileSelect
                value={deviceId}
                options={[
                  { value: '', label: t('allDevices') },
                  ...devices.map((device) => ({ value: device.device_id, label: `${device.name} · ${t(`platforms.${device.platform}`)}` })),
                ]}
                onChange={setDeviceId}
                label={t('device')}
                hint={t('hints.device')}
              />
            )}
            <button type="button" className="profile-refresh" onClick={refresh} disabled={loading} aria-label={t(loading ? 'refreshing' : 'refresh')} data-hint={t('hints.refresh')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>
            </button>
          </div>
        </header>

        {failed && (
          <div role="alert" className="profile-alert">
            <span>{t('loadFailed')}</span>
            <Button variant="secondary" onClick={refresh}>{t('retry')}</Button>
          </div>
        )}
        {!summary && !failed && <p role="status" className="profile-muted">{t('loading')}</p>}

        {summary && analytics && totals && (
          <div aria-busy={loading}>
            <section className="profile-kpis" aria-label={t('selectedPeriod')}>
              {stats.map(([label, value]) => (
                <div key={label} className="profile-kpi" data-hint={t(`hints.${label}`)}>
                  <span>{t(label)}</span>
                  <strong>{value}</strong>
                  {label === 'listeningTime' && analytics.change_percent !== null && (
                    <small>{t('periodChange', { change: `${analytics.change_percent > 0 ? '+' : ''}${format.decimal(analytics.change_percent)}%` })}</small>
                  )}
                </div>
              ))}
            </section>

            {analytics.unlocated_listened_ms > 0 && (
              <p className="profile-note">{t('chartCoverage', { time: format.duration(analytics.unlocated_listened_ms) })}</p>
            )}

            <div className="profile-tabs profile-metric-tabs" role="group" aria-label={t('chartMetric')}>
              {(['time', 'plays'] as const).map((entry) => (
                <button key={entry} type="button" aria-pressed={metric === entry} onClick={() => setMetric(entry)} data-hint={t(entry === 'time' ? 'hints.timeMetric' : 'hints.playsMetric')}>
                  {t(entry === 'time' ? 'timeMetric' : 'playsMetric')}
                </button>
              ))}
            </div>

            <ActivityChart title={t('trends')} hint={t('hints.trends')} points={timeline} metric={metric} />
            <div className="profile-grid-2">
              <ActivityChart title={t('hourPattern')} hint={t('hints.hourPattern')} points={hours} metric={metric} bars />
              <ActivityChart title={t('weekdayPattern')} hint={t('hints.weekdayPattern')} points={weekdays} metric={metric} bars />
            </div>

            <div className="profile-grid-2">
              <VolumeDistribution volume={analytics.volume} />
              <section className="profile-panel" aria-label={t('deviceActivity')}>
                <h3 data-hint={t('hints.deviceActivity')}>{t('deviceActivity')}</h3>
                {analytics.devices.length === 0 ? <p className="profile-empty-inline">{t('noObservations')}</p> : analytics.devices.map((device) => (
                  <div key={device.device_id} className="profile-volume-row">
                    <div>
                      <span>{device.name} · {t(`platforms.${device.platform}`)}</span>
                      <strong>{format.duration(deviceTotals[device.device_id] ?? 0)}</strong>
                    </div>
                  </div>
                ))}
              </section>
            </div>

            <ProfileExplorer summary={summary} />
          </div>
        )}
      </div>
    </div>
  );
}
