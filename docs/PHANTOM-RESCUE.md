# PHANTOM rescue pass

This report separates implementation from live-provider verification. The checkout remains unsuitable for public production deployment.

## GEMINI LIVE

Gemini Live replaces OpenAI at the lazy PHANTOM voice entry point. The permanent key is server-only; the local broker locks model/setup/tool configuration and returns a short-lived single-use token. The browser uses an AudioWorklet, bounded playback and a five-minute session cap. Six validated actions cover place search, layers, tracking, stopping tracking, map style and Nexus. No arbitrary tool catalog is exposed.

Closing the drawer stops voice. Nexus sends its tool response before deferred navigation and explicitly says that voice ended. Tests cover malformed tools, duplicate calls, handshake ordering, cancellation, provisioning races, buffers and cleanup. Real microphone → Gemini → speaker and authenticated spoken-command behavior remain unverified because no fresh local credential is configured. Public token provisioning remains blocked pending authenticated admission.

## GOOGLE MAP

Google tiles use the public browser key only. Missing local Google and ion credentials explain their initial unavailable state; account activation, billing and key restrictions cannot be inferred from that state. Safe diagnostics distinguish missing configuration, authentication, access denial, quota and network/provider failure without publishing credential-bearing errors.

Configured Google tiles can be retried. Repeated tile failures fall back to the free map without resetting camera or layers. Credits remain visible. Cache targets are 256 MiB plus 128 MiB overflow, not a hard total-memory guarantee. Free geocoding first switches to the standard map. Cancelling a voice-owned map switch invalidates its pending activation without cancelling a newer manual choice.

## CCTV

Selection shows metadata; Watch explicitly requests media. Closing, changing selection, hiding the page, disabling the layer and disposal release playback. Nonselected snapshot requests are suppressed. Recorded clips are not labelled live, and retrieval time is not capture time.

Two official public snapshots decoded, and a finite TfL MP4 genuinely played. The HLS candidate's successful manifest response does not establish playback. See [CCTV validation](CCTV_VALIDATION.md) for source-specific evidence and workflow limitations.

## PERFORMANCE

The new profiler records the actual renderer, frame counts, CPU samples, long tasks, timers, listeners, requests, bytes and scene counts. Hardware testing used AMD Radeon graphics through ANGLE/D3D11 at 1440 × 900. Eight-second windows are exploratory, not a statistically controlled benchmark.

| Scenario | Initial development run FPS | Production run FPS | Production main-thread occupancy |
| --- | ---: | ---: | ---: |
| Empty, moving | 44.5 | 54.1 | 69.5% |
| Aircraft, moving | 13.1 | 31.4 | 93.4% |
| Aircraft, settled | 26.8 | 35.6 | 85.2% |
| Layers disabled again | 0 | 0 | 17.3% |

The initial run had 10,042 aircraft; production had 7,728. Build mode, live data, network and caches differ, so the table does not establish a controlled speedup. Idle zero FPS is expected when request-render mode sleeps. The aircraft case still misses the requested 55–60 FPS target.

Measured source hot paths include fleet motion, per-contact time conversion, detectable-object collection and graphics readback/shader work. The fleet now shares one time sample and updates out-of-frustum contacts at staggered one-second intervals. Visible, tracked, model-owned and cockpit paths retain their normal update behavior. Initial global ingestion and far-side contacts inside the frustum remain costs. Production samples still show graphics readback and detectable-object work. GPU utilization was not measured.

Reports: ignored `qa-artifacts/rescue/before-hardware.json` and `after-production.json`. The intervening `after-fleet.json` run was interrupted by development hot reload and must not be treated as a valid comparison.

The final extended production run (`final-extended.json`) had **13,310 aircraft**, NOAA weather and 46 earthquakes. It demonstrates that the heavier workload still fails the target:

| Final scenario | FPS | Main-thread occupancy |
| --- | ---: | ---: |
| Empty globe moving | 51.9 | 61.5% |
| Aircraft moving / settled | 13.3 / 24.5 | 96.2% / 95.2% |
| Mixed aircraft, weather and earthquakes | 28.3 | 69.9% |
| Nexus panel open / Street panel open | 27.3 / 30.0 | 59.8% / 59.6% |
| 390 × 844 viewport, mixed layers | 34.8 | 92.8% |
| Same viewport at 4× CPU throttling | 2.4 | 98.9% |

AIS and FIRMS were enabled but returned zero observations because credentials were absent. Those cases do not establish vessel/fire rendering capacity. Panel-open tests do not prove authenticated street-media loading or a full Nexus analysis. After disabling all layers, interval count returned from 11 to 6 and the render governor had no holds; the eight-second sample still rendered while tiles/camera settled. Short runs do not establish long-session memory stability. Final CPU samples show heavy fleet/culling work, detectable-object collection and Cesium rendering; graphics readback was also prominent in the earlier production sample.

## UI UX

The main map menu excludes unconfigured sources; Advanced contains diagnostics and retry controls. Map errors have friendly feedback. Layer groups now place satellites under Live Activity and transport under World, with a Signals group. Find Chennai executes search. The optional tour highlights its relevant controls without animation.

Voice is contained in the drawer and stops when closed. The context inspector pauses automatic pagination while focused, hovered, hidden or collapsed; accessible labels clarify target and focus actions. Existing source and coverage information stays visible. No Magic UI MCP or Aceternity component was used; the lightweight native shell remains.

## PROVIDERS

Configured credentials are detected locally without visitor key prompts. Configuration is distinct from verified service access. Failures are scoped to the affected feature. [API_KEYS.md](API_KEYS.md) documents the browser/server boundary. Existing bounded caches and provider budgets remain in place.

## SECURITY

No credential from chat history was imported or tested. Permanent Gemini, Google server, OpenSky, AISStream and other private keys remain server-only. The allowed browser configuration is explicit. Gemini tools reject unknown arguments and capabilities. Map errors use fixed diagnostics. Generic CCTV media redirects follow a bounded same-origin policy. Public deployment still lacks the required owner authentication/admission layer.

## REMAINING ISSUES

Validation: the full run passed 6,321 tests with 10 skipped, followed by 14 passing allocation tests. Package boundaries and whitespace checks passed. Desktop/mobile shell browser checks passed. The Windows concurrent malformed-key repair test now includes a deterministic sharing-conflict regression. Public-camera snapshot Watch/Close passed at desktop and phone sizes through the app's selection API, as detailed in the CCTV report.

The final production build passed in 17.87 seconds, with the existing large-chunk warning. Formatting checked 1,335 source files. The credential scanner reported zero findings across 1,871 source files, 441 built artifacts and Git history. Exact comparison against configured private credentials was unavailable because no private values were configured; this is not proof that every possible secret format is detectable.

- Authenticated Google and Gemini end-to-end verification needs fresh local owner credentials.
- Aircraft performance remains below the desktop target and the 4× throttled run fails the weaker-device target. Long-session acceptance and credential-backed ship/fire stress testing remain incomplete.
- Genuine HLS playback and all-camera/provider compatibility are not established.
- The eager layer catalog, some legacy inspector panels and deeper startup work remain.
- Node 24.13.1 was available during checks; the declared supported minimum is 24.14 within 24.x, or 26.x.
- No deployment, publish, commit or push was performed.
