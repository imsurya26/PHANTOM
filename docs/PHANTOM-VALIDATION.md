# Current reconstruction — 23 October 2026

Current full suite: 6,331 tests, 6,321 passed, 10 skipped, zero failures.
Both isolated allocation runs also passed (14 checks combined). Package
boundaries pass after registering the two new flight math helpers. Production
build passes, retaining the existing large-chunk warning. The source/history
and artifact scan found no secrets (2,177 files and 447 artifacts); no local
credential values were available for exact-value comparison.

Formatting passed for 1,338 adopted source files; whitespace validation passed.
The final rebuilt Chrome suite passed desktop/mobile navigation, SVG icons,
More → Voice → Escape focus return, landing isolation and reduced motion with
zero page exceptions. The controlled flight comparison completed, but the
55/30 FPS targets remain unmet; see the performance report for exact results.

The dated records below describe earlier milestones. Current layer-by-layer
evidence is in [the layer audit](LAYER_AUDIT.md); Google, Gemini and interface
acceptance is in [the core integration audit](CORE_INTEGRATION_AUDIT.md).
[Performance evidence](PERFORMANCE.md) separates current Windows measurements
from the historical upstream baseline.

The current shell has nine desktop dock controls and five mobile tabs. The
separate `/welcome.html` entry loads without Cesium or application data requests.
Gemini microphone/playback/tool integration is implemented, but authenticated
end-to-end acceptance still requires a fresh locally configured server key.
No historical chat credentials were imported. Public owner authentication and
the remaining provider acceptance rows are still release work.

# PHANTOM validation — 14 October 2026

This is a local development checkpoint, not a production readiness certificate. No supplied chat credential was imported or used. `.env.local` is ignored and was absent; all requested credential environment variables were absent in the inspected process.

| Check | Result |
| --- | --- |
| Full unit-suite checkpoint | 6,275 passed, 10 skipped, zero failures (6,285 total) |
| Allocation gate | One passed |
| Subsequent credential/provider/layout checks | 69 focused checks passed; 21 provider/WebSocket checks passed; separate OpenSky disable/fallback test passed |
| Attribution CSS guard | 15 passed; retains original scenarios and adds PHANTOM scenarios |
| Production build | Passed; existing large-chunk warning remains |
| Package boundaries | Passed |
| Adopted formatting | Passed; subsequently edited files formatted directly |
| Whitespace validation | `git diff --check` passed |
| Secret scan | Current files and full reachable Git history: no findings; 435 rebuilt artifacts: no findings |
| Browser secret canaries | Ten synthetic private environment values, 193 generated text assets, no detected canary values or source maps |
| Production browser QA | Desktop 1440×900 and mobile 390×844 passed; seven sections, Escape focus return, retained layer controls, drawer bounds and visible attribution |
| Optional provider failure | Missing OpenAQ configuration is explicit; simulated source-context failure leaves Analysis navigation usable |

The first development browser run encountered Vite's stale optimized-dependency cache. Restarting with forced optimization restored development startup; final UI validation used the production preview. Visual inspection found and fixed an attribution wrapper collapsing to zero width. Browser QA now measures the rendered credit element, not its empty parent, and waits for the opening camera movement and tile loading before the desktop screenshot.

Screenshots are local ignored evidence under `qa-shots/phantom/desktop.png` and `qa-shots/phantom/mobile.png`. Logs are local ignored files. The history scanner's initial assignment finding was a JavaScript property reference in upstream history, not a credential; its literal classification was corrected and regression-tested.

## Not yet verified or completed

- Real provider authentication, restrictions, live account quotas and credential rotation require owner-configured local keys.
- Gemini's local ephemeral broker has synthetic safety tests; browser microphone/playback/tool integration is unfinished.
- Public owner authentication and a complete production provider audit remain unfinished. The public gateway denies unreviewed endpoints and does not replace authentication.
- Provider status observations currently feed the new registry for OpenAQ and Gemini; other providers retain existing layer telemetry.
- Local Node is 24.13.1, below the repository's supported 24.14.0 minimum. The checked-in CI targets supported Node versions; no remote CI run is claimed.
- GitHub secret scanning and push protection have not been enabled on a remote repository. No changes were committed, pushed or deployed.

See [credential configuration and boundaries](PHANTOM-CREDENTIALS.md) and [the engineering roadmap](PHANTOM-ENGINEERING.md).
