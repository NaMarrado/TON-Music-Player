export * from './types/index';

export { formatTime, formatDuration } from './utils/format-time';
export { formatSize } from './utils/format-size';
export {
  formatDownloadedDate,
  formatTrackFileSizeSummary,
  summarizeTrackFileSizes,
} from './utils/track-metadata';
export type { TrackFileSizeSummary } from './utils/track-metadata';
export { slugify } from './utils/slugify';
export { debounce } from './utils/debounce';
export { hashBuffer } from './utils/hash';
export {
  AGE_RESTRICTED_DOWNLOAD_MESSAGE,
  getDownloadFailureReason,
  getDownloadFailureTranslationKey,
  isAgeRestrictedDownloadError,
  toDownloadFailureMessage,
} from './utils/download-failure';
export type {
  DownloadFailureReason,
  DownloadFailureTranslationKey,
} from './utils/download-failure';
export {
  APP_NAME,
  APP_VERSION,
  TON_DISCORD_URL,
  SUPPORTED_AUDIO_EXTENSIONS,
  MAX_CONCURRENT_DOWNLOADS,
  DOWNLOAD_RETRY_MAX,
  DOWNLOAD_RETRY_DELAY_MS,
  DOWNLOAD_DELAY_MIN_MS,
  DOWNLOAD_DELAY_MAX_MS,
  SEARCH_DEBOUNCE_MS,
  SEARCH_RESULTS_LIMIT,
  GAPLESS_CROSSFADE_MS,
  GAPLESS_PRELOAD_MS,
  PITCH_SHIFT_LATENCY_MS,
  CUSTOM_PROTOCOL,
} from './utils/constants';
export {
  SEARCH_PAGE_LIMITS,
  SearchProviderQueryAliases,
  buildSearchFtsQuery,
  canonicalizeSearchQuery,
  createSearchPageRequest,
  createSearchRequestIdGenerator,
  getSearchPageLimit,
  isCurrentSearchRequest,
  rankSearchResults,
  relaxSearchQuery,
  searchRelevanceScore,
  tokenizeSearchQuery,
} from './utils/search';

export { sanitizeFilename } from './utils/sanitize-filename';
export {
  DEFAULT_VOLUME_PERCENT,
  DESKTOP_KEYBOARD_STEP_PERCENT,
  DESKTOP_WHEEL_STEP_PERCENT,
  MAX_BOOST_DB,
  MAX_VOLUME_PERCENT,
  MIN_VOLUME_PERCENT,
  MIN_NORMAL_DB,
  MOBILE_VOLUME_BUTTON_STEP_PERCENT,
  NORMAL_VOLUME_PERCENT,
  NORMAL_ZONE_RATIO,
  clampVolumePercent,
  formatVolumePercentLabel,
  isVolumeBoosted,
  parseStoredVolumePercent,
  resolveStoredVolumePercent,
  roundVolumePercent,
  sliderPositionToVolumePercent,
  volumePercentToAndroidBoostMb,
  volumePercentToAndroidTrackGain,
  volumePercentToDesktopGain,
  volumePercentToNormalGain,
  volumePercentToSliderPosition,
} from './utils/volume-law';
export type { ResolvedStoredVolumePercent } from './utils/volume-law';
export {
  getFilteredTracks,
  getArtists,
  getMostPlayed,
  getRecentlyPlayed,
  relevanceScore,
  getVisibleResults,
  getSourceCounts,
} from './utils/store-helpers';
export type { SortField, SortOrder } from './utils/store-helpers';

export {
  detectPlaylistSource,
  parseSpotifyPlaylistUrl,
  parseYouTubePlaylistUrl,
  parseSoundCloudPlaylistUrl,
} from './services/detect-playlist-source';
export type { PlaylistSource } from './services/detect-playlist-source';
export {
  TON_REPOSITORY_URL,
  TON_RELEASES_URL,
  TON_UPDATE_MANIFEST_URL,
  compareVersions,
  checkForAppUpdate,
} from './services/app-update';
export type {
  AppUpdatePlatform,
  UpdateAssetDescriptor,
  UpdateManifestDesktopTargets,
  UpdateManifest,
  UpdateSource,
  AppUpdateCheck,
  UpdateFetch,
  UpdateFetchResponse,
} from './services/app-update';

