import { InteractionManager } from 'react-native';
import { useEffect, useState } from 'react';

export function useDelayedWebView({
  ready,
  isUiUnlocked,
  delayMs = 1500,
}: {
  ready: boolean;
  isUiUnlocked: boolean;
  delayMs?: number;
}) {
  const [shouldMountWebView, setShouldMountWebView] = useState(false);

  useEffect(() => {
    if (!ready || !isUiUnlocked) {
      setShouldMountWebView(false);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const interactionTask = InteractionManager.runAfterInteractions(() => {
      timeoutId = setTimeout(() => {
        setShouldMountWebView(true);
      }, delayMs);
    });

    return () => {
      interactionTask.cancel();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [delayMs, isUiUnlocked, ready]);

  return shouldMountWebView;
}
