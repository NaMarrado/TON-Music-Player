export type RawAdaptiveFormat = {
  audioQuality?: string;
  mimeType?: string;
  qualityLabel?: string;
  url?: string;
  signatureCipher?: string;
  cipher?: string;
  bitrate?: number;
  itag?: number;
  contentLength?: string | number;
};

export type RawStreamingData = {
  adaptiveFormats?: RawAdaptiveFormat[];
  formats?: RawAdaptiveFormat[];
};

export type RawPlayabilityStatus = {
  status?: string;
  reason?: string;
};

export type RawPlayerResponse = {
  playabilityStatus?: RawPlayabilityStatus;
  streamingData?: RawStreamingData;
};

export type RawReelResponse = RawPlayerResponse & {
  playerResponse?: RawPlayerResponse;
};
