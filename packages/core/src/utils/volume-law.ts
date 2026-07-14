export const DEFAULT_VOLUME_PERCENT = 50;
export const MIN_VOLUME_PERCENT = 0;
export const MAX_VOLUME_PERCENT = 200;
export const NORMAL_VOLUME_PERCENT = 100;
export const NORMAL_ZONE_RATIO = 0.8;
export const MIN_NORMAL_DB = -40;
export const MAX_BOOST_DB = 12;
export const DESKTOP_KEYBOARD_STEP_PERCENT = 1;
export const DESKTOP_WHEEL_STEP_PERCENT = 1;
export const MOBILE_VOLUME_BUTTON_STEP_PERCENT = 1;

const VOLUME_PERCENT_PRECISION = 10;
const LEGACY_DESKTOP_MAX_SCALAR = 5;
const LEGACY_DESKTOP_THRESHOLD = 1;
const NORMAL_GAIN_CURVE_BASE = 100;
const NORMAL_GAIN_CURVE_DENOMINATOR = NORMAL_GAIN_CURVE_BASE - 1;

export interface ResolvedStoredVolumePercent {
  source: 'volume_percent' | 'legacy_volume' | 'default';
  volumePercent: number;
  shouldPersist: boolean;
}

export function roundVolumePercent(value: number): number {
  return Math.round(value * VOLUME_PERCENT_PRECISION) / VOLUME_PERCENT_PRECISION;
}

export function clampVolumePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_VOLUME_PERCENT;
  }

  return roundVolumePercent(Math.max(MIN_VOLUME_PERCENT, Math.min(MAX_VOLUME_PERCENT, value)));
}

export function parseStoredVolumePercent(value: string | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return clampVolumePercent(parsed);
}

export function sliderPositionToVolumePercent(position: number): number {
  const clamped = Math.max(0, Math.min(1, position));
  if (clamped <= NORMAL_ZONE_RATIO) {
    return clampVolumePercent((clamped / NORMAL_ZONE_RATIO) * NORMAL_VOLUME_PERCENT);
  }

  return clampVolumePercent(
    NORMAL_VOLUME_PERCENT +
      ((clamped - NORMAL_ZONE_RATIO) / (1 - NORMAL_ZONE_RATIO)) *
        (MAX_VOLUME_PERCENT - NORMAL_VOLUME_PERCENT),
  );
}

export function volumePercentToSliderPosition(volumePercent: number): number {
  const clamped = clampVolumePercent(volumePercent);
  if (clamped <= NORMAL_VOLUME_PERCENT) {
    return (clamped / NORMAL_VOLUME_PERCENT) * NORMAL_ZONE_RATIO;
  }

  return (
    NORMAL_ZONE_RATIO +
    ((clamped - NORMAL_VOLUME_PERCENT) / (MAX_VOLUME_PERCENT - NORMAL_VOLUME_PERCENT)) *
      (1 - NORMAL_ZONE_RATIO)
  );
}

export function volumePercentToNormalGain(volumePercent: number): number {
  const clamped = clampVolumePercent(volumePercent);
  if (clamped <= MIN_VOLUME_PERCENT) {
    return 0;
  }

  if (clamped >= NORMAL_VOLUME_PERCENT) {
    return 1;
  }

  const normalized = clamped / NORMAL_VOLUME_PERCENT;
  return Math.expm1(Math.log(NORMAL_GAIN_CURVE_BASE) * normalized) / NORMAL_GAIN_CURVE_DENOMINATOR;
}

export function volumePercentToDesktopGain(volumePercent: number): number {
  const clamped = clampVolumePercent(volumePercent);
  if (clamped <= NORMAL_VOLUME_PERCENT) {
    return volumePercentToNormalGain(clamped);
  }

  const boostDb = MAX_BOOST_DB * ((clamped - NORMAL_VOLUME_PERCENT) / NORMAL_VOLUME_PERCENT);
  return dbToGain(boostDb);
}

export function volumePercentToAndroidTrackGain(volumePercent: number): number {
  const clamped = clampVolumePercent(volumePercent);
  if (clamped <= NORMAL_VOLUME_PERCENT) {
    return volumePercentToNormalGain(clamped);
  }

  return 1;
}

export function volumePercentToAndroidBoostMb(volumePercent: number): number {
  const clamped = clampVolumePercent(volumePercent);
  if (clamped <= NORMAL_VOLUME_PERCENT) {
    return 0;
  }

  return Math.round(
    MAX_BOOST_DB * 100 * ((clamped - NORMAL_VOLUME_PERCENT) / NORMAL_VOLUME_PERCENT),
  );
}

export function isVolumeBoosted(volumePercent: number): boolean {
  return clampVolumePercent(volumePercent) > NORMAL_VOLUME_PERCENT;
}

export function formatVolumePercentLabel(volumePercent: number): string {
  const clamped = clampVolumePercent(volumePercent);
  if (clamped <= NORMAL_VOLUME_PERCENT) {
    return `${Math.round(clamped)}%`;
  }

  return `100% +${Math.round(clamped - NORMAL_VOLUME_PERCENT)}%`;
}

export function resolveStoredVolumePercent(
  volumePercentValue: string | null | undefined,
  legacyVolumeValue: string | null | undefined,
): ResolvedStoredVolumePercent {
  const parsedPercent = parseStoredVolumePercent(volumePercentValue);
  if (parsedPercent != null) {
    return {
      source: 'volume_percent',
      volumePercent: parsedPercent,
      shouldPersist: false,
    };
  }

  const parsedLegacy = parseLegacyVolume(legacyVolumeValue);
  if (parsedLegacy != null) {
    return {
      source: 'legacy_volume',
      volumePercent:
        parsedLegacy <= 1
          ? gainToVolumePercent(parsedLegacy)
          : gainToVolumePercent(legacyDesktopScalarToGain(parsedLegacy)),
      shouldPersist: true,
    };
  }

  return {
    source: 'default',
    volumePercent: DEFAULT_VOLUME_PERCENT,
    shouldPersist: true,
  };
}

function parseLegacyVolume(value: string | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.min(LEGACY_DESKTOP_MAX_SCALAR, parsed));
}

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

function gainToDb(gain: number): number {
  return 20 * Math.log10(gain);
}

function gainToVolumePercent(gain: number): number {
  if (!Number.isFinite(gain) || gain <= 0) {
    return 0;
  }

  if (gain <= 1) {
    return clampVolumePercent(
      NORMAL_VOLUME_PERCENT *
        (Math.log1p(gain * NORMAL_GAIN_CURVE_DENOMINATOR) / Math.log(NORMAL_GAIN_CURVE_BASE)),
    );
  }

  const boostDb = gainToDb(gain);
  return clampVolumePercent(
    NORMAL_VOLUME_PERCENT + (boostDb / MAX_BOOST_DB) * NORMAL_VOLUME_PERCENT,
  );
}

function legacyDesktopScalarToGain(value: number): number {
  if (value <= LEGACY_DESKTOP_THRESHOLD) {
    return Math.pow(value, 2.5);
  }

  const t = (value - LEGACY_DESKTOP_THRESHOLD) / 2;
  return 1 + Math.pow(t, 1.3) * 2;
}
