import { InteractionManager } from 'react-native';
import { useEffect, useState } from 'react';

export function useUiUnlock({
  ready,
  hasError,
  delayMs = 180,
}: {
  ready: boolean;
  hasError: boolean;
  delayMs?: number;
}) {
  const [isUiUnlocked, setIsUiUnlocked] = useState(false);

  useEffect(() => {
    if (!ready || hasError) {
      setIsUiUnlocked(false);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      timeoutId = setTimeout(() => {
        setIsUiUnlocked(true);
      }, delayMs);
    });

    return () => {
      interactionTask.cancel();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [delayMs, hasError, ready]);

  return isUiUnlocked;
}
