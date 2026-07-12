import { registerPlaylistDialogHandlers } from './dialogs';
import { registerPlaylistImportExportHandlers } from './import-export';
import { registerPlaylistMutationHandlers } from './mutations';
import { registerPlaylistQueryHandlers } from './queries';

export function registerPlaylistHandlers(): void {
  registerPlaylistQueryHandlers();
  registerPlaylistMutationHandlers();
  registerPlaylistDialogHandlers();
  registerPlaylistImportExportHandlers();
}
