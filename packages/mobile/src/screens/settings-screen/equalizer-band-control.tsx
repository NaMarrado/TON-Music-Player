import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { EQ_GAIN_MAX, EQ_GAIN_MIN } from '@ton/core';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { normalizeEqGain } from '../../services/audio-settings/math';

const THUMB_SIZE = 18;
const TRACK_HEIGHT = 132;
const TRACK_WIDTH = 28;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatGain(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function positionToValue(positionY: number): number {
  const clampedY = clamp(positionY, 0, TRACK_HEIGHT);
  const ratio = 1 - (clampedY / TRACK_HEIGHT);
  const rawValue = EQ_GAIN_MIN + ((EQ_GAIN_MAX - EQ_GAIN_MIN) * ratio);
  return normalizeEqGain(rawValue);
}

function valueToThumbCenter(value: number): number {
  const normalized = (EQ_GAIN_MAX - normalizeEqGain(value)) / (EQ_GAIN_MAX - EQ_GAIN_MIN);
  return normalized * TRACK_HEIGHT;
}

export function EqualizerBandControl({
  disabled,
  label,
  value,
  onCommit,
}: {
  disabled: boolean;
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draftValue, setDraftValue] = useState(value);
  const interactingRef = useRef(false);
  const draftValueRef = useRef(value);

  useEffect(() => {
    if (!interactingRef.current) {
      draftValueRef.current = value;
      setDraftValue(value);
    }
  }, [value]);

  function updateDraft(nextValue: number): number {
    const normalized = normalizeEqGain(nextValue);
    draftValueRef.current = normalized;
    setDraftValue((current) => (current === normalized ? current : normalized));
    return normalized;
  }

  function updateDraftFromPosition(positionY: number): number {
    return updateDraft(positionToValue(positionY));
  }

  function commitCurrent(): void {
    interactingRef.current = false;
    const nextValue = draftValueRef.current;
    if (nextValue !== value) {
      onCommit(nextValue);
      return;
    }

    setDraftValue(value);
  }

  const tapGesture = Gesture.Tap()
    .enabled(!disabled)
    .runOnJS(true)
    .onStart((event) => {
      const nextValue = updateDraftFromPosition(event.y);
      draftValueRef.current = nextValue;
      commitCurrent();
    });

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .runOnJS(true)
    .onBegin((event) => {
      interactingRef.current = true;
      updateDraftFromPosition(event.y);
    })
    .onUpdate((event) => {
      updateDraftFromPosition(event.y);
    })
    .onFinalize(() => {
      commitCurrent();
    });

  const gesture = Gesture.Exclusive(panGesture, tapGesture);
  const zeroCenter = valueToThumbCenter(0);
  const thumbCenter = valueToThumbCenter(draftValue);
  const thumbTop = clamp(thumbCenter - (THUMB_SIZE / 2), 0, TRACK_HEIGHT - THUMB_SIZE);
  const fillTop = Math.min(zeroCenter, thumbCenter);
  const fillHeight = Math.max(2, Math.abs(zeroCenter - thumbCenter));

  return (
    <View style={{ width: 42, alignItems: 'center', gap: 6 }}>
      <Text
        className="text-[11px] font-semibold"
        style={{ color: disabled ? '#666' : '#e8e8e8', minWidth: 30, textAlign: 'center' }}
      >
        {formatGain(draftValue)}
      </Text>

      <GestureDetector gesture={gesture}>
        <View
          style={{
            width: TRACK_WIDTH + 14,
            height: TRACK_HEIGHT + 8,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: TRACK_WIDTH,
              height: TRACK_HEIGHT,
              borderRadius: TRACK_WIDTH / 2,
              backgroundColor: '#0c0c0c',
              borderWidth: 1,
              borderColor: '#1e1e1e',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                position: 'absolute',
                left: (TRACK_WIDTH / 2) - 2,
                top: 0,
                width: 4,
                height: TRACK_HEIGHT,
                borderRadius: 999,
                backgroundColor: disabled ? '#1d1d1d' : '#232323',
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: zeroCenter - 0.5,
                height: 1,
                backgroundColor: '#2d2d2d',
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: (TRACK_WIDTH / 2) - 2,
                top: fillTop,
                width: 4,
                height: fillHeight,
                borderRadius: 999,
                backgroundColor: disabled ? '#4a4a4a' : '#f2f2f2',
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: (TRACK_WIDTH - THUMB_SIZE) / 2,
                top: thumbTop,
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                borderRadius: THUMB_SIZE / 2,
                backgroundColor: disabled ? '#7d7d7d' : '#ffffff',
                borderWidth: 1,
                borderColor: disabled ? '#5a5a5a' : '#e8e8e8',
              }}
            />
          </View>
        </View>
      </GestureDetector>

      <Text
        className="text-[10px] font-medium"
        style={{ color: '#7f7f7f', minWidth: 30, textAlign: 'center' }}
      >
        {label}
      </Text>
    </View>
  );
}
