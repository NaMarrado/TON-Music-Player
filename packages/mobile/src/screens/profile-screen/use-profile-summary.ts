import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { ProfileQuery } from '@ton/core';
import { getMobileProfileSummary, type MobileProfileSummary } from '../../services/listening-profile/summary';
import { useLibraryStore } from '../../stores/library-store';

/** Listening is captured in the background, so the open screen re-reads it periodically. */
const LIVE_REFRESH_MS = 15_000;

export function useProfileSummary(query: ProfileQuery) {
  const queryKey = JSON.stringify([query.period, query.year, query.device_id]);
  const [result, setResult] = useState<{ key: string; summary: MobileProfileSummary } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const libraryRevision = useLibraryStore((state) => state.revision);

  useEffect(() => {
    let cancelled = false;
    setErrorKey(null);
    getMobileProfileSummary({
      period: query.period,
      ...(query.year === undefined ? {} : { year: query.year }),
      ...(query.device_id ? { device_id: query.device_id } : {}),
    }).then((summary) => {
      if (!cancelled) setResult({ key: queryKey, summary });
    }).catch(() => {
      if (!cancelled) setErrorKey(queryKey);
    });
    return () => { cancelled = true; };
  }, [query.period, query.year, query.device_id, queryKey, revision, libraryRevision]);

  useFocusEffect(useCallback(() => {
    refresh();
    const timer = setInterval(refresh, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]));

  return {
    // The previous result stays visible while another period or device loads, so the screen does not flash.
    summary: result?.summary ?? null,
    failed: errorKey === queryKey,
    loading: result?.key !== queryKey && errorKey !== queryKey,
    refresh,
  };
}
