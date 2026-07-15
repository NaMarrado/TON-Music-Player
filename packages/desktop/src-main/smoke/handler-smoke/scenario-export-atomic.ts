import fs from 'fs';
import path from 'path';
import { runAtomicExport } from '../../handlers/export-import-handler/atomic-export';
import { assert } from './assert';
import type { ScenarioPaths } from './scenario-types';

export async function verifyAtomicExportRecovery(paths: ScenarioPaths): Promise<void> {
  const atomicDestination = path.join(paths.exportDir, 'atomic-existing.ton');
  fs.writeFileSync(atomicDestination, 'existing-export');
  let atomicFailureObserved = false;
  try {
    await runAtomicExport(atomicDestination, 'archive', async (stagingPath) => {
      fs.writeFileSync(stagingPath, 'partial-export');
      throw new Error('fixture export failure');
    });
  } catch {
    atomicFailureObserved = true;
  }
  assert(atomicFailureObserved, 'Expected atomic export fixture to fail');
  assert(
    fs.readFileSync(atomicDestination, 'utf-8') === 'existing-export',
    'Expected a failed export to preserve the previous destination',
  );
  assert(
    !fs.readdirSync(paths.exportDir).some((entry) => entry.includes('.partial-')),
    'Expected a failed export to remove its staging output',
  );

  const atomicFinalizeDestination = path.join(paths.exportDir, 'atomic-finalize-existing.ton');
  fs.writeFileSync(atomicFinalizeDestination, 'existing-finalized-export');
  let atomicFinalizeFailureObserved = false;
  try {
    await runAtomicExport(atomicFinalizeDestination, 'archive', async (stagingPath) => {
      fs.writeFileSync(stagingPath, 'incomplete-replacement');
      fs.rmSync(stagingPath);
      return null;
    });
  } catch {
    atomicFinalizeFailureObserved = true;
  }
  assert(atomicFinalizeFailureObserved, 'Expected atomic finalization fixture to fail');
  assert(
    fs.readFileSync(atomicFinalizeDestination, 'utf-8') === 'existing-finalized-export',
    'Expected a final rename failure to restore the previous destination',
  );
  assert(
    !fs.readdirSync(paths.exportDir).some((entry) => (
      entry.includes('.partial-') || entry.includes('.backup-')
    )),
    'Expected failed atomic finalization to clean its sibling files',
  );
}
