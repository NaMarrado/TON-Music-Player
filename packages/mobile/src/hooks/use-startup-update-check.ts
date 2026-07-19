import { useEffect, useRef } from 'react';
import { initializeMobileUpdateState } from '../stores/update-store';

export function useStartupUpdateCheck(ready: boolean) {
  const startupUpdateCheckedRef = useRef(false);

  useEffect(() => {
    if (!ready || startupUpdateCheckedRef.current) {
      return;
    }

    startupUpdateCheckedRef.current = true;

    void initializeMobileUpdateState();
  }, [ready]);
}
