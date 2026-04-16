# FocusPal Project Report

Date: 2026-04-11
Repository version reviewed: 1.0.3

## 1. Executive Summary

FocusPal is currently a Linux-first Electron desktop app for time-blocked task planning, floating task reminders, focus mode, Pomodoro timing, break reminders, account auth, theme customization, word lookup, and Supabase-backed cloud sync. The app has a working monorepo shape, a desktop package, a Linux build pipeline, a Cloudflare R2 release pipeline, and a small shared-utility test suite.

The product is not yet in a fully release-hardened state. The core user-facing flows exist, but the highest-risk areas are untested renderer behavior, large main/widget/settings modules, limited CI coverage, stale ignored documentation, cloud sync conflict risk, and platform-specific behavior. Linux packaging and R2 deployment are the most developed distribution path. Windows packaging exists in config only, but the Windows app is not validated and, per current project direction, should be treated as wrong until fixed on an actual Windows system.

The next engineering phase should be Windows stabilization without regressing Linux. That means doing Windows work behind platform-specific branches/adapters, adding Windows CI separately, keeping Linux release automation isolated, and re-running Linux tests/builds after every shared-code change.

## 2. Repository And Package Status

The repository is a pnpm workspace with one active package:

- Root package: `focuspal-monorepo`, version `1.0.3`.
- Desktop package: `@focuspal/desktop`, version `1.0.3`.
- Package manager: `pnpm@8.15.0`.
- Runtime: Electron desktop app.
- Active application package path: `packages/desktop`.

Important tracked files:

- `.github/workflows/ci.yml` - Linux CI running desktop unit tests.
- `.github/workflows/release-linux.yml` - Linux release workflow for R2/APT/AppImage/deb.
- `packages/desktop/electron-builder.yml` - Electron Builder config for Linux and Windows targets.
- `packages/desktop/src/main/main.js` - main process, windows, tray, auth, store, sync, IPC, platform behavior.
- `packages/desktop/src/main/preload.js` - `window.fp` IPC bridge exposed to renderers.
- `packages/desktop/src/main/supabaseClient.js` - custom Supabase REST/Auth client.
- `packages/desktop/src/main/supabaseConfig.js` - Supabase config loader.
- `packages/desktop/src/renderer/widget.js` - floating widget behavior and task runtime.
- `packages/desktop/src/renderer/settings.js` - settings/task creation UI behavior.
- `packages/desktop/src/renderer/auth.js` - login/register/Google auth UI behavior.
- `packages/desktop/src/common/*.js` - shared date, task, renderer, and theme helpers.
- `scripts/publish-apt.sh` - aptly-based APT repo publishing.
- `scripts/purge-cloudflare-cache.sh` - optional Cloudflare cache purge.

Repository hygiene notes:

- `README.md` is currently empty.
- Markdown files and `/docs` were ignored by `.gitignore`; this report is now explicitly unignored so it can be committed.
- Existing ignored docs such as `docs/ci-cd.md`, `docs/features.md`, and `GOOGLE_AUTH_SETUP.md` are useful but not tracked.
- `packages/desktop/config/supabase.json` is intentionally ignored and should stay untracked because it can contain real project credentials.
- Build outputs and dependencies are present locally but ignored: `dist/`, `packages/desktop/dist/`, `node_modules/`, and `packages/desktop/node_modules/`.
- `packages/desktop/src/main/api/README.md` is ignored and stale. It references a shared API package that does not exist in the current tracked workspace.

## 3. Current Application State

FocusPal currently starts as an Electron app with an auth window when no session is available, then launches the main floating widget and tray after successful authentication. It stores local state with `electron-store`, exposes renderer operations through `window.fp`, and syncs selected user-scoped state to Supabase through a single `app_state` JSON row.

Implemented user-facing areas:

- Email/password auth.
- Google OAuth through a local `127.0.0.1:38081` callback and Supabase PKCE exchange.
- Password reset request.
- Floating widget with collapsed dot/pill and expanded card states.
- Tray menu with show/settings/quit actions.
- Task creation with name, date, start time, end time, recurrence, and priority.
- Today's schedule list in settings.
- Scheduled future task list grouped by date below the task creation form.
- Dynamic app version display from Electron `app.getVersion()`.
- Start/end time picker with calendar and wheel selector.
- Task start confirmation prompt.
- Task completion prompt with Completed and Partially Done options.
- Partial completion extensions with `+5`, `+10`, and `+15` minute options.
- Automatic shifting of following upcoming tasks when a current task is extended.
- Recurring task generation for active day display.
- Task history/archive behavior for resolved tasks.
- Break reminders for water, stretch, and eye rest with configurable intervals/messages.
- Pomodoro timer with work, short break, long break, auto-start, and strict-mode settings.
- Focus mode toggle, including Linux GNOME notification banner suppression.
- Word lookup from selected text, definition lookup, and Tamil translation.
- Notification sound presets and preview.
- App theme presets and custom theme colors.
- End-of-day prompt before quit, with an option to plan tomorrow.
- Startup/login item setting through Electron login item APIs.