export { diceCoefficient, findBestMatch, normalizeTitle } from './services/match-service';
export type { MatchCandidate, MatchInput } from './services/match-service';

export { parseYouTubePlaylistItem } from './services/youtube-playlist-item';

export { executeSpotifySearchPage } from './services/spotify-search';
export type {
  SpotifySearchPageFetcher,
  SpotifySearchResponseLike,
  SpotifySearchTrackLike,
} from './services/spotify-search';

export { buildSmartPlaylistQuery } from './services/smart-playlist-service';
export type { SmartPlaylistQuery } from './services/smart-playlist-service';

export {
  ResourceJobScheduler,
} from './services/job-scheduler';
export type {
  JobKind,
  JobPriority,
  QueueNotice,
  ResourceJobLease,
  ResourceLane,
  ResourceLaneLimits,
} from './services/job-scheduler';
export {
  base64ToBytes,
  CloudAutoSyncCoordinator,
  CloudStoragePreconditionFailedError,
  buildCloudAudioObjectKey,
  buildCloudArtworkObjectKey,
  buildCloudContentArtworkObjectKey,
  buildCloudContentAudioObjectKey,
  buildCloudConnectionTestObjectKey,
  buildCloudCommitObjectKey,
  buildCloudLibraryArtworkObjectKey,
  buildCloudLibraryAudioObjectKey,
  buildCloudManifestObjectKey,
  buildCloudPlaylistAudioObjectKey,
  buildCloudPlaylistCoverObjectKey,
  buildCloudPlaylistFolderName,
  buildCloudRevision,
  buildCloudR2CleanupPlan,
  buildCloudV2CommitObjectKey,
  buildCloudV2ActivationObjectKey,
  buildCloudV2ManifestObjectKey,
  buildLegacyCloudCommitObjectKey,
  buildLegacyCloudConnectionTestObjectKey,
  buildLegacyCloudManifestObjectKey,
  buildR2Endpoint,
  createCloudStorageHttpError,
  createCloudDeletedPlaylistRecordV2,
  createCloudDeletedTrackRecordV2,
  createEmptyCloudLibraryManifest,
  createEmptyCloudLibraryManifestV2,
  createCloudLivePlaylistRecordV2,
  createCloudLiveTrackRecordV2,
  createSha256Hasher,
  compareCloudEntityVersions,
  convertCloudLibraryManifestV1ToV2,
  getCloudStorageErrorKey,
  isCloudStoragePreconditionFailedError,
  mergeCloudLibraryManifests,
  mergeCloudLibraryManifestsV2,
  nextCloudEntityVersion,
  normalizeCloudObjectEtag,
  normalizeCloudPrefix,
  fingerprintCloudCleanupLibrary,
  getLiveCloudManifestObjectKeys,
  isTonManagedMediaObjectKey,
  normalizeCloudStorageErrorKey,
  parseCloudLibraryManifestV2,
  parseCloudStorageServiceErrorCode,
  sha256Hex,
  signR2Request,
} from './services/cloud-sync';
export type {
  CloudAutoSyncCoordinatorOptions,
  CloudAutoSyncErrorKind,
  CloudAutoSyncRunContext,
  CloudAutoSyncRunOutcome,
  CloudAutoSyncTimerAdapter,
  CloudPlaylistObjectNameInput,
  CloudR2CleanupPlan,
  CloudStorageErrorKey,
  CloudTrackObjectNameInput,
  MergeCloudLibraryManifestsV2Options,
  R2SignedRequest,
} from './services/cloud-sync';

export {
  createI18nInstance,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
} from './i18n/setup';
export type { SupportedLanguage } from './i18n/setup';
export {
  LANGUAGE_DEFINITIONS,
  getLanguageNativeName,
} from './i18n/languages';
export type { LanguageDirection } from './i18n/languages';
export {
  addPreparedResourceBundle,
  getLanguageDisplayName,
  getLanguageDirection,
  isolateDirectionalText,
  prepareLocaleResources,
} from './i18n/text-direction';
export type {
  I18nConfig,
  LocaleResourceObject,
  LocaleResources,
  LocaleResourceValue,
} from './i18n/types';
