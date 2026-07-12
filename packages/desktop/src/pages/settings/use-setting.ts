import { useState, useEffect, useCallback } from 'react';
import type { SettingKey } from '@ton/core';

export function useSetting(key: SettingKey) {
  const [value, setValue] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.api.invoke('settings:get', key).then((v) => {
      setValue(v as string | null);
      setLoaded(true);
    });
  }, [key]);

  const save = useCallback(
    async (newValue: string) => {
      await window.api.invoke('settings:set', key, newValue);
      setValue(newValue);
    },
    [key],
  );

  return { value, loaded, save };
}