Recent implementation status:

- App version now reads automatically from the packaged app version instead of a hardcoded UI value.
- Start time and end time are no longer auto-mutated by each other in the task form.
- Time wheel selection math was corrected so the visible picker value aligns with the selected time.
- Tasks scheduled for tomorrow or later are visible in settings under grouped date headings.
- The task completion prompt no longer asks for free-form feedback and no longer shows "Didn't Start".
- Partial completion now extends the same task and shifts upcoming tasks by the selected extension amount.
- Linux release workflow now installs AWS CLI from the official AWS ZIP installer instead of relying on the unavailable `apt install awscli` package.
- The old monorepo test script was removed from workflows and package scripts.

## 4. Architecture Overview

The app is currently simple in package layout but dense in module responsibilities.

Main process:

- Creates and manages auth, widget, settings, lookup, and end-of-day windows.
- Owns tray lifecycle and menu.
- Persists local app state in `electron-store`.
- Scopes selected store keys per authenticated user.
- Hydrates/syncs cloud state from Supabase.
- Handles Google OAuth local server flow.
- Monitors clipboard/primary selection for word lookup.
- Handles widget bounds, snapping, collapsed/expanded/lookup positioning.
- Handles IPC for store, auth, settings, app version, auto-start, DND, and window controls.

Renderer process:

- `widget.js` owns task runtime behavior, prompts, active/upcoming task rendering, notification display, Pomodoro, break reminders, focus mode, lookup card, collapsed state, and task schedule mutation.
- `settings.js` owns task creation/editing UI, scheduled task grouping, date/time picker, theme controls, general settings, account info, logout, and saving settings.
- `auth.js` owns auth form mode switching, validation, password strength display, Google auth button, password reset, and window controls.

Shared utilities:

- `taskUtils.js` provides task date, recurrence, duration, ID, and status helpers.
- `dateUtils.js` provides local date keys and relative labels.
- `rendererUtils.js` provides notification sound normalization and email validation.
- `appTheme.js` provides theme presets, custom color normalization, CSS variable resolution, and theme application.

Current architecture risk:

- `main.js` is about 1500 lines.
- `widget.js` is about 1590 lines.
- `settings.js` is about 1012 lines.
- These files are large shallow modules with many unrelated responsibilities. This makes behavior changes risky because UI, state mutation, scheduling, IPC, and platform logic are tightly coupled.

Recommended future architecture:

- Split platform-specific main-process behavior into modules such as `platform/linux.js`, `platform/windows.js`, `windowManager.js`, `authMain.js`, `storeSync.js`, and `lookupMain.js`.
- Split widget behavior into `taskRuntime`, `taskPrompt`, `pomodoro`, `breakReminders`, `lookupPanel`, and `notifications`.
- Split settings behavior into `taskForm`, `dateTimePicker`, `scheduledTaskList`, `themeSettings`, `generalSettings`, and `accountSettings`.
- Keep shared scheduling logic in `src/common` and test it before using it from both Linux and Windows UI paths.

## 5. Data Storage And Sync

Local state:

- Stored through `electron-store`.
- Auth tokens and user data are stored locally under `auth.accessToken`, `auth.refreshToken`, and `auth.user`.
- User-scoped app keys are stored with a user-specific prefix when a user is signed in.
- Some fallback behavior still checks the primary user ID for older/local values.

Cloud state:

- Supabase is used through a custom REST/Auth client, not `supabase-js`.
- Auth endpoints are called directly under `/auth/v1`.
- App state is stored in a Supabase table named `app_state`.
- Sync uses one JSON blob in the `data` column per user.
- Upserts are done with `Prefer: resolution=merge-duplicates,return=representation`.

Cloud-synced keys include:

