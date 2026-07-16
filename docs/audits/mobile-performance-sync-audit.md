# Mobile Performance And Sync Audit

Branch: `dev`

Baseline: `bd8f46a`

## Safety Rules

- [x] Work only on `dev`; do not modify `main`.
- [x] Do not use real R2 credentials or contact the user bucket.
- [x] Run cloud integration tests only against isolated fixtures or a local mock.
- [ ] Keep exactly one TON desktop instance and one current simulator app during manual testing.
- [ ] Record every manual scenario and its result below.

## Cloud Sync

- [x] Apply playlist shells and metadata before downloading audio.
- [x] Populate playlist membership incrementally in source order.
- [x] Preserve canonical remote `added_at` and deterministic Library order.
- [x] Batch SQLite work and yield between batches so playback remains responsive.
- [x] Throttle progress updates and avoid full Library/playlist reloads per track.
- [x] Add `Sync audio over mobile data`, default off; metadata still syncs online.
- [x] Replace `up/down` with localized `uploaded/downloaded` wording.
- [x] Replace raw numeric boolean-like statuses with human-readable labels and explicit track counts.

## Playback And Shuffle

- [x] Queue stores a complete logical source descriptor independent of rendered rows.
- [x] Pre-enabled shuffle is applied when a new queue starts.
- [x] Shuffle covers the complete Library/playlist/filter source, not visible cells.
- [x] Newly synced source tracks reconcile into the upcoming queue safely.
- [x] Disabling shuffle restores exact original order.
- [x] Queue replacement prepares only the selected iOS track once.
- [ ] Track switching is fast and does not click or pop.
- [x] Play/pause state ignores stale native events.
- [x] Seek does not visually snap back while native seek completes.
- [x] Volume percentage updates continuously while dragging.
- [x] Downward swipe from the upper player area closes full-screen player.

## Large Libraries And Settings

- [x] FlashList rows use stable render inputs and tuned fixed-size virtualization.
- [x] Add draggable mobile fast scrollbar to Library and playlists.
- [x] Add pull-to-refresh to mobile Library and Settings.
- [x] Dismiss mobile search keyboard when list scrolling starts.
- [x] Add persisted mobile playlist sorting and limit reorder to original order.
- [x] Remove duplicate top safe-area spacing from mobile playlist.
- [x] Improve desktop track-list scrollbar contrast and top alignment.
- [x] Mask Account ID, Access Key ID, and Secret on desktop and mobile.
- [x] Compact Settings controls while retaining at least a 44 pt hit target.
- [x] Remove inactive Download Quality glass highlight.
- [x] Render EQ, frequency, and loudness controls inactive when unsupported/disabled.

## R2 Cleanup

- [x] Use one cleanup confirmation for cloud-only tracks and playlist updates.
- [x] Show concrete affected tracks and playlists in a virtualized preview.
- [x] Clear only stale failure rows associated with removed or repaired objects.
- [x] Preserve ETag and local-Library fingerprint validation.

## Automated Verification

- [x] Locale validation.
- [x] Core, desktop, and mobile TypeScript checks.
- [x] Playback and shuffle tests, including 1,600-track sources.
- [x] Cloud fixture tests with 1,600 and 10,000 tracks.
- [x] Cleanup fixture, conflict, cancel, and partial-delete tests.
- [ ] Desktop production build.
- [ ] Android debug and release builds.
- [ ] iOS simulator build.

## Manual Verification Log

| Date | Platform | Scenario | Result | Evidence / Notes |
| --- | --- | --- | --- | --- |

## Automated Verification Log

- 2026-07-16: `pnpm locales:validate` passed for all locale sets.
- 2026-07-16: core, desktop, and mobile TypeScript checks passed.
- 2026-07-16: isolated cleanup and large-library harness passed 10/10 scenarios, including 1,600-track pre-enabled/runtime shuffle, exact order restore, 10,000-track filtering, playlist-first batching, and concrete cleanup preview rows. No network or R2 credentials were used.
- 2026-07-16: shared cleanup executor passed stale CAS, cancel before CAS, cancel after CAS, and partial object-delete scenarios against a local fake adapter. No network or R2 credentials were used.
- 2026-07-16: playback event audit fixed the single-track native queue ID mismatch and made Android state events validate a native snapshot against the current queue generation.
- 2026-07-16: local S3-compatible R2 harness served a five-track/four-playlist fixture; the real desktop R2 client completed manifest GET with ETag, connection-test PUT, and object listing through the explicit localhost-only endpoint override.
