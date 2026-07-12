import {
  runDownloadCancelAllCheck,
  runDeleteChecks,
  runExportImportRoundTrip,
  runPlaylistLibraryChecks,
  runPlaylistDownloadImportChecks,
  runScanAndDuplicateChecks,
} from './scenario-steps';
import { runLegacyDatabaseMigrationCheck } from './database-migration-check';
import { prepareScenarioPaths } from './scenario-paths';
import type { ScenarioSmokeSummary, RunHandlerSmokeScenarioArgs } from './scenario-types';

export async function runHandlerSmokeScenario({
  invoke,
  progressEvents,
  rootDir,
  registeredChannels,
}: RunHandlerSmokeScenarioArgs): Promise<ScenarioSmokeSummary> {
  runLegacyDatabaseMigrationCheck(rootDir);
  const paths = prepareScenarioPaths(rootDir);
  const scanResults = await runScanAndDuplicateChecks(invoke, progressEvents, paths);
  const playlistResults = await runPlaylistLibraryChecks(invoke, rootDir, paths.playlistImportDir);
  const exportImportResults = await runExportImportRoundTrip(
    invoke,
    progressEvents,
    paths,
    playlistResults.importedPlaylistId,
    playlistResults.importedPlaylistName,
  );
  const deleteResults = await runDeleteChecks(invoke);
  await runPlaylistDownloadImportChecks(rootDir, paths.trackOne);
  await runDownloadCancelAllCheck(invoke);

  return {
    registeredChannels,
    ...scanResults,
    ...playlistResults,
    ...exportImportResults,
    ...deleteResults,
  };
}
