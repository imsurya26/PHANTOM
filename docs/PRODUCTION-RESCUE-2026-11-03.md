# Production rescue checkpoint — 3 November 2026

## Continuation — 4 November 2026

Final continuation verification: simulated ship entry, safe camera height,
cached-position label and source-loss release passed in Chrome. Manifest,
service-worker control, exact three-file static cache, offline navigation,
reconnect and printable session PDF passed. Network loss was emulated for both
the page and service worker. Navigation fetches bypass the HTTP cache to avoid
returning a stale application document when offline. Latest review regressions:
28 passed; production build, formatting, boundaries and secret scanning passed.
Native OS installation and service-worker upgrade acceptance remain unverified.
The security changes are committed as `6f4ff1e`; later commits preserve the
application and QA changes. No deployment has been performed.

- Added reported flight details, unavailable schedule/status fields, inferred
  route labels, stale observation handling and safe text rendering. Desktop and
  mobile browser checks passed.
- Added Follow, Chase, Orbit, Top-down and Cinematic views using existing Cesium
  tracking ownership, manual/navigation cancellation and reduced-motion support.
  Five-mode browser checks passed with safe ranges and no render exceptions.
- Added simulated ship first-person using selected AIS positions and reported
  heading/course. No onboard imagery or authentic cockpit geometry is claimed.
  Source loss, identity changes and large corrections release the camera.
  Browser acceptance of this new ship mode remains outstanding.
- Vessel cards now report missing observation timestamps as unavailable and show
  the date with valid timestamps, rather than labeling undated positions LIVE.
- Migrated map-source QA to the native shell selector, preserving the legacy
  branch. Native desktop/mobile selection, camera/layer preservation, keyboard
  access and provider failure/recovery checks passed.
- Full suite before the latest first-person/offline additions: 6,404 tests,
  6,394 passed, zero failures, 10 existing skips; all 14 allocation tests passed.
  Subsequent first-person/camera/AIS focused run: 89 passed.
- Subagent audit found weather and combined-signals kill-switch gaps. Both local
  and hosted gateways now reject those routes when their providers are disabled.
  Combined signals are conservatively unavailable when either constituent
  provider is disabled; selective source fallback is not implemented.
- Added a regression for terrain arriving beneath the simulated first-person
  camera; the interpolated eye is clamped above loaded terrain every frame.
- Offline notice, manifest/icons, update prompt and print summary were started
  by a subagent. They are not yet browser-accepted. The service worker caches
  only the static offline notice assets, not provider responses or app bundles.

Subagents stopped after an execution usage limit. No commit, push or deployment
has been performed. Remaining release work below still applies, except the
flight card and tracked camera modes are now implemented as described above.

NOT READY TO MERGE. This is a stabilization checkpoint, not completion of the
production rescue and enhancement request.

## Repository and architecture

Continued on `codex/phantom-production-rescue`, based on `b028045`. The checkout
already contained uncommitted dependency, radio, provider-status, satellite,
Street Level and CCTV work. Those changes were preserved. No deployment or
push was performed.

The application uses native JavaScript, Vite and Cesium, with retained layer
owners and a PHANTOM navigation shell. Local provider middleware and the Vercel
adapter are separate execution paths. The latter must enforce its own admission
and disable policies. The shell moves retained controls into one specialist
host; hidden legacy rails are not the current user interaction contract.

## Repairs in this checkpoint

- Added More → Cameras with explicit public-camera layer and control actions.
  Copy distinguishes snapshots, recorded clips and live video.
- Added desktop/phone browser checks for Street Level and CCTV open, collapse,
  expand, close, focus restoration, viewport containment and hidden resize handles.
  The panel gate retains its legacy floating/resize checks for the legacy shell.
- Migrated the strict Street Level gate to shell navigation and current
  unavailable wording, retaining provider-rejection diagnostics assertions.
  Floating-window checks apply only to the legacy shell.
- Applied the repository formatter and repaired missing module ownership entries.
- Bounded unit-test worker concurrency to four to reduce desktop resource pressure.
- Made setup-report formatting tolerate missing optional credential entries.
- Corrected icon-font QA to ignore generated graph output and words embedded
  inside interpolated prose, while retaining literal glyph checks.
- Enforced hosted provider disable checks before handler dispatch, omitted disabled
  browser credentials from hosted builds, corrected adapter availability reporting,
  and added the reviewed application CSP to hosted responses.
- Extended secret scanning to both supported Redis token aliases.
- Corrected flight readouts: missing/nonfinite altitude and speed are unavailable;
  measured zero altitude and speed remain visible. Existing aviation units remain.

Existing in-progress radio directory and cable navigation changes remain. Radio
search filters the accepted catalog and reuses the existing player. These are not
claims that every station is playable or that every requested global layer was
newly implemented or verified.

## Executed verification

- `npm ci`: passed after retrying the Windows permission failure. Installation
  initially used system Node 24.13.1 and warned about the engine requirement.
- `npm audit --json`: passed, zero reported vulnerabilities.
- `npm run doctor -- --json`: failed as expected on system Node 24.13.1; passed
  using a cached Node 24.14.0 runtime without replacing system Node.
- `npm run format:check`: passed, 1,356 files.
- `npm run check:boundaries`: passed after ownership repairs.
- `npm run build`: passed; existing large-chunk warnings remain.
- `npm run security:scan`: passed, no findings in source or reachable history.
- `npm run security:scan -- --artifacts --no-history`: passed, 448 artifacts,
  no findings, configured-value comparison enabled.
- Focused security/setup tests: 21 passed. Focused adapter, radio and specialist
  regressions: 22 passed.
- `npm run qa:panel-resize -- --url http://localhost:4186`: passed against the
  production preview. `qa:specialist-panels` also passed and saved screenshots.
- Regular unit-suite rerun: 6,393 tests, 6,383 passed, zero failures, 10 existing
  skips. Separate supported-Node allocation run: all 14 checks passed. The full
  runner also executes the allocation checks serially after the regular suite.
- Subsequent flight telemetry and existing flight regressions: 58 passed.
- Hosted build (`npm run build -- --config build/vercel.config.js --outDir
  qa-artifacts/vercel-build`): passed, with existing chunk-size warnings.
- Strict Street Level fixture QA: 27 stages passed, zero skips, no page or
  Cesium render exceptions. Includes provider rejection, coverage picks, photos,
  modal focus, phone layout, reload/share restoration and keyless behavior.
  The harness now waits for startup restoration and uses the supported welcome
  opt-out; the delayed introduction cannot replace controls mid-click.

Browser screenshots were visually reviewed at 1440×900 and 390×844. Specialist
controls fit and the map/navigation remain visible. The browser gate checks page
and Cesium render exceptions. This is not verification of live CCTV playback,
all provider network responses, or hardware performance targets.

## Remaining release work

The universal camera-mode overhaul, first-person support for every requested
vehicle category, additional vehicle assets, complete flight-schedule card,
full layer-by-layer live acceptance, performance budgets, PWA/print acceptance,
and public-deployment authentication review are not completed by this checkpoint.
Retained aircraft cockpit/tracking, local ADS-B, maritime, transit, cables,
weather and space modules must not be mistaken for newly verified implementations
of every requested enhancement. Local receiver hardware was not exercised.

Use supported Node 24.14+ within 24.x or Node 26.x on Windows, Linux and macOS:
`npm ci`, `npm run doctor`, then `npm run dev`. Shell-specific optional scripts
are not required for this workflow. Keep private credentials in ignored local
environment files or hosting settings. Never infer verified provider access from
credential presence alone.
