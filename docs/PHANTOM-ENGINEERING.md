# PHANTOM engineering assessment

Audit baseline: upstream `8b8ccc9a81379e8b40d4be67610570ee5b159512`, inspected 12 October 2026. This checkout retains upstream history, MIT LICENSE, THIRD_PARTY_NOTICES and DATA_SOURCES. PHANTOM is under development; this is not a public-production approval.

## Architecture and reusable capabilities

Vite and vanilla ES modules compose Cesium through `src/standalone/application.js` and `src/app/application.js`. Startup has ordered scene, controls, data and tools phases with owned disposal. `LayerLifecycle` owns registration, asynchronous visibility intent, restoration, refresh and statistics. Preserve this authority rather than maintaining a second layer state.

`src/maps/` already separates registry, terrain, imagery and photorealistic tiles, with Esri-to-OSM fallback and keyless Re:Earth terrain. `src/search/` already composes coordinate, preset and network search. `src/ui/` contains keyboard surfaces, panel rails, map controls and layer presentation. Providers have already moved out of the root Vite file into `server/providers/`; incremental gateway insertion is preferable to another backend rewrite.

Existing features include civil/military aircraft, track history, vessels, satellites, launches, USGS earthquakes, FIRMS, weather/radar/wind/cyclones, CCTV, transit, bikeshare, radio, Mapillary, recent imagery, drawing, directions, infrastructure, cables, scenes and sharing. Preserve modules and their attribution. ALPR maps infrastructure locations, not individual plate movements; do not add personal identification.

## Security assessment

Strengths: host checking before provider middleware; same-site gates; many allowlisted upstreams; bounded HTTP readers; request coalescing; local-only credential settings; separate public browser tokens; existing route and lifecycle tests; restricted voice tool schemas.

Gaps: local-first development/preview server is not a public production server. Same-site checks are not authentication. Rate limits are inconsistent and process-local. Owner Google access and AI endpoints need authenticated authorization and shared budgets. Local Codex OAuth, settings writes, local receivers and MCP must be inaccessible in a public deployment. Terrain memory/disk and aircraft enrichment caches have unbounded growth. Additional caches and every proxy still need an exhaustive bounds/admission audit. CSP allows broad connect destinations and unsafe-eval for Cesium widgets; removal requires browser evidence. Do not call the existing CSP a complete XSS defense.

## UX and technical debt

Floating collapsed controls, cinematic presets, uppercase jargon and HUD styling obscure search, layers and provenance. First-run copy overpromises live feeds even with missing keys. Retain advanced controls behind labelled navigation; add a restrained shell with a visible search field, provider state, responsive sheets and honest data labels. Do not fork layer lifecycle or map selection logic.

Large shell/facade and lifecycle modules remain sensitive integration points. Broad Node tests live under `src/`; the runner currently does not discover server tests. Tests include source-contract assertions, browser fixtures and allocation budgets calibrated on Node 24. Installed Node 24.13.1 is below upstream's declared minimum 24.14.0; record this validation limitation.

## Provider map

| Capability | Existing source | Credential / interpretation |
| --- | --- | --- |
| Free globe | Esri, OSM, Re:Earth | Keyless; provider terms and fair-use limits apply |
| Google 3D / ion | Google Map Tiles, Cesium ion | Browser-visible restricted keys; optional and metered |
| Aircraft | adsb.lol, OpenSky, adsbdb | Keyless fallback; optional server-only OpenSky OAuth; routes are enrichment, not live observations |
| Vessels | AISStream | Server-only key |
| Fires | NASA FIRMS | Server-only map key |
| Earthquakes / space | USGS, CelesTrak, Launch Library | Keyless with optional Launch Library token |
| Weather | Open-Meteo, radar and forecast providers | Provider-specific freshness; forecasts are not observations |
| Street imagery | Mapillary | Browser-visible client token; capture date is not live time |
| Traffic | TomTom / simulation | Server-only optional key; simulation must remain labelled |
| News | Google News RSS, GDELT fallback | News mentions are not verified incidents; Google RSS has noncommercial terms |
| Voice | OpenAI Realtime / local Codex OAuth | Existing upstream only; Gemini migration pending official documentation and safe token issuance |
| New air quality | OpenAQ | New integration, server credential and current API verification pending |

## Upstream issues reviewed

Live issue index: https://github.com/bilawalsidhu/gods-eye-view/issues

- #1067: zero-size canvas on backgrounding; include viewport/background recovery checks.
- #1060: keyless Google token probe returns 404; remove unnecessary probing when no owner-token service is configured.
- #1021: coordinate parser drops empty components; regression-test strict coordinate input.
- #978: same-site gate rejects TLS reverse proxies; do not blindly trust forwarding headers.
- #932: Overpass cache provenance ignores selected upstream; namespace caches by source.
- #1075: historical retention/replay requested; do not invent history from current snapshots.

## Implementation sequence and release gates

1. Foundation: PHANTOM identity, accessible responsive shell, reuse search/layers/maps, centralized honest status projection; verify keyless browser boot and navigation.
2. Security: shared gateway policy, distributed admission, bounds and failure tests. Keep local-only/cost routes denied in public mode until owner authentication exists. Production server, OIDC/session verification, shared quotas and proxy configuration require integration tests before exposure.
3. Free data: retain current adapters; add GDELT, Wikimedia, OpenAQ with bounded caching, circuit breakers and provenance. Verify provider terms. Mapillary credential verification is a separate step.
4. Nexus: deterministic spatial/time correlation; facts, inference and unknowns explicitly separated. Never infer causality from proximity. Integrate selected-entity inspector and evidence graph only after tests.
5. Premium: Gemini official API verification, ephemeral authentication and allowlisted tools; Google BYOK session handling and authorized owner quotas. No permanent credentials in source or logs.
6. Production: dedicated server, authenticated owner access, distributed controls, CSP review, WAF, monitoring, deployment and load/failure/accessibility tests.

Module evolution: add `src/phantom/` for the product shell and trust projection, `server/gateway/` for centralized admission, `server/cache/` for bounded storage, `src/correlation/` for pure evidence logic. Preserve existing provider and layer module boundaries.

## Licensing and deployment constraints

The application code's MIT license does not cover all data. TeleGeography cables are CC BY-NC-SA; Bhote Koshi imagery and derived data are CC BY-NC. Preserve credits and do not approve commercial release without permission or deliberate exclusion of all related build inputs. Keyless does not mean unlimited free public hosting. No deployment, paid account, credential or billing commitment is implied by local development.
