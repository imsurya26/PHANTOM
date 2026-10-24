# Core integration audit

Verified 21 October 2026. Scope: current architecture, configuration, Google 3D,
Gemini voice and their failure/security boundaries. This is not a claim of
authenticated provider acceptance or a new performance benchmark.

## Diagnosis and severity

| Priority | Finding | Evidence / consequence |
| --- | --- | --- |
| P0 acceptance blocker | Google 3D and Gemini cannot authenticate in this checkout | Effective development environment has neither `GOOGLE_MAPS_API_KEY` nor `GEMINI_API_KEY`. Actual local endpoints confirm missing configuration. |
| P1 deployment boundary | Gemini provisioning is local-only | Public mode and non-loopback clients are denied intentionally. Authenticated public admission is unfinished. Do not remove this restriction to make deployment appear functional. |
| P1 configuration caveat | Browser map credentials are compiled into the browser entry | Restart development after configuration changes; rebuild production after changing browser map credentials. Restarting only a preview server cannot change the compiled map key. |
| P2 diagnostics limit | Configured is not equivalent to working | Registry reports configuration and bounded observations. Token provisioning alone does not mark the complete Gemini audio integration available. |
| P2 runtime mismatch | Local Node is 24.13.1 | Project declares 24.14+ within Node 24, or Node 26. Focused tests pass here, but this remains outside the declared supported patch range. |

No new Google/Gemini implementation failure was reproduced in this audit.
Missing credentials do not prove that billing, API activation, key restrictions,
quota or provider availability are correct or incorrect. Those remain unverified.

## Architecture and reuse boundaries

- Existing app is vanilla JavaScript modules with Vite 6 and Cesium; no React or
  Next runtime is necessary for the requested redesign.
- Retain `src/app` lifecycle ownership, `src/maps` controller/source ownership,
  layer lifecycle and render-governor ownership. Shell changes should invoke these
  interfaces rather than recreate viewers, polling loops or provider clients.
- Landing and application should have separate lightweight entry points. Landing
  should not import the app, Cesium, voice, map stylesheets or layer catalogs.
  Navigating to the application should initialize the existing app exactly once.
- Keep application identity stable through panel and map-style changes. Route
  transitions that actually leave the application must invoke existing teardown.
- Keep voice lazy: `src/app/lazyVoice.js` loads Gemini only on explicit use.
  Preserve the current action runner for ordinary controls; the model uses the
  separate six-action allowlist, never the unrestricted tool catalog.
- Preserve attribution, source/freshness descriptions and escaped provider text
  in every redesigned dock, inspector and bottom sheet.

## Configuration verified without exposing values

Used Vite's development environment loader with process-environment precedence,
matching `server/standalone/vite.config.js`. Checked presence only. The following
were all absent: `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`,
`GOOGLE_MAPS_SERVER_API_KEY`, `CESIUM_ION_TOKEN`, `OPENAQ_API_KEY`.
Historical chat credentials were neither accessed nor used.

`build/vite.js` disables automatic environment exposure (`envPrefix: []`) and
explicitly defines the intended browser map tokens. The server Google key and
permanent Gemini key are not browser definitions. Browser Map Tiles credentials
are public credentials and must be restricted appropriately; they are not secrets
merely because they originated in an environment file.

## Google 3D

`src/maps/google3d.js` uses Cesium's Google Photorealistic 3D Tiles helper with an
explicit browser key and attribution enabled. Its separate ion route requires an
explicit ion token. Failure returns to the ordinary globe through the map
controller, preserving the viewer and data-layer ownership.

