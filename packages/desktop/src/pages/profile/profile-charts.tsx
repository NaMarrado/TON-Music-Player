import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileVolumeStat } from '@ton/core';
import { VirtualizedList } from '../../components/player/virtualized-list';
import { useProfileFormat } from './profile-format';

export interface ChartPoint {
  key: string;
  label: string;
  shortLabel: string;
  listened_ms: number;
  plays: number;
}

export function ActivityChart({ title, hint, points, metric, bars = false }: {
  title: string;
  hint: string;
  points: ChartPoint[];
  metric: 'time' | 'plays';
  bars?: boolean;
}) {
  const { t } = useTranslation('pages/profile');
  const format = useProfileFormat();
  const instructions = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const peak = points.reduce((best, entry, index) => (metric === 'time' ? entry.listened_ms > points[best].listened_ms : entry.plays > points[best].plays) ? index : best, 0);
  const lastActive = points.reduce((last, entry, index) => (entry.listened_ms > 0 || entry.plays > 0) ? index : last, points.length - 1);
  const active = Math.min(selected ?? (bars ? peak : lastActive), points.length - 1);
  const point = points[active];
  const value = (entry: ChartPoint) => metric === 'time' ? entry.listened_ms : entry.plays;
  const maximum = points.reduce((max, entry) => Math.max(max, value(entry)), 0);
  const x = (index: number) => points.length === 1 ? 360 : 8 + index / (points.length - 1) * 704;
  const y = (entry: ChartPoint) => 148 - (maximum > 0 ? value(entry) / maximum * 132 : 0);
  // Plays that were counted before time was measured have no duration; that is unknown, not 0 s.
  const measured = (entry: ChartPoint) => entry.listened_ms === 0 && entry.plays > 0 ? t('unknownValue') : format.exactDuration(entry.listened_ms);
  const description = (entry: ChartPoint) => t('chartPoint', { label: entry.label, time: measured(entry), count: entry.plays });
  const path = points.map((entry, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(entry).toFixed(2)}`).join(' ');
  const barWidth = Math.min(44, 680 / Math.max(points.length, 1) * 0.65);

  return (
    <section className="profile-panel profile-chart-panel" aria-label={title}>
      <header className="profile-section-heading"><h2 data-hint={hint}>{title}</h2><span className="profile-muted">{t(metric === 'time' ? 'timeMetric' : 'playsMetric')}</span></header>
      <div className="profile-chart-scale" aria-hidden="true">
        <span>{metric === 'time' ? format.duration(maximum) : format.number(maximum)}</span>
        <span>{metric === 'time' ? format.duration(0) : format.number(0)}</span>
      </div>
      <div
        className="profile-chart"
        role={points.length ? 'slider' : undefined}
        tabIndex={points.length ? 0 : undefined}
        aria-label={title}
        aria-describedby={instructions}
        aria-valuemin={points.length ? 0 : undefined}
        aria-valuemax={points.length ? points.length - 1 : undefined}
        aria-valuenow={points.length ? active : undefined}
        aria-valuetext={point ? description(point) : undefined}
        onKeyDown={(event) => {
          if (!points.length) return;
          let next = active;
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(active + 1, points.length - 1);
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(active - 1, 0);
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = points.length - 1;
          else return;
          event.preventDefault();
          setSelected(next);
        }}
        onPointerMove={(event) => {
          if (!points.length) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const plotX = (event.clientX - rect.left) / rect.width * 720;
          setSelected(Math.max(0, Math.min(points.length - 1, Math.round((plotX - 8) / 704 * (points.length - 1)))));
        }}
        onPointerLeave={() => setSelected(null)}
        onClick={(event) => event.currentTarget.focus()}
      >
        <svg viewBox="0 0 720 164" preserveAspectRatio="none" aria-hidden="true">
          {[16, 82, 148].map((line) => <line key={line} x1="0" x2="720" y1={line} y2={line} className="profile-chart-grid" />)}
          {bars ? points.map((entry, index) => (
            <rect key={entry.key} x={x(index) - barWidth / 2} y={y(entry)} width={barWidth} height={148 - y(entry)} rx="3" className={index === active ? 'profile-chart-active' : 'profile-chart-bar'} />
          )) : points.length > 0 && maximum > 0 && <>
            <path d={`${path} L${x(points.length - 1)},148 L${x(0)},148 Z`} className="profile-chart-area" />
            <path d={path} className="profile-chart-line" />
          </>}
          {point && maximum > 0 && <>
            <line x1={x(active)} x2={x(active)} y1="10" y2="148" className="profile-chart-cursor" />
            <circle cx={x(active)} cy={y(point)} r="4" className="profile-chart-active" />
          </>}
        </svg>
        {maximum === 0 && <p className="profile-chart-empty">{t('noChartActivity')}</p>}
      </div>
      <p id={instructions} className="sr-only">{t('chartInstructions')}</p>
      <div className="profile-chart-axis" aria-hidden="true">
        <span>{points[0]?.shortLabel}</span><span>{points[Math.floor(points.length / 2)]?.shortLabel}</span><span>{points[points.length - 1]?.shortLabel}</span>
      </div>
      <div className="profile-chart-readout" title={point ? description(point) : undefined}>
        {point ? <><span>{point.label}</span><strong>{measured(point)}</strong><span>{t('plays', { count: point.plays })}</span></> : <span>{t('noPeriodActivity')}</span>}
      </div>
      {points.length > 0 && <details className="profile-disclosure">
        <summary>{t('exactValues')}</summary>
        <VirtualizedList
          className="profile-scroll-list"
          items={points}
          estimateSize={44}
          style={{ maxHeight: 264 }}
          keyExtractor={(entry) => entry.key}
          renderItem={(entry) => <div className="profile-value-row"><span>{entry.label}</span><span>{measured(entry)}</span><span>{t('plays', { count: entry.plays })}</span></div>}
        />
      </details>}
    </section>
  );
}

export function VolumeDistribution({ volume }: { volume: ProfileVolumeStat[] }) {
  const { t } = useTranslation('pages/profile');
  const format = useProfileFormat();
  const maximum = volume.reduce((max, item) => Math.max(max, item.listened_ms), 0);
  const entries = [...volume].sort((a, b) => (a.volume_percent ?? -1) - (b.volume_percent ?? -1) || Number(a.muted) - Number(b.muted));
  return <section className="profile-panel" aria-label={t('volumeDistribution')}>
    <h3 data-hint={t('hints.volume')}>{t('volumeDistribution')}</h3>
    <p className="profile-note">{t('volumeNote')}</p>
    {entries.length === 0 ? <p className="profile-empty-inline">{t('noVolumeData')}</p> : (
      <div className="profile-volume-list">
        {entries.map((entry) => (
          <div key={`${entry.volume_percent}:${entry.muted}`} className="profile-volume-row">
            <div><span>{format.volume(entry.volume_percent)}{entry.muted ? ` · ${t('muted')}` : ''}</span><strong>{format.exactDuration(entry.listened_ms)}</strong></div>
            <div className="profile-meter" aria-hidden="true"><span style={{ width: `${maximum > 0 ? entry.listened_ms / maximum * 100 : 0}%` }} /></div>
          </div>
        ))}
      </div>
    )}
  </section>;
}
