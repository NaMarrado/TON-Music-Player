import type { ReactNode } from 'react';
import { libraryTrackCheckboxCellStyle, libraryTrackTimeCellStyle } from './cell-styles';
import { getLibraryTrackGridStyle } from './layout';

type LibraryTrackGridShellProps = {
  artistSlot?: ReactNode;
  checkboxSlot: ReactNode;
  coverSlot: ReactNode;
  downloadedSlot?: ReactNode;
  playlistSlot?: ReactNode;
  showArtist: boolean;
  showDownloaded: boolean;
  showPlaylist: boolean;
  timeSlot: ReactNode;
  titleSlot: ReactNode;
};

export function LibraryTrackGridShell({
  artistSlot,
  checkboxSlot,
  coverSlot,
  downloadedSlot,
  playlistSlot,
  showArtist,
  showDownloaded,
  showPlaylist,
  timeSlot,
  titleSlot,
}: LibraryTrackGridShellProps) {
  return (
    <>
      <div>{coverSlot}</div>
      <div className="min-w-0">{titleSlot}</div>
      {showArtist && <div className="min-w-0">{artistSlot}</div>}
      {showPlaylist && <div className="min-w-0">{playlistSlot}</div>}
      {showDownloaded && <div className="min-w-0">{downloadedSlot}</div>}
      <div style={libraryTrackTimeCellStyle}>{timeSlot}</div>
      <div style={libraryTrackCheckboxCellStyle}>{checkboxSlot}</div>
    </>
  );
}

export { getLibraryTrackGridStyle };
