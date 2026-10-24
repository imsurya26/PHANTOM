# PHANTOM providers

The globe and public sources work without entering personal keys. Owners may configure optional services locally; visitors should never need to understand credentials to explore. No setup dialog opens automatically, including from a shared `?setup=1` link. Optional owner controls are loaded only from Settings → Advanced → Providers.

## Status and fallbacks

`GET /api/providers/status` publishes safe metadata from `ProviderRegistry`. The older `/api/phantom/provider-status` address remains compatible. Responses contain identifiers, display names, credential requirements and configured booleans, fallback identifiers, freshness expectations, quota/error codes and verification times. They never contain credential values or raw upstream errors. Responses are not cached.

Configured means a credential exists, not that a service has accepted it. Unchecked providers report `NOT_VERIFIED`; optional services without credentials report `OPTIONAL`; owner-disabled services report `DISABLED`. Observed statuses expire after five minutes. `dataFreshness.observedAt` remains null unless actual observation metadata is available; refresh expectations are not guarantees of fresh data. Quota is `UNKNOWN` without evidence. Currently OpenAQ and the Gemini token broker record verification outcomes; other adapters remain unverified in this registry until instrumented.

| Feature | Default / fallback | Optional service |
| --- | --- | --- |
| Globe | Free imagery and OpenStreetMap buildings | Google 3D, Cesium ion |
| Place search | Photon, OpenStreetMap geocoding | — |
| Aircraft | Regional adsb.lol fallback | OpenSky |
| Weather | Public weather sources | — |
| Earthquakes | USGS | — |
| Events and context | GDELT, Wikimedia | Google Places |
| Fire detections | No fabricated replacement | NASA FIRMS |
| Ships | No fabricated replacement | AISStream |
| Air quality | No fabricated replacement | OpenAQ |
| Street imagery | Availability depends on coverage | Mapillary |
| Traffic | No fabricated replacement | TomTom |

Fallback identifiers describe a useful alternative, not equivalent data. For example, Wikimedia context does not replace all Google Places fields. A missing optional source affects only that feature. Actual adapter requests determine fallback availability; registry entries do not make network requests or claim public services are always online.

## Owner configuration

Use rotated credentials in the ignored `.env.local` file. The server loads configured owner credentials automatically. Only expressly public browser tokens are included in browser configuration; server secrets remain on the server. See [credential boundaries and environment names](PHANTOM-CREDENTIALS.md). Never paste secrets into chat, source files, or public issue reports.

Local development owners can optionally use Advanced provider controls. Those controls are unavailable to production visitors and remote clients. `PHANTOM_DISABLED_PROVIDERS` disables optional integrations. Gemini Live is the default voice transport and detects the server key automatically; `PHANTOM_GEMINI_ENABLED=0` explicitly disables it. Public deployment still requires the authentication and admission controls described in the engineering documentation. See [API keys](API_KEYS.md) for exposure boundaries and setup.

Google 3D uses only the public browser key. Configured sources can be retried; repeated tile errors fall back to the standard map without resetting layers or the camera. Advanced map diagnostics expose fixed error codes rather than upstream URLs. HTTP 403 alone cannot establish whether billing, API activation, or key restrictions caused a rejection. Place search switches to the standard map before using the free geocoder.

Source refresh, bounded caching, abort handling and retry behavior are implemented by individual adapters; see [provider implementation notes](PHANTOM-PROVIDERS.md). The registry is metadata, not a new polling loop.
