const LIBRARY_TRANSFER_CANCELLED_MESSAGE = 'library-transfer-cancelled';

export function createLibraryTransferCancelledError(): Error {
  return new Error(LIBRARY_TRANSFER_CANCELLED_MESSAGE);
}

export function isLibraryTransferCancelledError(error: unknown): boolean {
  return error instanceof Error && error.message === LIBRARY_TRANSFER_CANCELLED_MESSAGE;
}

export function throwIfLibraryTransferCancelled(
  shouldCancel?: (() => boolean) | null,
): void {
  if (shouldCancel?.()) {
    throw createLibraryTransferCancelledError();
  }
}
