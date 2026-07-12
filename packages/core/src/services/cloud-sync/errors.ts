export type CloudStorageErrorKey =
  | 'cloudStorageErrorAccessDenied'
  | 'cloudStorageErrorBadRequest'
  | 'cloudStorageErrorBucketNotFound'
  | 'cloudStorageErrorClockSkew'
  | 'cloudStorageErrorConnectionFailed'
  | 'cloudStorageErrorInvalidAccessKey'
  | 'cloudStorageErrorJurisdiction'
  | 'cloudStorageErrorSecureStorageUnavailable'
  | 'cloudStorageErrorSignatureMismatch';

const ERROR_KEYS = new Set<CloudStorageErrorKey>([
  'cloudStorageErrorAccessDenied',
  'cloudStorageErrorBadRequest',
  'cloudStorageErrorBucketNotFound',
  'cloudStorageErrorClockSkew',
  'cloudStorageErrorConnectionFailed',
  'cloudStorageErrorInvalidAccessKey',
  'cloudStorageErrorJurisdiction',
  'cloudStorageErrorSecureStorageUnavailable',
  'cloudStorageErrorSignatureMismatch',
]);

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function readXmlTag(body: string, tag: string): string | null {
  const match = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : null;
}

export function parseCloudStorageServiceErrorCode(body: string): string | null {
  return readXmlTag(body, 'Code');
}

export function getCloudStorageErrorKey(status: number, body = ''): CloudStorageErrorKey {
  const serviceCode = parseCloudStorageServiceErrorCode(body);

  switch (serviceCode) {
    case 'AuthorizationHeaderMalformed':
      return 'cloudStorageErrorJurisdiction';
    case 'InvalidAccessKeyId':
    case 'InvalidAccessKey':
    case 'InvalidToken':
      return 'cloudStorageErrorInvalidAccessKey';
    case 'NoSuchBucket':
      return 'cloudStorageErrorBucketNotFound';
    case 'RequestTimeTooSkewed':
      return 'cloudStorageErrorClockSkew';
    case 'SignatureDoesNotMatch':
      return 'cloudStorageErrorSignatureMismatch';
    case 'AccessDenied':
      return 'cloudStorageErrorAccessDenied';
    default:
      break;
  }

  if (status === 400) {
    return 'cloudStorageErrorBadRequest';
  }
  if (status === 401) {
    return 'cloudStorageErrorInvalidAccessKey';
  }
  if (status === 403) {
    return 'cloudStorageErrorAccessDenied';
  }
  if (status === 404) {
    return 'cloudStorageErrorBucketNotFound';
  }
  return 'cloudStorageErrorConnectionFailed';
}

export function createCloudStorageHttpError(status: number, body = ''): Error {
  return new Error(getCloudStorageErrorKey(status, body));
}

export function normalizeCloudStorageErrorKey(message: string): CloudStorageErrorKey | null {
  const clean = message.trim();
  for (const key of ERROR_KEYS) {
    if (clean.includes(key)) {
      return key;
    }
  }

  const embeddedServiceCode = parseCloudStorageServiceErrorCode(clean);
  if (embeddedServiceCode) {
    return getCloudStorageErrorKey(Number.NaN, clean);
  }

  const status = clean.match(/\bHTTP\s+(\d{3})\b/i)?.[1];
  if (status) {
    return getCloudStorageErrorKey(Number(status), clean);
  }
  return null;
}