The current direct route is consistent with Google's supported Cesium renderer
architecture. Map Tiles API activation, billing and key restrictions still need
authenticated verification. Use separate server/client keys and apply Map Tiles
API and appropriate website restrictions to the browser key. See the official
[renderer integration](https://developers.google.com/maps/documentation/tile/use-renderer)
and [security guidance](https://developers.google.com/maps/api-security-best-practices),
checked during this audit.

## Gemini

Default model remains `gemini-3.8-live`, with a server override. Backend uses
`v1beta/auth_tokens` with canonical `bidiGenerateContentSetup`, one use, a
one-minute new-session window and five-minute expiry. Browser connects to the
constrained WebSocket endpoint using the ephemeral token, not the permanent key.
PCM16 input declares the actual capture sample rate; output playback uses 24 kHz.

The six validated actions are place search, layer enable/disable, tracking,
stop tracking, map change and Nexus. Tool budgets, frame/buffer limits,
microphone teardown, interrupted playback, session cancellation and late-response
guards are tested. Nexus dispatches its response before navigating and stopping
voice, then displays a microphone-off notice.

The [official API reference](https://ai.google.dev/api/live.md) and
[WebSocket guide](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket)
were checked again during this audit. Provider docs do not replace live acceptance:
microphone audio reaching Gemini, audible reply and spoken commands are still
unverified without securely configured credentials.

## Reproduction and test evidence

A fresh local development server on port 4195 produced:

| Probe | Observed result |
| --- | --- |
| `GET /api/providers/status` | 200; Gemini, Google 3D and Cesium ion each report `OPTIONAL`, `credentialConfigured: false`, `reason: not-configured` |
| Same-origin/local `POST /api/gemini/token` | 503; voice not configured or disabled; manual controls remain available |
| Cross-origin `POST /api/gemini/token` | 403; rejected before provisioning |

Targeted regression command:

```powershell
node --test src/maps/googleTokens.test.mjs src/maps/controller.test.mjs src/maps/sourceFactories.test.mjs src/voice/geminiSession.test.mjs src/phantom/credentialSafety.test.mjs
```

Result: **54 passed, zero failed**. Local output is retained in ignored
`qa-artifacts/core-audit-tests.log`. These tests cover simulated provider failures,
map recovery and mocked voice transport, not authenticated Google tiles or Gemini
audio. Initial sandbox localhost denial was an execution-environment issue;
fresh server/probes outside that restriction produced the results above.

## Remaining acceptance

- Verify actual Google tiles, switching, attribution and layer continuity with
  a configured restricted browser key.
- Verify real microphone permission, Gemini handshake, input/output audio and
  spoken aircraft/Chennai/Nexus commands with a configured server key.
- Recheck rebuilt browser artifacts for private credential exposure after
  configuration and after the landing/dock reconstruction.
- Independently exercise landing-to-app navigation, app teardown, keyboard focus,
  collapsed panels and mobile controls once the new shell is ready.
- Use the performance owner's measured profile for performance conclusions;
  this audit makes no FPS or CPU improvement claim.

## October 23 independent browser verification

Production preview at localhost:4186 passed the updated real-Chrome interaction
suite (`scripts/qa-phantom-rework.mjs`): isolated landing requests without scene,
API or media startup; desktop/mobile page bounds; reduced motion; actual landing
CTA navigation; nine desktop and five mobile dock controls; Escape focus return;
grouped layers; place search; lazy voice mounting with no active microphone;
voice drawer cleanup; map options; tour; provider status; offline notice; no page
exceptions. This is interface/lifecycle coverage, not authenticated voice E2E.

Visual inspection of the screenshots found a dock defect that geometry assertions
did not catch: external icon-font ligatures displayed as text and overlapped mobile
items. Reported to the shell owner before accepting updated preview images.

Mapillary proxy/security and CCTV media-state suites passed 55/55 outside the
filesystem sandbox. The sandbox run encountered temporary-cache rename EPERM;
no source fix was inferred from that environment restriction. These checks cover
rejected credentials, rate limits, redirect boundaries and truthful snapshot versus
video labels; they do not establish authenticated Mapillary imagery availability.

### Final SVG dock visual acceptance

The rebuilt production interface passed the complete Chrome suite again on
October 23. Desktop (1440 × 900) and mobile (390 × 844) screenshots were inspected:
inline SVG icons render correctly, labels no longer overlap, the desktop dock is
centered, and the mobile More panel stays inside the viewport. All three test
groups passed with zero page exceptions (`qa-artifacts/final-browser.log`).

Updated `public/preview/workspace.webp` and `public/preview/mobile.webp` are actual
captures of this interface. The landing was recaptured at both viewport widths;
its desktop preview initially appeared blank in a full-page screenshot because
smooth scrolling/image decoding had not settled. The QA script now scrolls
instantly and awaits image decoding before capture. Inspection of the corrected
capture confirms both previews render. This did not require a product change.

The final rebuilt suite also passed embedded SVG counts and mobile More → Voice
→ Escape focus restoration (`qa-artifacts/final-browser-focus.log`). Escape
returns focus to the visible More dock button; all three groups passed with zero
page exceptions.
