export const APP_NAME = 'TON';
export const APP_VERSION = '1.0.19';
export const TON_DISCORD_URL = 'https://discord.gg/4PHWaYXeT4';

export const SUPPORTED_AUDIO_EXTENSIONS = [
  '.mp3',
  '.flac',
  '.wav',
  '.ogg',
  '.opus',
  '.aac',
  '.m4a',
  '.wma',
  '.webm',
  '.aiff',
  '.aif',
  '.ape',
  '.alac',
  '.dsf',
  '.dff',
  '.wv',
  '.mka',
  '.mp4',
  '.3gp',
] as const;

export const MAX_CONCURRENT_DOWNLOADS = 2;
export const DOWNLOAD_RETRY_MAX = 2;
export const DOWNLOAD_RETRY_DELAY_MS = 5000;
export const DOWNLOAD_DELAY_MIN_MS = 3000;
export const DOWNLOAD_DELAY_MAX_MS = 8000;

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_RESULTS_LIMIT = 50;

export const GAPLESS_CROSSFADE_MS = 10;
export const GAPLESS_PRELOAD_MS = 5000;

export const PITCH_SHIFT_LATENCY_MS = 100;

export const CUSTOM_PROTOCOL = 'ton-media';
