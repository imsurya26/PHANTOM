# PHANTOM credential integration

Updated 21 October 2026. Values shared in chat are not used. Configure rotated credentials only in ignored `.env.local` or a production secret manager. `.env.example` contains names with empty values. Never put private credentials in browser storage, a `VITE_` variable, screenshots or Git.

## Provider mapping

| Provider | Environment names | Boundary and current behavior |
| --- | --- | --- |
| NASA FIRMS | `FIRMS_MAP_KEY` | Server CSV fetch with bounded responses/cache, deduplication and failure cooldown; empty without a key |
| OpenAQ | `OPENAQ_API_KEY` | Server v3 header authentication; station and measurement UI, bounded cache and request budget |
| AISStream | `AISSTREAM_API_KEY` | Server WebSocket, bounded vessel store, expiry and watchdog; fixed public error messages |
| OpenSky | `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` | Server OAuth; adsb.lol regional fallback where an anchor is available |
| TomTom | `TOMTOM_API_KEY` | Server tile proxy with daily budget, cache and response limits; optional traffic only |
| Google Places | `GOOGLE_MAPS_SERVER_API_KEY` | Places API (New) only; same-site gate, 60 upstream requests/minute, four concurrent distinct requests, eight-second timeout, 512 KiB body cap, cooldown; no general Places content cache |
| Gemini | `GEMINI_API_KEY` | Local-only ephemeral token broker; browser voice transport is not yet integrated |
| Launch Library | `LL2_API_TOKEN` | Optional server token; anonymous access remains available |
| Cesium ion | `CESIUM_ION_TOKEN` | Browser-visible, restrict to required assets and allowed URLs |
| Mapillary | `MAPILLARY_CLIENT_TOKEN` | Browser-visible client token; `MAPILLARY_CLIENT_SECRET` stays unused server-side |
| Google tiles | `GOOGLE_MAPS_API_KEY` | Browser-visible Map Tiles API key; never used by default geocoding or server Places |

The retained legacy Street View Static utility requires a separate optional `GOOGLE_STREETVIEW_SERVER_API_KEY`. It cannot use the Places or Map Tiles credential. Key restrictions are provider-account settings and have not been verified without access to configured accounts. See [Google Maps security guidance](https://developers.google.com/maps/api-security-best-practices) and [Places policy](https://developers.google.com/maps/documentation/places/web-service/policies).

## Status and switches

`GET /api/phantom/provider-status` returns fixed provider IDs, configuration booleans, timestamps and these states: AVAILABLE, DEGRADED, AUTH_ERROR, RATE_LIMITED, QUOTA_WARNING, QUOTA_EXHAUSTED, OUTAGE. A configured key is **not** considered a verified connection. Unverified or five-minute-old observations read DEGRADED. OpenAQ and Gemini currently record live observations; other providers retain their existing per-layer telemetry and remain unverified in this new registry.

`PHANTOM_DISABLED_PROVIDERS` accepts comma-separated IDs: `firms`, `openaq`, `aisstream`, `gemini`, `opensky`, `tomtom`, `google-places`, `google-tiles`, `cesium`, `mapillary`. Restart after changes. Server routes are denied for disabled optional providers, AIS stops connection admission, OpenSky uses the regional fallback, and disabled browser providers receive no client credential at build/start time. These are local controls, not provider-side billing caps. Rebuild deployed assets when changing browser tokens or switches.

## Gemini provisioning

The [official ephemeral-token contract](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens) was checked on 14 October 2026. `POST /api/gemini/token` is enabled when a local server key is configured unless `PHANTOM_GEMINI_ENABLED=0` or an owner kill switch disables it. It requires loopback and same-site access, rejects forwarded/cross-origin requests and all client parameters, and is denied by public mode. A token has one use, a one-minute session-start window and five-minute expiry. The broker admits one request at a time and at most ten attempts/hour, with a 15-second minimum interval and failure cooldowns. `GEMINI_LIVE_MODEL` is an optional server-only override. Returned ephemeral credentials must remain in memory, never logs or storage.

Gemini is the lazy-loaded PHANTOM voice entry point, with microphone capture, playback and a bounded six-action tool interface. The endpoint and protocol have automated tests; authenticated microphone-to-audio acceptance remains unverified because a current key is absent. Successful token provisioning alone does not establish a completed voice session. Manual map controls do not depend on this endpoint. See CORE_INTEGRATION_AUDIT.md for the current evidence.

## Verification

`npm run security:scan` scans tracked/nonignored files and all reachable Git history. `npm run security:scan -- --artifacts` also scans `dist`, including source maps if present. CI performs both checks and fails on findings or incomplete history. Findings show rule names and locations, never matched values. Public browser tokens are allowed only as exact locally configured values in generated artifacts; private-value detection takes precedence.

The scanner combines provider signatures, credential assignment heuristics and exact comparisons against locally configured private values (raw, URI encoded, JSON escaped and base64). It is defense in depth, not proof that every possible secret format or transformation is detectable. Arbitrarily encoded unknown secrets can escape these checks. Enable GitHub secret scanning/push protection on the eventual remote repository; those account settings have not been changed here.

The production build was also tested with synthetic private environment canaries. Real-provider authentication, account restrictions, live quota behavior and public deployment remain pending. Keep Vite bound to localhost; the experimental public gateway is not user authentication.
