import { useCallback, useEffect, useState } from 'react';
import type { ListeningProfileSummary, ProfileQuery } from '@ton/core';
import { subscribeListeningProfile } from '../../audio/playback-service/listening';
import { useLibraryStore } from '../../stores/library-store';

export function useProfileData(query: ProfileQuery) {
  const queryKey = JSON.stringify([query.period, query.year, query.device_id]);
  const [result, setResult] = useState<{ key: string; summary: ListeningProfileSummary } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setErrorKey(null);
    // Background refreshes (playback, library, focus) keep the shown result; only a changed filter is "loading".
    window.api.invoke('profile:get-summary', {
      period: query.period,
      ...(query.year === undefined ? {} : { year: query.year }),
      ...(query.device_id ? { device_id: query.device_id } : {}),
    }).then((summary) => {
      if (!cancelled) setResult({ key: queryKey, summary });
    }).catch(() => {
      if (!cancelled) setErrorKey(queryKey);
    });
    return () => { cancelled = true; };
  }, [query.period, query.year, query.device_id, queryKey, revision]);

  useEffect(() => {
    let timer: number | null = null;
    const schedule = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 150);
    };
    const unsubscribeListening = subscribeListeningProfile(schedule);
    const unsubscribeLibrary = useLibraryStore.subscribe((state, previous) => {
      if (state.tracks !== previous.tracks) schedule();
    });
    window.addEventListener('focus', schedule);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      unsubscribeListening();
      unsubscribeLibrary();
      window.removeEventListener('focus', schedule);
    };
  }, [refresh]);

  return {
    // Keep showing the previous result while a new period/device loads; swapping to a
    // loading screen on every filter click makes the page flash.
    summary: result?.summary ?? null,
    devices: result?.summary.analytics.devices ?? [],
    years: result?.summary.analytics.available_years ?? [],
    failed: errorKey === queryKey,
    loading: result?.key !== queryKey && errorKey !== queryKey,
    refresh,
  };
}
