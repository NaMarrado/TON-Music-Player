import type { ReactNode } from 'react';
import { libraryTrackCheckboxCellStyle, libraryTrackTimeCellStyle } from './cell-styles';

type LibraryTrackGridShellProps = {
  artistSlot?: ReactNode;
  checkboxSlot: ReactNode;
  coverSlot: ReactNode;
  downloadedSlot?: ReactNode;
  playlistSlot?: ReactNode;
  starSlot?: ReactNode;
  timeSlot: ReactNode;
  titleSlot: ReactNode;
};

export function LibraryTrackGridShell({
  artistSlot,
  checkboxSlot,
  coverSlot,
  downloadedSlot,
  playlistSlot,
  starSlot,
  timeSlot,
  titleSlot,
}: LibraryTrackGridShellProps) {
  return (
    <>
      <div className="track-cover-cell">{coverSlot}</div>
      <div className="min-w-0">{titleSlot}</div>
      <div className="track-artist-cell min-w-0">{artistSlot}</div>
      <div className="track-playlist-cell min-w-0">{playlistSlot}</div>
      <div className="track-downloaded-cell min-w-0">{downloadedSlot}</div>
      <div className="track-time-cell" style={libraryTrackTimeCellStyle}>{timeSlot}</div>
      <div style={libraryTrackCheckboxCellStyle}>{checkboxSlot}</div>
      <div style={libraryTrackCheckboxCellStyle}>{starSlot}</div>
    </>
  );
}
