# Mobile Performance And Sync Audit

Branch: `dev`

Baseline: `bd8f46a`

## Safety Rules

- [x] Work only on `dev`; do not modify `main`.
- [x] Do not use real R2 credentials or contact the user bucket.
- [x] Run cloud integration tests only against isolated fixtures or a local mock.
- [x] Keep exactly one TON desktop instance and one current simulator app during manual testing.
- [x] Record every manual scenario and its result below.

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
- [x] Desktop production build.
- [x] Android debug and release builds.
- [x] iOS simulator build.

## Manual Verification Log

| Date | Platform | Scenario | Result | Evidence / Notes |
| --- | --- | --- | --- | --- |
| 2026-07-16 | iOS simulator Release | Clean install and isolated 1,600-track cloud sync | PASS | Removed both historical bundle IDs, installed only `cz.ton.player` v1.0.34, and connected only to the localhost harness. All 4 playlist shells existed while audio was still downloading. Library, artist filtering, and playlist navigation remained responsive while counts increased. Final DB state: 1,597 tracks, 1,698 memberships, and 3 intentionally injected download failures; the failures did not stop the remaining sync. |
| 2026-07-16 | iOS simulator Release | Playlist sorting persistence | PASS | Changed Fixture Playlist 1 to Title ascending, left the screen, reopened it, and confirmed the sort sheet still showed `Title ↑`. |
| 2026-07-16 | iOS simulator Release | Runtime shuffle on complete playlist queue | PASS | Enabled shuffle with a direct touch and pressed Next; playback moved from Track 00002 to Track 00328 instead of the sequential next item. An earlier AX-index activation toggled twice and was discarded as a Simulator accessibility automation artifact. |
| 2026-07-16 | iOS simulator Release | Pre-enabled shuffle across the complete 1,599-track Library | PASS | Enabled shuffle before Play All. Next moved from `TON Audit Long A` to random `Fixture Track 01122`; disabling shuffle and pressing Next restored the exact source successor `Fixture Track 01121`. |
| 2026-07-16 | iOS simulator Release | Native-authoritative play/pause state | PASS | Paused at 0:09 and position remained exactly 0:09 after 1.8 seconds; Resume advanced to 0:10. No stale native event flipped the button back. |
| 2026-07-16 | iOS simulator Release | Fast scrollbar over 1,599 Library tracks | PASS | Direct interaction with the right-side fast-scroll track jumped from the newest rows near 01600 to rows 00020–00001 without blank recycled rows. |
| 2026-07-16 | iOS simulator Release | Slow downward swipe from upper player content | CODE/BUILD PASS; MANUAL BLOCKED | Replaced the nested gesture with a root capture handler restricted to downward motion beginning in the upper 58%. TypeScript and Release builds pass. Computer Use `drag` is emitted as a destination tap in this Simulator and cannot provide a real continuous RN touch, so this gesture cannot be honestly marked as manually verified with the available tool. |
| 2026-07-16 | macOS isolated production renderer | Playlist-first 1,600-track sync with injected failures | PASS | Used only `127.0.0.1:9462` and fake credentials in a fresh profile. All 4 playlist shells appeared at 28/1600. Memberships grew during transfer (`666 tracks / 741 memberships`, then `1,096 / 1,194`) rather than appearing only at completion. Final state was 1,597 tracks, 4 playlists, 1,698 memberships, and 3 intentional failures. |
| 2026-07-16 | macOS isolated production renderer | One corrupt R2 object must not stop sync | PASS | Before the fix, the first fixture 503 stopped the desktop at 193 tracks with `Retry scheduled`. After the fix, all remaining objects completed, `last_error` stayed NULL, `needs_full_reconcile=0`, and the 3 failed hashes remained explicitly pending for manual retry. A later auto poll preserved the same counts and did not redownload them. |
| 2026-07-16 | macOS isolated production renderer | Targeted Library and playlist updates during sync | PASS | Batch events update 32 track summaries at a time and only the currently open playlist. The Library/playlist DB and visible playlist advanced while transfer was active; no per-track full-Library reload is used. Fixture Playlist 1 ended with 400 ordered tracks. |
| 2026-07-16 | macOS isolated production renderer | Stable viewport and filtering with 10,000 tracks | PASS | A fresh localhost-only profile kept rows `Track 09955` through `Track 09921` fixed in the viewport while the remaining sync completed. The only visible counter change was the Library total. Filtering by `Fixture Artist 042` returned exactly 100 rows without blank recycled cells, and page navigation remained responsive during transfer. Final DB state: 10,000 tracks, 4 playlists, 1,700 memberships, 0 failures, and no pending reconcile. |
| 2026-07-16 | iOS simulator Release | Final clean-install safety smoke | PASS | Confirmed exactly one TON bundle (`cz.ton.player` v1.0.34 build 1000034), 0 tracks, 0 playlists, and an empty `cloud_r2_config`. The current Release build launched without a red screen or TON fatal log. No real or mock R2 credentials remained in the clean profile. |

## Automated Verification Log

- 2026-07-16: `pnpm locales:validate` passed for all locale sets.
- 2026-07-16: core, desktop, and mobile TypeScript checks passed.
- 2026-07-16: isolated cleanup and large-library harness passed 15/15 scenarios, including 1,600-track pre-enabled/runtime shuffle, exact order restore, 10,000-track filtering, transfer order matching Library order, playlist-first batching, and concrete cleanup preview rows. No external network or R2 credentials were used.
- 2026-07-16: shared cleanup executor passed stale CAS, cancel before CAS, cancel after CAS, and partial object-delete scenarios against a local fake adapter. No network or R2 credentials were used.
- 2026-07-16: playback event audit fixed the single-track native queue ID mismatch and made Android state events validate a native snapshot against the current queue generation.
- 2026-07-16: local S3-compatible R2 harness served a five-track/four-playlist fixture; the real desktop R2 client completed manifest GET with ETag, connection-test PUT, and object listing through the explicit localhost-only endpoint override.
- 2026-07-16: desktop production Vite build completed successfully.
- 2026-07-16: clean Android `assembleDebug assembleRelease` completed successfully in 5m15s. Reported deprecation/unchecked warnings came from Expo and React Native dependencies; no TON compile or lint failure was reported.
- 2026-07-16: clean iOS simulator Release build completed successfully with the localhost-only R2 endpoint override. Remaining warnings came from React Native, Expo, Pods, and always-run dependency scripts; no TON compile error was reported.
- 2026-07-16: desktop partial-sync regression fixed and re-run twice from clean profiles. Track-level failures are revision-scoped, manual sync retries them, new manifest revisions invalidate them, and cleanup previews can list/clear only relevant failure rows.
- 2026-07-16: post-fix locale validation, core/desktop/mobile TypeScript checks, cleanup tests, 1,600/10,000 large-library tests, and mobile failure-resilience tests passed. The SQLite migration test was run under Electron's matching native ABI.
- 2026-07-16: final playlist batch merge now replaces rows by source position rather than transient membership ID, preventing duplicate visible positions during force sync. Locale validation, full TypeScript build, mobile TypeScript, 15 cleanup/large-library tests, 3 mobile resilience tests, and the desktop production build all passed after this change.
