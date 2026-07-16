import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { usePlaylistActions } from './use-playlist-actions';
import { usePlaylistDnd } from './use-playlist-dnd';
import { usePlaylistPageData } from './use-playlist-page-data';
import { usePlaylistViewState } from './use-playlist-view-state';

export function usePlaylistPageModel() {
  const { i18n, t } = useTranslation('pages/playlist');
  const navigate = useNavigate();
  const pageData = usePlaylistPageData();
  const viewState = usePlaylistViewState(pageData.playlistId, pageData.tracks);
  const actions = usePlaylistActions({
    clearSelection: viewState.clearSelection,
    displayTracksRef: viewState.displayTracksRef,
    navigate,
    playlist: pageData.playlist,
    selectedIds: viewState.selectedIds,
    t,
  });
  const dnd = usePlaylistDnd(pageData.playlist?.id, pageData.tracks);

  return {
    actions,
    dnd,
    locale: i18n.resolvedLanguage || i18n.language,
    pageData,
    t,
    viewState,
  };
}
