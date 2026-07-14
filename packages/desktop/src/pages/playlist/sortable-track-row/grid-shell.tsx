import type { ReactNode } from 'react';
import {
  playlistTrackCheckboxCellStyle,
  playlistTrackIndexCellStyle,
  playlistTrackTimeCellStyle,
} from './cell-styles';
import { getPlaylistTrackGridStyle } from './layout';

type PlaylistTrackGridShellProps = {
  artistSlot?: ReactNode;
  checkboxSlot: ReactNode;
  coverSlot: ReactNode;
  downloadedSlot?: ReactNode;
  dragSlot?: ReactNode;
  indexSlot: ReactNode;
  showArtist: boolean;
  showDownloaded: boolean;
  showDrag: boolean;
  timeSlot: ReactNode;
  titleSlot: ReactNode;
};

export function PlaylistTrackGridShell({
  artistSlot,
  checkboxSlot,
  coverSlot,
  downloadedSlot,
  dragSlot,
  indexSlot,
  showArtist,
  showDownloaded,
  showDrag,
  timeSlot,
  titleSlot,
}: PlaylistTrackGridShellProps) {
  return (
    <>
      {showDrag && <div>{dragSlot}</div>}
      <div style={playlistTrackIndexCellStyle}>{indexSlot}</div>
      <div>{coverSlot}</div>
      <div className="min-w-0">{titleSlot}</div>
      {showArtist && <div className="min-w-0">{artistSlot}</div>}
      {showDownloaded && <div className="min-w-0">{downloadedSlot}</div>}
      <div style={playlistTrackTimeCellStyle}>{timeSlot}</div>
      <div style={playlistTrackCheckboxCellStyle}>{checkboxSlot}</div>
    </>
  );
}

export { getPlaylistTrackGridStyle };
