import type { ReactNode } from 'react';
import {
  playlistTrackCheckboxCellStyle,
  playlistTrackIndexCellStyle,
  playlistTrackTimeCellStyle,
} from './cell-styles';

type PlaylistTrackGridShellProps = {
  artistSlot?: ReactNode;
  checkboxSlot: ReactNode;
  coverSlot: ReactNode;
  downloadedSlot?: ReactNode;
  dragSlot?: ReactNode;
  indexSlot: ReactNode;
  starSlot?: ReactNode;
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
  starSlot,
  showDrag,
  timeSlot,
  titleSlot,
}: PlaylistTrackGridShellProps) {
  return (
    <>
      {showDrag && <div>{dragSlot}</div>}
      <div className="track-index-cell" style={playlistTrackIndexCellStyle}>{indexSlot}</div>
      <div className="track-cover-cell">{coverSlot}</div>
      <div className="min-w-0">{titleSlot}</div>
      <div className="track-artist-cell min-w-0">{artistSlot}</div>
      <div className="track-downloaded-cell min-w-0">{downloadedSlot}</div>
      <div className="track-time-cell" style={playlistTrackTimeCellStyle}>{timeSlot}</div>
      <div style={playlistTrackCheckboxCellStyle}>{checkboxSlot}</div>
      <div style={playlistTrackCheckboxCellStyle}>{starSlot}</div>
    </>
  );
}
