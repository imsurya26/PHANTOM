# PHANTOM production rescue — acceptance checkpoint

Updated 7 November 2026. Final release is under feature freeze; earlier
enhancement plans are superseded. Production deployment verification is pending.
Earlier dated logs are historical results, not claims about current provider availability.

## Repository

Work continues on `codex/phantom-production-rescue`. Commits `6f4ff1e`,
`1a4c419` and `0e2604f` were pushed to the PHANTOM remote. The final release
integrates provider controls, camera safety, corrected documentation and
acceptance checks. The existing Vercel project is `phantom`; production history
confirms `main` and the public origin `https://phantom-lake-two.vercel.app`.
Unrelated local skill folders are excluded from this work.

## Implemented and verified

- Current-shell Street Level/CCTV controls and responsive specialist panels.
  Strict Street Level fixture gate passed 27 stages without skips; legacy
  floating-panel checks remain in the legacy-shell branch.
- Native map selector with keyboard access, camera/layer preservation and
  provider failure/recovery checks on desktop and mobile.
- Flight details with reported measurements, inferred route labels, unavailable
  schedules/status, stale timestamps and safe text rendering. Zero measurements
  remain zero. Provider aircraft identity is preserved despite visual overrides.
- Follow, Chase, Orbit, Top-down and Cinematic camera views using existing
  tracking ownership. Manual input/navigation cancels automatic motion.
- Simulated AIS ship first-person, explicitly distinguished from onboard video
  and authentic cockpit geometry. Source loss/change and large corrections
  release ownership, including during arrival. Loaded terrain clamps the eye.
- Radio directory search/filtering reuses the existing player. Infrastructure
  navigation includes attributed submarine cables and landing points.
- Hosted CSP, server-side provider disable enforcement, broader provider status
  coverage, distributed admission checks and private storage-token scanning.
- Offline notice with a strictly bounded static cache, manifest/icons, explicit
  update notification/reload, and printable session summaries. Chrome
  installability criteria, worker upgrade, offline/reconnect and print PDF passed.

## Executed validation

- `npm ci`: final locked install passed under Node 24.14.0 with zero reported
  vulnerabilities. The system npm wrapper used unsupported Node 24.13.1 on the
  first attempt; the final run explicitly used the supported runtime.
- `npm audit --json`: zero vulnerabilities at the recorded run.
- Supported Node 24.14.0 doctor: passed. System Node 24.13.1 is unsupported.
- Latest combined full unit run: 6,420 tests, 6,410 passed, zero failed,
  10 pre-existing skips. All 14 separate allocation checks passed.
- Focused provider completion: 31 passed. Focused camera safety: 33 passed.
  Offline worker tests: 3 passed. Reported aircraft identity regression: passed.
- Standard and Vercel production builds passed. Formatting and package boundaries
  passed. Source/history/artifact scanning reported no findings across 2,251
  source files and 456 artifacts. Bundle-size warnings remain.
- Two obsolete README assertions initially failed after documentation cleanup.
  Their navigation/marketing expectations were updated while preserving export,
  attribution and accuracy guards. The complete rerun above includes the fixes.
- Final Chrome gates for flight details, tracked modes, current panels, native
  map selector and offline/update/print passed against the Vercel-configured
  build. Earlier simulated ship entry/source-loss checks also passed.
- Performance gate initially passed 23/24: its animated-style assertion compared
  a 60-FPS-capped viewer against uncapped high-refresh browser callbacks. The
  cadence correction preserves the original thresholds while respecting the
  configured frame cap. The isolated rerun passed all 24 checks without skips.

## Remaining acceptance

- Final Git publication, production deployment and verification of that exact
  revision remain release-time operations. Existing production preflight passed
  public search, status, origin/Redis admission and truthful AIS unavailability.
- Optional selected AIS ship model work was preserved in ignored local artifacts
  and excluded under the feature freeze; existing vessel rendering is retained.
- Local ADS-B hardware and persistent AIS collection need actual infrastructure.
- Native OS installation and iOS/Safari installation are not proven by Chrome's
  headless installability check.

Cars/trucks in aggregate road flow are not individually verified vehicle
telemetry. Submarines have no reliable individual position source here. The app
must not invent these objects, flight schedules, or spacecraft telemetry to
appear complete. See [vehicle acceptance](VEHICLE-ACCEPTANCE.md),
[provider acceptance](PROVIDER-ACCEPTANCE.md), and
[PWA acceptance](PWA-ACCEPTANCE.md) for supported capabilities and exact limits.

Use Node 24.14+ within 24.x or Node 26.x on Windows, Linux and macOS:
`npm ci`, `npm run doctor`, then `npm run dev`. Keep credentials in ignored local
environment files or hosting settings; configuration does not verify access.