- `tasks`
- `taskHistory`
- `breakWater`, `breakStretch`, `breakEyes`
- `breakWaterInterval`, `breakStretchInterval`, `breakEyesInterval`
- `breakWaterMessage`, `breakStretchMessage`, `breakEyesMessage`
- `wordLookupEnabled`
- `notificationSound`
- `appTheme`
- `eodPrompt`
- `taskConfirmations`
- `pomodoroSettings`

Data model observations:

- Tasks are stored as plain objects in an array.
- Common task fields include `id`, `name`, `start`, `end`, `color`, `priority`, `recurring`, `status`, `taskDate`, `createdAt`, `startedAt`, `actualEndAt`, `completedAt`, and recurrence instance fields such as `sourceTaskId` and `instanceDate`.
- Task history stores resolved task outcomes and timing metadata.
- Future tasks are not stored separately; they live in the same `tasks` array with a future `taskDate`.

Storage risks:

- Cloud sync is effectively last-write-wins at the JSON blob level.
- There is no visible conflict resolution for multiple devices editing the same schedule.
- Auth tokens are stored in `electron-store`; there is no dedicated OS credential-store integration yet.
- Cloud state schema is implicit in JavaScript. There is no migration layer or versioned data schema.
- Supabase table schema and RLS policies are not tracked in the repo.

## 6. Platform And Packaging Status

Linux:

- Linux is the most developed platform.
- Electron Builder targets AppImage and deb for x64.
- `release-linux.yml` builds Linux artifacts, validates the tag version, runs tests, publishes an APT repo, uploads artifacts to Cloudflare R2, optionally purges Cloudflare cache, and uploads GitHub Actions artifacts.
- `publish-apt.sh` creates/switches aptly snapshots and exports an armored public signing key.
- `purge-cloudflare-cache.sh` purges APT and versioned Linux artifact prefixes when configured.

Windows:

- Electron Builder config includes Windows NSIS and portable x64 targets.
- The app code contains basic Windows icon selection and tray icon sizing.
- Windows DND/Focus Assist integration is explicitly not implemented.
- There is no Windows CI workflow.
- There is no Windows release workflow.
- There is no Windows installer smoke test.
- There is no Windows signing/certificate flow documented.
- The current Windows app should be treated as incorrect and unverified.

macOS:

- macOS DND integration is explicitly not implemented.
- No macOS build target or release pipeline is currently active.

## 7. CI/CD Status

Current CI:

- Runs on Ubuntu only.
- Installs pnpm and Node.js 20.
- Installs dependencies with `pnpm install --frozen-lockfile`.
- Runs `pnpm --filter @focuspal/desktop test`.

Current release:

- `release-linux.yml` runs on `v*.*.*` tags and manual dispatch.
- Validates package version against tag version for tagged releases.
- Restores `packages/desktop/config/supabase.json` from `SUPABASE_CONFIG_JSON`.
- Imports the APT GPG private key from `APT_GPG_PRIVATE_KEY`.
- Builds Linux artifacts with `pnpm build:linux`.
- Runs `lintian` against the `.deb` but does not fail release on lintian warnings because it uses `|| true`.
- Publishes the APT repository through aptly.
- Uses AWS CLI against the Cloudflare R2 S3 endpoint.
- Uploads `.deb` and `.AppImage` to `linux/<version>/`.
- Optionally purges Cloudflare cache when zone/token variables are provided.

Release pipeline risks:

- The GPG import path has recently needed manual fixes. It should be validated with one clean manual dispatch before relying on it for a real release.
- The release workflow assumes the secret value is a valid private key block, not only a public key ID.
- There is no dry-run mode for APT publication.
- There is no automated install test of the generated `.deb`.
- There is no AppImage launch smoke test in CI.
- There is no Windows release workflow.
- There is no automated validation that R2 public URLs are reachable after upload.

## 8. Test Coverage Status

Current tests:

- `dateUtils.test.js` tests local date key generation, date shifting, and relative labels.
- `rendererUtils.test.js` tests email validation and notification sound fallback behavior.
- `taskUtils.test.js` tests recurring task matching, explicit date precedence, recurring instance creation, overnight timing, actual timestamps, resolved status detection, and task ID prefix generation.

Known passing command from recent work:

```bash
pnpm --filter @focuspal/desktop test
```

Coverage gaps:

