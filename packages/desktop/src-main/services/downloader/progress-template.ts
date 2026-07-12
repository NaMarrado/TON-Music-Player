export const YT_DLP_PROGRESS_PREFIX = '[TON_PROGRESS]';

const YT_DLP_PROGRESS_FIELDS = [
  '%(progress.status)s',
  '%(progress.downloaded_bytes)s',
  '%(progress.total_bytes)s',
  '%(progress.total_bytes_estimate)s',
  '%(progress.speed)s',
  '%(progress.eta)s',
] as const;

export const YT_DLP_DOWNLOAD_PROGRESS_TEMPLATE = [
  YT_DLP_PROGRESS_PREFIX,
  ...YT_DLP_PROGRESS_FIELDS,
].join('\t');

