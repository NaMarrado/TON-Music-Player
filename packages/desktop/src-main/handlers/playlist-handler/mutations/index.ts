import { registerPlaylistListMutationHandlers } from './playlist-list';
import { registerPlaylistTrackMutationHandlers } from './playlist-tracks';

export function registerPlaylistMutationHandlers(): void {
  registerPlaylistListMutationHandlers();
  registerPlaylistTrackMutationHandlers();
}
