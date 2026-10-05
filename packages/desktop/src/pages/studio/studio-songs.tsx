import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_PROTOCOL, formatTime, getFilteredTracks, type Playlist, type Track } from '@ton/core';
import { VirtualizedList } from '../../components/player/virtualized-list';
import { NoCoverArt } from '../../components/ui/no-cover-art';
import { loadTracks, useLibraryStore } from '../../stores/library-store';
import { loadPlaylists, usePlaylistStore } from '../../stores/playlist-store';
import { StudioButton } from './studio-controls';
import { useControlText } from './use-control-text';
import { LibraryIcon, PlaylistIcon, SearchIcon } from './studio-icons';
import { StudioSearch } from './studio-search';
import { addLibraryTrackToStudio } from './studio-store';

export type SongSource = 'library' | 'playlists' | 'search';
const ROW = 56;

function Cover({ path }: { path: string | null }) {
  const url = path ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(path)}` : null;
  return <div className="studio-pick-cover">{url ? <img src={url} alt="" loading="lazy" /> : <NoCoverArt iconSize={14} />}</div>;
}

function TrackList({ rows }: { rows: Track[] }) {
  const { t } = useTranslation('pages/studio');
  return (
    <VirtualizedList
      className="studio-pick-list"
      items={rows}
      estimateSize={ROW}
      keyExtractor={(track: Track) => track.id}
      renderItem={(track: Track) => (
        <button type="button" className="studio-pick-row" onClick={() => void addLibraryTrackToStudio(track)} title={t('addToStudio')}>
          <Cover path={track.cover_art_path} />
          <span className="studio-pick-text"><strong>{track.title || '—'}</strong><small>{track.artist}</small></span>
          <span className="studio-pick-meta">{track.duration_ms ? formatTime(track.duration_ms) : ''}</span>
        </button>
      )}
    />
  );
}

function LibraryList({ query }: { query: string }) {
  const tracks = useLibraryStore((state) => state.tracks);
  const hasLoaded = useLibraryStore((state) => state.hasLoaded);
  useEffect(() => { if (!hasLoaded) void loadTracks(); }, [hasLoaded]);
  const rows = useMemo(() => getFilteredTracks(tracks, query, 'title', 'asc'), [tracks, query]);
  return <TrackList rows={rows} />;
}

function PlaylistList({ query }: { query: string }) {
  const playlists = usePlaylistStore((state) => state.playlists);
  const hasLoaded = usePlaylistStore((state) => state.hasLoaded);
  const [open, setOpen] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  useEffect(() => { if (!hasLoaded) void loadPlaylists(); }, [hasLoaded]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void window.api.invoke('playlist:get', open.id).then((result) => { if (!cancelled) setTracks(result?.tracks ?? []); });
    return () => { cancelled = true; };
  }, [open]);
  const rows = useMemo(() => (query ? getFilteredTracks(tracks, query, 'title', 'asc') : tracks), [tracks, query]);
  if (open) {
    return (
      <>
        <button type="button" className="studio-pick-back" onClick={() => setOpen(null)}>‹ {open.name}</button>
        <TrackList rows={rows} />
      </>
    );
  }
  return (
    <div className="studio-pick-list">
      {playlists.map((playlist) => (
        <button key={playlist.id} type="button" className="studio-pick-row" onClick={() => setOpen(playlist)}>
          <Cover path={playlist.cover_path} />
          <span className="studio-pick-text"><strong>{playlist.name}</strong></span>
        </button>
      ))}
    </div>
  );
}

function FilterBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { name, text } = useControlText('songs-filter');
  return <input className="studio-pick-input" type="text" data-control="songs-filter" data-hint={name} data-hint-text={text} aria-label={name} placeholder={name} value={value} onChange={(event) => onChange(event.target.value)} />;
}

export function StudioSongs({ source, onSource }: { source: SongSource; onSource: (source: SongSource) => void }) {
  const [text, setText] = useState('');
  const query = useDeferredValue(text);
  return (
    <div className="studio-songs">
      <div className="studio-segment studio-songs-sources" role="group">
        <StudioButton control="songs-library" onClick={() => onSource('library')} active={source === 'library'} label><LibraryIcon /></StudioButton>
        <StudioButton control="songs-playlists" onClick={() => onSource('playlists')} active={source === 'playlists'} label><PlaylistIcon /></StudioButton>
        <StudioButton control="songs-search" onClick={() => onSource('search')} active={source === 'search'} label><SearchIcon /></StudioButton>
      </div>
      {source !== 'search' && <FilterBox value={text} onChange={setText} />}
      <div className="studio-songs-body">
        {source === 'library' && <LibraryList query={query} />}
        {source === 'playlists' && <PlaylistList query={query} />}
        {source === 'search' && <StudioSearch />}
      </div>
    </div>
  );
}