- No tests for `main.js` IPC handlers.
- No tests for cloud sync behavior.
- No tests for auth/session refresh/logout flows.
- No tests for Google OAuth callback handling.
- No tests for settings DOM behavior.
- No tests for widget DOM behavior.
- No tests for task prompt flows.
- No tests for partial task extension and shifting following tasks.
- No tests for time wheel UI behavior.
- No tests for scheduled future task grouping.
- No tests for notification sound playback.
- No tests for word lookup API behavior.
- No tests for Linux DND behavior.
- No tests for tray behavior.
- No tests for startup/login item behavior.
- No integration tests for packaged Electron builds.
- No Windows tests.

Testing should be expanded before major platform work. The highest-value first additions are common scheduling tests for task extension/shifting, renderer unit tests for settings/widget state transitions, and smoke tests for packaged Linux and Windows builds.

## 9. Documentation Status

Current documentation is incomplete and partly stale.

Tracked docs:

- `README.md` exists but is empty.

Ignored docs:

- `docs/ci-cd.md` documents the R2 pipeline but still contains at least one stale CI step that references the removed `scripts/test-monorepo.sh`.
- `docs/features.md` describes many implemented features as planned and mentions version `1.0.1` while the package version is `1.0.3`.
- `GOOGLE_AUTH_SETUP.md` documents the Google/Supabase callback setup and is still useful, but it is ignored.
- `packages/desktop/src/main/api/README.md` references a non-existent shared package and appears obsolete.

Needed docs:

- Non-empty README with setup, dev, test, build, release, and platform notes.
- Supabase setup guide including table schema and RLS policies.
- R2 release setup guide with the exact expected secret formats.
- Linux install guide for `.deb`, AppImage, and APT repository.
- Windows stabilization guide.
- Manual QA checklist for Linux and Windows.
- Feature status document updated to match current version.

## 10. Windows App Status And Required Work

The Windows app must be considered not ready. The project owner has stated the Windows app is totally wrong, and the current repository supports that concern: Windows packaging is configured, but Windows behavior is not implemented, tested, or released through CI/CD.

Why Windows work must happen on Windows:

- Electron window positioning and always-on-top behavior can differ by OS.
- Tray icon behavior differs on Windows.
- Startup/login item behavior differs on Windows.
- Focus Assist/DND integration is not implemented.
- Clipboard/selection monitoring differs from Linux primary selection behavior.
- Installer behavior, shortcuts, app icon, uninstall behavior, and portable build behavior must be verified on Windows.
- OAuth browser callback behavior should be tested with Windows firewall/browser defaults.
- Build output must be checked on Windows because cross-building from Linux cannot validate runtime behavior.

Windows stabilization plan:

1. Create a dedicated branch such as `windows-stabilization`.
2. Set up a Windows development machine or VM with Node, pnpm, Git, and build tools.
3. Run the app in dev mode on Windows and document every broken behavior with screenshots.
4. Add a Windows GitHub Actions workflow that runs shared tests on `windows-latest`.
5. Add a manual Windows build job for `pnpm build-win`.
6. Keep Windows release publishing disabled until dev-mode and installer QA pass.
7. Move platform-specific behavior out of shared main-process code into explicit platform adapters.
8. Implement Windows-specific startup, tray, window positioning, and Focus Assist behavior behind `process.platform === 'win32'`.
9. Test NSIS install, uninstall, desktop shortcut, start menu shortcut, and portable artifact.
10. Only then create a Windows release workflow with signing and artifact upload.

Minimum Windows QA checklist:

- App launches from dev mode.
- App launches from installed NSIS build.
- Portable build launches.
- Login/register works.
- Google OAuth callback returns to app.
- Widget appears in correct position.
- Widget collapse/expand/lookup sizing works.
- Tray menu works.
- Settings window opens and closes correctly.
- Task creation works for today and future dates.
- Partial task extension shifts upcoming tasks correctly.
- Pomodoro and break notifications work.
- Focus mode does not break the app when Windows Focus Assist is unavailable.
- Startup toggle works or fails gracefully.
- App quits cleanly.
- Uninstall removes app without corrupting user data unexpectedly.

## 11. Protecting Linux While Fixing Windows

Windows changes must not break Linux. The project should enforce that through structure and CI, not memory.

Required safeguards:

- Keep `release-linux.yml` separate from any Windows release workflow.
- Keep Linux artifact paths under `linux/<version>/` in R2.
- Put Windows artifacts under a separate path such as `windows/<version>/`.
- Add Windows CI as a separate job instead of replacing Linux CI.
- Keep Ubuntu CI required for every pull request.
- Use platform-specific modules for OS behavior instead of scattering platform checks through shared code.
- Do not change common task scheduling logic for Windows unless Linux tests are updated and passing.
- Do not change Linux Electron Builder targets while fixing Windows unless the change is intentionally Linux-related.
- Add smoke tests or scripts that run `pnpm --filter @focuspal/desktop test` and `pnpm build:linux` before merging Windows work.
- Use separate release workflows: `release-linux.yml` and future `release-windows.yml`.
- Make Windows release workflow manual-only at first.

