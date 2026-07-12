import { useCallback, useEffect, useRef, useState } from 'react';

export type DesktopExportSummary = {
  exportableTrackCount: number;
  exportablePlaylistCount: number;
};

const EMPTY_EXPORT_SUMMARY: DesktopExportSummary = {
  exportableTrackCount: 0,
  exportablePlaylistCount: 0,
};

export function hasExportableContent(summary: DesktopExportSummary): boolean {
  return summary.exportableTrackCount > 0 || summary.exportablePlaylistCount > 0;
}

export function useExportSummary(refreshToken: string) {
  const [summary, setSummary] = useState<DesktopExportSummary>(EMPTY_EXPORT_SUMMARY);
  const requestIdRef = useRef(0);

  const refreshSummary = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const nextSummary = await window.api.invoke('export:summary') as DesktopExportSummary;
      if (requestIdRef.current === requestId) {
        setSummary(nextSummary);
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setSummary(EMPTY_EXPORT_SUMMARY);
      }
    }
  }, []);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary, refreshToken]);

  return {
    canExport: hasExportableContent(summary),
    refreshSummary,
    summary,
  };
}
