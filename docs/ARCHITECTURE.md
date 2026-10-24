# PHANTOM architecture

## Rescue pass integration

The lazy voice facade loads Gemini Live with an allowlisted action dispatcher. The local token broker locks the session setup and tools, keeps the permanent key server-only, and returns a short-lived single-use token. Audio capture uses an AudioWorklet; playback is bounded. Closing the drawer aborts voice work and releases audio resources. Legacy OpenAI modules remain for compatibility but are not the PHANTOM voice entry point.

Google tile failures are classified into fixed safe diagnostics. Configured Google sources remain retryable and repeated tile errors choose a free fallback. Google cache targets are bounded, although visible tiles may exceed the target. Free place search first leaves the Google tiles stack.

The aircraft fleet shares one wall-clock sample per update. Contacts outside the camera frustum receive staggered one-second motion updates; visible, model-owned and cockpit contacts retain their normal cadence. Tracked aircraft retain their separate motion path. This reduces offscreen work but does not eliminate the initial global pass or every far-side contact inside the frustum.

`scripts/profile-rescue.mjs` records actual WebGL renderer, CPU samples, long tasks, timers, event listeners, network and scene counts. Default runs use the machine graphics hardware; software rendering requires explicit opt-in. Low idle rendered FPS is expected when request-render mode sleeps. Do not compare idle FPS with an interactive FPS target.

PHANTOM adds a product shell to the existing Vite, JavaScript and Cesium application. LayerLifecycle remains the single authority for enabling, disabling and refreshing layers; the shell calls it instead of maintaining competing layer state.

## Rendering and data

- The render governor requests frames when the scene changes and holds continuous rendering only while a live animation needs it. Camera movement and tile arrivals still render. Hidden tabs suspend the default render loop.
- Aircraft and vessels use collections with stable identities. FIRMS reconciles ground cells and detection billboards by stable keys, preserving overlapping objects during camera movement. Empty snapshots remove stale detections. Existing viewport LOD and caps remain in place.
- Disabled layers stop their lifecycle work. Automatic periodic refresh is suspended while hidden or offline and slowed for constrained connections. Explicit refresh remains a user action.
- Server provider caches have TTL, byte and entry limits, with bounded in-flight work and request budgets. Provider registry responses contain status and metadata only. Presence of a credential is not proof of successful authentication.
- Nexus is requested by the user and bounded by spatial/time windows. It does not continuously correlate the planet. No worker is introduced for this small bounded calculation.

## Progressive features

The shell is mounted over the existing scene. Voice code and its control UI load on the first explicit voice or tool request. Optional PHANTOM panels and owner provider settings are dynamically imported. The existing Mapillary viewer and other third-party assets retain their own dynamic loading paths. The core layer catalog is still eager: splitting it further requires preserving its synchronous parameter and shared-scene contracts.

Search uses the existing cancellable place navigation service. Typed object suggestions read bounded snapshots from enabled layers only; they do not fetch extra feeds. Results identify aircraft, ships, events and infrastructure. Place, airport and coordinate queries retain the normal geocoder path. These are loaded-area results, not an exhaustive global object index.

## Developer measurements

Use `node scripts/profile-phantom.mjs <label>` against a production preview, setting `QA_BASE_URL` as needed. Reports go to ignored `qa-artifacts/performance/`. The harness records load readiness, rendered and browser frame rates, main-thread CPU time, heap, DOM, network activity, scene counts and governor holds. Software graphics are labeled explicitly. It does not measure GPU utilization or system-wide memory.

An explicit `?diagnostics` visit exposes `window.__phantomPerformance.snapshot()` for developer inspection. Normal visits install no diagnostic observer or timer. Resource timing is a bounded browser buffer and cross-origin transfer sizes can be zero; these values are not billing totals.

## Budgets and release checks

| Measure | Budget or acceptance condition |
| --- | --- |
| Desktop interaction | Aim for 55–60 FPS on representative hardware; measure, do not assume |
| Lower-end interaction | Aim for 30+ FPS; software-renderer automation cannot certify this |
| Idle rendering | No continuous hold without an active animation; tile loading can still draw |
| Disabled layer | No periodic refresh or animation owned by the layer |
| Search suggestions | At most 300 records per enabled layer, eight results, 180 ms debounce |
| DOM motion | No continuous decorative animations in the PHANTOM shell |
| Provider work | Existing finite cache, response, concurrency and quota limits remain mandatory |
| Regression matrix | Empty, aircraft, aircraft + ships, weather, fires, mixed layers, Nexus, Street View, narrow viewport and 4× CPU throttling |

Do not compare live-network runs as controlled benchmarks: returned data, tile availability, caching and renderer choice all affect results. Authentication failures and missing coverage must remain visible in the evidence rather than replaced by synthetic live records.

## Separate welcome document

The welcome.html entry loads only landing CSS and a small motion controller. build/scene-assets.js excludes it from Cesium script and widget stylesheet injection in both development and production. No app, voice, layer catalog or provider client is imported. Its screenshots are captured from the actual workspace. CSS motion pauses outside the viewport, in hidden tabs and under reduced motion; scroll parallax schedules at most one pending animation frame.

The explorer remains at the root URL to preserve shared scenes. The desktop bottom dock and mobile five-item navigation delegate to existing controllers. Layer cards update in place so source refreshes preserve keyboard focus and expanded details.
