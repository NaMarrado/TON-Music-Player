import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import {
  STUDIO_SAMPLE_RATE, buildRenderArgs, encodeWavFloat32, generateReverbImpulse, requiredImpulseKeys, reverbImpulseSpec, sanitizeFilename,
} from '@ton/core';
import type { StudioExportResult } from '../../../src/shared/studio-ipc';
import { importAudioFilesIntoLibrary } from '../../handlers/library-handler/import-files';
import { getFfmpegPathAsync } from '../binary-manager';
import { ensureStudioTempDir } from './paths';
import { assertAssetsReadable, parseStudioProject } from './validate';

export interface StudioExportInput {
  project: unknown;
  title: string;
  artist: string;
}

/** Renders the project with ffmpeg into a staging file and registers it as a Library track. */
export async function exportStudioProject(
  request: StudioExportInput,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<StudioExportResult> {
  const project = parseStudioProject(request.project);
  await assertAssetsReadable(project);
  const ffmpeg = await getFfmpegPathAsync();
  if (!ffmpeg) throw new Error('ffmpeg is not available');

  const title = (request.title || 'Studio mix').slice(0, 200);
  const artist = (request.artist || 'Studio').slice(0, 200);
  const directory = await ensureStudioTempDir();
  const job = path.join(directory, `export-${randomUUID().slice(0, 12)}`);
  await fs.promises.mkdir(job, { recursive: true });

  try {
    const impulsePaths: Record<string, string> = {};
    for (const key of requiredImpulseKeys(project)) {
      const spec = reverbImpulseSpec(key);
      impulsePaths[key] = path.join(job, `${key}.wav`);
      await fs.promises.writeFile(impulsePaths[key], encodeWavFloat32(generateReverbImpulse(spec.size, spec.damping, STUDIO_SAMPLE_RATE), STUDIO_SAMPLE_RATE));
    }
    const staged = path.join(job, `${sanitizeFilename(title) || 'Studio mix'}.m4a`);
    const scriptPath = path.join(job, 'graph.txt');
    const plan = buildRenderArgs(project, {
      output: { path: staged, format: 'm4a' },
      impulsePaths,
      filterScriptPath: scriptPath,
      metadata: { title, artist },
    });
    if (!plan) throw new Error('Nothing to export');
    await fs.promises.writeFile(scriptPath, plan.filterGraph, 'utf8');

    await runFfmpeg(ffmpeg, plan.args, plan.durationSec, signal, onProgress);
    const stats = await fs.promises.stat(staged).catch(() => null);
    if (!stats || stats.size < 1000) throw new Error('The render produced no audio');

    const { trackIds } = await importAudioFilesIntoLibrary([staged]);
    const trackId = trackIds[0];
    if (!trackId) throw new Error('The mix could not be added to the Library');
    onProgress(1);
    return { trackId, filePath: staged, durationSec: plan.durationSec };
  } finally {
    await fs.promises.rm(job, { recursive: true, force: true }).catch(() => {});
  }
}

async function runFfmpeg(ffmpeg: string, args: string[], durationSec: number, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<void> {
  const subprocess = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const abort = () => subprocess.kill('SIGTERM');
  signal.addEventListener('abort', abort, { once: true });
  const tail: string[] = [];
  const stdout = createInterface({ input: subprocess.stdout });
  const stderr = createInterface({ input: subprocess.stderr });
  stdout.on('line', (line) => {
    const match = /^out_time_(?:us|ms)=(\d+)/.exec(line);
    if (match && durationSec > 0) onProgress(Math.min(0.99, Number(match[1]) / 1e6 / durationSec));
  });
  stderr.on('line', (line) => {
    tail.push(line);
    if (tail.length > 12) tail.shift();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      subprocess.on('error', reject);
      subprocess.on('close', (code) => {
        if (signal.aborted) reject(new Error('Cancelled'));
        else if (code === 0) resolve();
        else reject(new Error(`ffmpeg failed (${code}): ${tail.slice(-4).join(' | ')}`));
      });
    });
  } finally {
    signal.removeEventListener('abort', abort);
    stdout.close();
    stderr.close();
  }
}
