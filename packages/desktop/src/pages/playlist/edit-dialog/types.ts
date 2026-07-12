import type { Playlist } from '@ton/core';

export type EditPlaylistDialogProps = {
  playlist: Playlist;
  onClose: () => void;
  t: (key: string) => string;
};