Recommended platform boundary:

- Shared code: scheduling, task history, theme resolution, date utilities, renderer-independent state transitions.
- Linux adapter: GNOME DND, Linux packaging, Linux tray/window quirks.
- Windows adapter: Focus Assist, login item behavior, Windows tray/window quirks, installer behavior.
- Renderer UI: should call shared IPC abstractions and not contain OS-specific build logic.

Merge rule for Windows work:

- If a change touches only Windows adapter/build files, Linux tests still need to pass.
- If a change touches shared task/auth/store/rendering logic, both Linux and Windows test jobs should pass before merge.
- If a change touches Linux release config, run the Linux release path manually or through a staging workflow before tagging.

## 12. Things Still To Build

Product features still incomplete or needing hardening:

- Windows implementation and QA.
- Windows release pipeline.
- Windows code signing.
- Windows Focus Assist integration or graceful replacement.
- Windows startup/login behavior validation.
- Robust cloud sync conflict handling.
- Versioned local/cloud state migrations.
- First-run onboarding and setup checks.
- Better empty/error/offline states.
- Task editing flow beyond basic creation/deletion if not already available in the UI.
- Recurring task management UX for future dates and generated instances.
- Safer account/session storage.
- Release update mechanism or user-facing update instructions.
- Production-ready documentation.

Engineering work still needed:

- Break up `main.js`, `widget.js`, and `settings.js`.
- Add tests around task extension and schedule shifting.
- Add tests around future task grouping.
- Add renderer tests with a DOM test environment.
- Add main-process IPC tests or integration tests.
- Add package smoke tests for Linux `.deb` and AppImage.
- Add Windows build/test CI.
- Add lint script implementation or remove the root lint script.
- Add formatting/linting standards and run them in CI.
- Track Supabase schema/RLS migrations.
- Remove or update obsolete ignored documentation.
- Add dependency freshness/security review.

## 13. Known Risks

High risk:

- Windows app is not reliable and not tested.
- Core behavior lives in very large modules.
- Renderer behavior is mostly untested.
- Cloud sync has no conflict strategy.
- Auth tokens are stored locally without a dedicated secure credential store.

Medium risk:

- Linux DND only supports GNOME/Ubuntu through `gsettings`.
- Release GPG/R2 workflow has had recent setup friction.
- Docs are stale or ignored.
- No automated install/launch smoke tests for packaged artifacts.
- External word lookup APIs can fail or rate limit.

Low to medium risk:

- Root `lint` script exists but no package lint script is implemented.
- The feature docs mention older versions and planned items that are now built.
- The app currently depends on manual QA for most user-facing flows.

## 14. Recommended Next Milestones

Milestone 1: Stabilize documentation and test baseline.

- Fill `README.md`.
- Update or remove stale ignored docs.
- Add task extension and schedule shifting tests.
- Add scheduled task grouping tests.
- Add a Linux manual QA checklist.

Milestone 2: Harden Linux release.

- Run a full manual dispatch of `release-linux.yml`.
- Verify R2 URLs after upload.
- Install the generated `.deb` on a clean Linux environment.
- Launch the AppImage on a clean Linux environment.
- Document exact GitHub secrets/variables.

Milestone 3: Windows stabilization.

- Move to a Windows system.
- Run dev mode and capture the exact broken behaviors.
- Add Windows CI test/build jobs.
- Implement platform adapters.
- Fix Windows runtime issues without changing Linux-specific behavior.
- Test NSIS and portable artifacts manually.

Milestone 4: Architecture cleanup.

- Split main-process services.
- Split widget and settings modules.
- Move task runtime mutations into shared/testable modules.
- Add renderer and IPC tests.

## 15. Current Bottom Line

FocusPal has a real working desktop app foundation and the Linux release path is much further along than the Windows path. The current codebase is good enough for focused feature iteration, but not yet good enough to treat Windows as releasable or to trust major shared behavior changes without added tests.

The immediate priority should be to protect the working Linux app while fixing Windows separately. Windows work should be developed and tested on Windows, isolated behind platform-specific code, and merged only after Linux tests/builds still pass.
