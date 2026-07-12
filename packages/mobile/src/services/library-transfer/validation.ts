export const INVALID_LIBRARY_ARCHIVE_ERROR = 'Selected file is not a TON library archive';
export const INVALID_LIBRARY_BUNDLE_ERROR = 'Selected archive does not contain a TON export bundle';
export const INVALID_LIBRARY_MANIFEST_ERROR = 'Selected archive does not contain a valid TON export manifest';

const LIBRARY_TRANSFER_VALIDATION_MESSAGES = [
  INVALID_LIBRARY_ARCHIVE_ERROR,
  INVALID_LIBRARY_BUNDLE_ERROR,
  INVALID_LIBRARY_MANIFEST_ERROR,
];

export function isLibraryTransferValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return LIBRARY_TRANSFER_VALIDATION_MESSAGES.some((message) => error.message.includes(message));
}
