import { useMemo } from 'react';
import { useExportSummary } from '../../../hooks/use-export-summary';
import { useLibraryStore } from '../../../stores/library-store';
import { usePlaylistStore } from '../../../stores/playlist-store';

export function useLibraryPageData() {
  const tracks = useLibraryStore((state) => state.tracks);
  const sortBy = useLibraryStore((state) => state.sortBy);
  const sortOrder = useLibraryStore((state) => state.sortOrder);
  const filterQuery = useLibraryStore((state) => state.filterQuery);
  const playlists = usePlaylistStore((state) => state.playlists);
  const { canExport, refreshSummary, summary } = useExportSummary(`${tracks.length}:${playlists.length}`);

  const manualPlaylists = useMemo(
    () => playlists.filter((playlist) => !playlist.is_smart),
    [playlists],
  );

  return {
    canExport,
    exportablePlaylistCount: summary.exportablePlaylistCount,
    exportableTrackCount: summary.exportableTrackCount,
    filterQuery,
    manualPlaylists,
    playlistCount: playlists.length,
    refreshExportSummary: refreshSummary,
    sortBy,
    sortOrder,
    tracks,
  };
}
