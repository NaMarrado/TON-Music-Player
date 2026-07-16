# Mobile Performance And Sync Audit

Branch: `dev`

Baseline: `bd8f46a`

## Safety Rules

- [x] Work only on `dev`; do not modify `main`.
- [x] Do not use real R2 credentials or contact the user bucket.
- [ ] Run cloud integration tests only against isolated fixtures or a local mock.
- [ ] Keep exactly one TON desktop instance and one current simulator app during manual testing.
- [ ] Record every manual scenario and its result below.

## Cloud Sync

- [ ] Apply playlist shells and metadata before downloading audio.
- [ ] Populate playlist membership incrementally in source order.
- [ ] Preserve canonical remote `added_at` and deterministic Library order.
- [ ] Batch SQLite work and yield between batches so playback remains responsive.
- [ ] Throttle progress updates and avoid full Library/playlist reloads per track.
- [ ] Add `Sync audio over mobile data`, default off; metadata still syncs online.
- [ ] Replace `up/down` with localized `uploaded/downloaded` wording.
- [ ] Replace raw numeric boolean-like statuses with human-readable labels.

## Playback And Shuffle

- [ ] Queue stores a complete logical source descriptor independent of rendered rows.
- [ ] Pre-enabled shuffle is applied when a new queue starts.
- [ ] Shuffle covers the complete Library/playlist/filter source, not visible cells.
- [ ] Newly synced source tracks reconcile into the upcoming queue safely.
- [ ] Disabling shuffle restores exact original order.
- [ ] Queue replacement prepares only the selected iOS track once.
- [ ] Track switching is fast and does not click or pop.
- [ ] Play/pause state ignores stale native events.
- [ ] Seek does not visually snap back while native seek completes.
- [ ] Volume percentage updates continuously while dragging.
- [ ] Downward swipe from the upper player area closes full-screen player.

## Large Libraries And Settings

- [ ] FlashList rows use stable render inputs and tuned fixed-size virtualization.
- [ ] Add draggable mobile fast scrollbar to Library and playlists.
- [ ] Add pull-to-refresh to mobile Library and Settings.
- [ ] Dismiss mobile search keyboard when list scrolling starts.
- [ ] Add persisted mobile playlist sorting and limit reorder to original order.
- [ ] Remove duplicate top safe-area spacing from mobile playlist.
- [ ] Improve desktop track-list scrollbar contrast and top alignment.
- [ ] Mask Account ID, Access Key ID, and Secret on desktop and mobile.
- [ ] Compact Settings controls while retaining at least a 44 pt hit target.
- [ ] Remove inactive Download Quality glass highlight.
- [ ] Render EQ, frequency, and loudness controls inactive when unsupported/disabled.

## R2 Cleanup

- [ ] Use one cleanup confirmation for cloud-only tracks and playlist updates.
- [ ] Show concrete affected tracks and playlists in a virtualized preview.
- [ ] Clear only stale failure rows associated with removed or repaired objects.
- [ ] Preserve ETag and local-Library fingerprint validation.

## Automated Verification

- [ ] Locale validation.
- [ ] Core, desktop, and mobile TypeScript checks.
- [ ] Playback and shuffle tests, including 1,600-track sources.
- [ ] Cloud fixture tests with 1,600 and 10,000 tracks.
- [ ] Cleanup fixture, conflict, cancel, and partial-delete tests.
- [ ] Desktop production build.
- [ ] Android debug and release builds.
- [ ] iOS simulator build.

## Manual Verification Log

| Date | Platform | Scenario | Result | Evidence / Notes |
| --- | --- | --- | --- | --- |

