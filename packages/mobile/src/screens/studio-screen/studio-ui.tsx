import { Pressable, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { sliderPositionOf, sliderValueAt } from '@ton/core';

export const STUDIO_COLORS = {
  background: '#0a0a0a',
  surface: '#141414',
  raised: '#1f1f1f',
  border: 'rgba(255,255,255,0.08)',
  text: '#f2f2f2',
  dim: '#8a8a8a',
  wave: '#e8892b',
  waveCore: '#f4e4c4',
  fade: '#4aa3ff',
  playhead: '#2ee06b',
} as const;

const HINT_VISIBLE_MS = 5000;

interface HintState {
  hint: { name: string; text: string; anchor: 'top' | 'bottom' } | null;
}
const useHintStore = create<HintState>()(() => ({ hint: null }));

/** Each hint gets a number; a hint only closes itself if no newer one has opened since. No timer handle to keep. */
let hintToken = 0;

function showHint(name: string, text: string, anchor: 'top' | 'bottom'): void {
  hintToken += 1;
  const token = hintToken;
  useHintStore.setState({ hint: { name, text, anchor } });
  setTimeout(() => { if (token === hintToken) useHintStore.setState({ hint: null }); }, HINT_VISIBLE_MS);
}

/** The bubble itself: a name and, below it, a plain-language explanation. Tapping it closes it. */
export function StudioHint({ anchor, offset }: { anchor: 'top' | 'bottom'; offset: number }) {
  const hint = useHintStore((state) => state.hint);
  if (!hint || hint.anchor !== anchor) return null;
  return (
    <Pressable
      onPress={() => useHintStore.setState({ hint: null })}
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        [anchor]: offset,
        zIndex: 50,
        padding: 12,
        gap: 3,
        borderRadius: 12,
        backgroundColor: STUDIO_COLORS.raised,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        elevation: 8,
      }}
    >
      <Text style={{ color: STUDIO_COLORS.text, fontSize: 14, fontWeight: '600' }}>{hint.name}</Text>
      <Text style={{ color: STUDIO_COLORS.dim, fontSize: 13, lineHeight: 18 }}>{hint.text}</Text>
    </Pressable>
  );
}

/** Name and explanation of a control, from the same locale keys the desktop uses. */
export function useControlText(control: string): { name: string; text: string } {
  const { t } = useTranslation('studio');
  return { name: t(`controls.${control}.name`), text: t(`controls.${control}.text`) };
}

interface ButtonProps {
  control: string;
  onPress: () => void;
  active?: boolean;
  /** Greyed out, but a long press still explains it. */
  disabled?: boolean;
  /** Shows the name next to the icon. */
  label?: boolean;
  tone?: 'plain' | 'primary';
  /** Where the explanation bubble appears: under the header (`top`) or above the bottom panel (`bottom`). */
  hintAt?: 'top' | 'bottom';
  children?: ReactNode;
}

export function StudioButton({ control, onPress, active = false, disabled = false, label = false, tone = 'plain', hintAt = 'bottom', children }: ButtonProps) {
  const { name, text } = useControlText(control);
  const primary = tone === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ disabled, selected: active }}
      onPress={disabled ? undefined : onPress}
      onLongPress={() => showHint(name, text, hintAt)}
      delayLongPress={400}
      hitSlop={4}
      android_ripple={{ color: 'rgba(255,255,255,0.14)', borderless: false }}
      style={{
        minWidth: 40,
        height: 40,
        paddingHorizontal: label ? 12 : 8,
        borderRadius: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        backgroundColor: primary ? STUDIO_COLORS.text : active ? STUDIO_COLORS.raised : 'transparent',
        borderWidth: active && !primary ? 1 : 0,
        borderColor: 'rgba(255,255,255,0.14)',
        opacity: disabled ? 0.38 : 1,
      }}
    >
      {children}
      {label && <Text style={{ color: primary ? STUDIO_COLORS.background : STUDIO_COLORS.text, fontSize: 13, fontWeight: '500' }}>{name}</Text>}
    </Pressable>
  );
}

interface SliderProps {
  control: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** The value in the middle of the slider; finer near it and coarser towards the ends (same as the desktop). */
  neutral?: number;
}

/** A labelled slider: the name on the left (a long press explains it), the value on the right. */
export function StudioSlider({ control, value, min, max, step, format, onChange, disabled = false, neutral }: SliderProps) {
  const { name, text } = useControlText(control);
  const soft = neutral !== undefined;
  return (
    <View accessible accessibilityLabel={name} style={{ flexDirection: 'row', alignItems: 'center', height: 40, opacity: disabled ? 0.4 : 1 }}>
      <Pressable onLongPress={() => showHint(name, text, 'bottom')} delayLongPress={400} hitSlop={6} style={{ width: 96 }}>
        <Text numberOfLines={1} style={{ color: STUDIO_COLORS.dim, fontSize: 13 }}>{name}</Text>
      </Pressable>
      <Slider
        style={{ flex: 1, height: 40 }}
        minimumValue={soft ? -1 : min}
        maximumValue={soft ? 1 : max}
        step={soft ? 0 : step}
        value={soft ? sliderPositionOf(value, min, max, neutral) : value}
        disabled={disabled}
        onValueChange={(raw) => onChange(soft ? sliderValueAt(raw, min, max, neutral, step) : raw)}
        minimumTrackTintColor={STUDIO_COLORS.text}
        maximumTrackTintColor="rgba(255,255,255,0.18)"
        thumbTintColor={STUDIO_COLORS.text}
      />
      <Text style={{ width: 62, textAlign: 'right', color: STUDIO_COLORS.text, fontSize: 12, fontVariant: ['tabular-nums'] }}>{format(value)}</Text>
    </View>
  );
}

/** A titled group of related controls in the Edit panel. */
export function StudioSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: STUDIO_COLORS.border }}>
      <Text style={{ marginBottom: 8, color: '#6f6f6f', fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>{title}</Text>
      {children}
    </View>
  );
}
