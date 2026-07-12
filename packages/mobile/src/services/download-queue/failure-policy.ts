const HTTP_DOWNLOAD_FAILURE_RE = /\bHTTP (\d{3})\b/;
const NON_RETRYABLE_LOCAL_FAILURES = [
  /UNIQUE constraint failed/i,
  /\bconstraint failed\b/i,
];

function parseDownloadHttpStatus(message: string): number | null {
  const match = HTTP_DOWNLOAD_FAILURE_RE.exec(message);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

export function shouldRetryQueueFailure(message: string): boolean {
  if (NON_RETRYABLE_LOCAL_FAILURES.some((pattern) => pattern.test(message))) {
    return false;
  }

  const status = parseDownloadHttpStatus(message);
  if (status == null) {
    return true;
  }

  // 4xx means the resolved media URL was rejected. Immediate automatic retries
  // only repeat the same client-side failure and can trigger provider throttles.
  return status < 400 || status >= 500;
}
