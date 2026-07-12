import {
  supportsEqualizerEffects,
  supportsLoudnessAnalysis,
  supportsLoudnessBoost,
  supportsPitchAdjustment,
} from './capabilities';

export type AudioSettingsSupportNoteKey =
  | 'frequencyUnsupportedIos'
  | 'eqUnsupportedIos'
  | 'loudnessUnsupportedIos'
  | 'loudnessIosBoostNotice';

export interface AudioFeatureSupport {
  noteKey: AudioSettingsSupportNoteKey | null;
  supported: boolean;
}

export interface LoudnessFeatureSupport {
  analysisSupported: boolean;
  boostSupported: boolean;
  noteKey: AudioSettingsSupportNoteKey | null;
}

export interface AudioSettingsSupportSnapshot {
  equalizer: AudioFeatureSupport;
  frequency: AudioFeatureSupport;
  loudness: LoudnessFeatureSupport;
}

export function getAudioSettingsSupportSnapshot(): AudioSettingsSupportSnapshot {
  const frequencySupported = supportsPitchAdjustment();
  const equalizerSupported = supportsEqualizerEffects();
  const loudnessAnalysisSupported = supportsLoudnessAnalysis();
  const loudnessBoostSupported = supportsLoudnessBoost();

  return {
    equalizer: {
      supported: equalizerSupported,
      noteKey: equalizerSupported ? null : 'eqUnsupportedIos',
    },
    frequency: {
      supported: frequencySupported,
      noteKey: frequencySupported ? null : 'frequencyUnsupportedIos',
    },
    loudness: {
      analysisSupported: loudnessAnalysisSupported,
      boostSupported: loudnessBoostSupported,
      noteKey: !loudnessAnalysisSupported
        ? 'loudnessUnsupportedIos'
        : !loudnessBoostSupported
          ? 'loudnessIosBoostNotice'
          : null,
    },
  };
}
