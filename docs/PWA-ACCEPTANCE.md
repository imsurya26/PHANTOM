# PWA and print acceptance — 5 November 2026

Validated against the local production preview at `http://localhost:4186`
using installed Chrome, Puppeteer, and Node 24.14.0.

## Passed

- `node --test src/phantom/offlineWorker.test.mjs`: 3 tests passed. The worker
  caches only the offline HTML, CSS and icon, removes only obsolete PHANTOM
  offline caches, requires explicit update activation, and does not intercept
  API requests, tile requests, external streams or mutations.
- Application navigation bypasses the HTTP cache. If the network and offline
  cache are both unavailable, it returns an explicit 503 offline notice.
- `node scripts/qa-offline.mjs`: passed. Chrome's
  `Page.getInstallabilityErrors` returned no installability errors. The manifest
  exposes standalone launch, scope, identity and 192/512 px PNG icons.
- Browser update lifecycle: registered a test URL for the same worker script,
  observed the waiting-worker notification, pressed the explicit reload action,
  and observed successful application startup after activation.
- Offline navigation: disabled network access for both page and worker, observed
  the static offline notice rather than a partial app or claimed live data, then
  restored network access and successfully reopened the application.
- Print media hides interactive/WebGL surfaces and displays a readable session
  summary with source/freshness qualifications. The gate generated
  `qa-artifacts/offline/session.pdf` and `qa-artifacts/offline/fallback.png`.

## Product limits

Offline mode deliberately contains no map imagery, cached provider observations,
credentials or application bundles. An internet connection is required to use
the globe. Print is a text session summary, not a globe screenshot.

Chrome installability criteria and the browser worker lifecycle were tested.
Native operating-system installation dialogs, OS shortcuts, installed-window
launches, and Safari/iOS installation behavior were not exercised by this
headless acceptance run. No native-install claim is made.

The upgrade test changes the worker script URL only inside its disposable
browser profile; it does not alter deployed worker assets or user installations.
