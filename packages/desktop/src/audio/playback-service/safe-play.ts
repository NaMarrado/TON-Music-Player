export async function safePlayElement(element: HTMLAudioElement): Promise<boolean> {
  try {
    await element.play();
    return true;
  } catch (error) {
    if (isInterruptedPlayAbort(error)) {
      return false;
    }

    throw error;
  }
}

function isInterruptedPlayAbort(error: unknown): boolean {
  if (!(error instanceof DOMException) || error.name !== 'AbortError') {
    return false;
  }

  return typeof error.message === 'string'
    && error.message.includes('The play() request was interrupted');
}
