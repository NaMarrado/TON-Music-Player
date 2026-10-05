import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ProfileVolumeStat } from '@ton/core';
import { useProfileFormat } from './profile-format';

export function Chips<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`px-3.5 py-1.5 rounded-full ${active ? 'bg-white' : 'bg-bg-surface'}`}
          >
            <Text className={`text-[13px] font-semibold ${active ? 'text-black' : 'text-text-secondary'}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mx-4 mt-4 p-4 rounded-2xl bg-bg-surface">
      <Text className="text-white text-[15px] font-semibold mb-3">{title}</Text>
      {children}
    </View>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text className="text-text-secondary text-[13px]">{children}</Text>;
}

export function Fields({ fields }: { fields: { label: string; value: string }[] }) {
  return (
    <View>
      {fields.map((field) => (
        <View key={field.label} className="flex-row justify-between py-1.5" style={{ gap: 12 }}>
          <Text className="text-text-secondary text-[13px]">{field.label}</Text>
          <Text className="text-white text-[13px] font-medium text-right" style={{ flexShrink: 1 }} selectable>{field.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Collapsed by default, like the desktop's details elements. */
export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="mt-1">
      <Pressable onPress={() => setOpen(!open)} className="flex-row items-center py-1.5">
        <Feather name={open ? 'chevron-down' : 'chevron-right'} size={14} color="#9a9a9a" />
        <Text className="text-text-secondary text-[13px] ml-1">{title}</Text>
      </Pressable>
      {open && children}
    </View>
  );
}

export interface ChartPoint {
  key: string;
  label: string;
  listened_ms: number;
  plays: number;
}

/** Bar chart; tapping a bar shows its exact value under the chart. */
export function BarChart({ title, points, metric }: { title: string; points: ChartPoint[]; metric: 'time' | 'plays' }) {
  const { t } = useTranslation('profile');
  const format = useProfileFormat();
  const [selected, setSelected] = useState<string | null>(null);
  const value = (point: ChartPoint) => metric === 'time' ? point.listened_ms : point.plays;
  const maximum = Math.max(0, ...points.map(value));
  const active = points.find((point) => point.key === selected) ?? null;
  return (
    <Panel title={title}>
      {maximum === 0 ? <Muted>{t('noChartActivity')}</Muted> : (
        <>
          <View className="flex-row items-end" style={{ height: 120, gap: points.length > 40 ? 1 : 3 }}>
            {points.map((point) => (
              <Pressable
                key={point.key}
                onPress={() => setSelected(point.key === selected ? null : point.key)}
                style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}
                accessibilityLabel={t('chartPoint', { label: point.label, time: format.duration(point.listened_ms), count: point.plays })}
              >
                <View style={{
                  height: `${Math.max(value(point) > 0 ? 3 : 0, value(point) / maximum * 100)}%`,
                  backgroundColor: point.key === selected ? '#ffffff' : 'rgba(255,255,255,0.45)',
                  borderRadius: 2,
                }} />
              </Pressable>
            ))}
          </View>
          <View className="flex-row justify-between mt-1.5">
            <Text className="text-text-muted text-[11px]">{points[0]?.label}</Text>
            <Text className="text-text-muted text-[11px]">{points[points.length - 1]?.label}</Text>
          </View>
          {active && (
            <Text className="text-white text-[13px] mt-2">
              {active.label}: {format.duration(active.listened_ms)} · {t('plays', { count: active.plays })}
            </Text>
          )}
        </>
      )}
    </Panel>
  );
}

export function VolumeList({ volume }: { volume: ProfileVolumeStat[] }) {
  const { t } = useTranslation('profile');
  const format = useProfileFormat();
  const maximum = Math.max(0, ...volume.map((entry) => entry.listened_ms));
  return (
    <Panel title={t('volumeDistribution')}>
      {volume.length === 0 ? <Muted>{t('noVolumeData')}</Muted> : volume.map((entry) => (
        <View key={`${entry.volume_percent}:${entry.muted}`} className="py-1.5">
          <View className="flex-row justify-between">
            <Text className="text-text-secondary text-[13px]">{entry.muted ? t('muted') : format.volume(entry.volume_percent)}</Text>
            <Text className="text-white text-[13px] font-medium">{format.duration(entry.listened_ms)}</Text>
          </View>
          <View className="h-1 mt-1 rounded-full bg-white/10">
            <View className="h-1 rounded-full bg-white/60" style={{ width: `${maximum > 0 ? entry.listened_ms / maximum * 100 : 0}%` }} />
          </View>
        </View>
      ))}
    </Panel>
  );
}
