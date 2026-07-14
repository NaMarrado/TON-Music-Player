import { StyleSheet } from 'react-native';

export type VolumeControlVariant = 'full' | 'compact';

export const VOLUME_ICON_COLOR = '#888';
export const VOLUME_SLIDER_MIN_TRACK_COLOR = '#888';
export const VOLUME_SLIDER_MAX_TRACK_COLOR = '#333';
export const VOLUME_SLIDER_THUMB_COLOR = '#ccc';
export const VOLUME_ICON_SIZE_BY_VARIANT = { compact: 12, full: 14 } as const;
export const VOLUME_LABEL_FONT_SIZE_BY_VARIANT = { compact: 11, full: 12 } as const;
export const VOLUME_STEP_BUTTON_DIMENSIONS = {
  compact: { size: 24, iconSize: 13 },
  full: { size: 30, iconSize: 15 },
} as const;

export const styles = StyleSheet.create({
  compactContainer: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 10,
  },
  fullContainer: {
    paddingHorizontal: 24,
    marginTop: 16,
    marginBottom: 16,
  },
  stepButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stepButtonBeforeSlider: { marginLeft: 8 },
  stepButtonAfterSlider: { marginRight: 8 },
  sliderTrack: {
    flex: 1,
    height: 24,
    marginHorizontal: 8,
    justifyContent: 'center',
  },
  normalZoneMarker: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: 1,
    backgroundColor: '#666',
    opacity: 0.45,
  },
  slider: { flex: 1, height: 24 },
  volumeLabelContainer: {
    position: 'relative',
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  volumeLabelSizer: {
    color: 'transparent',
    fontWeight: '600',
    opacity: 0,
    fontVariant: ['tabular-nums'],
  },
  volumeLabel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    color: '#cfcfcf',
    fontWeight: '600',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});

export const VOLUME_CONTROL_CONTAINER_STYLE_BY_VARIANT = {
  compact: styles.compactContainer,
  full: styles.fullContainer,
} as const;
