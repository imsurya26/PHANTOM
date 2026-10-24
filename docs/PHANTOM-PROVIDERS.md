# PHANTOM provider additions

The upstream inventory and licenses remain in [DATA_SOURCES](../DATA_SOURCES.md). No permanent credentials have been added to source.

## News and place context

`GET /api/phantom/signals?lat=13.08&lon=80.27&q=Chennai` uses a plain-language news query and a rounded coordinate cell. Unknown/duplicate fields, out-of-range coordinates and query operators are rejected.

- GDELT DOC 2.0 returns article mentions from the last 48 hours. The query is independent of the coordinate radius. Its index time is not presented as the event time or publication time. [Official documentation](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/).
- Wikipedia GeoSearch returns up to eight linked reference places within 10 km of the rounded camera position. It is not current-event evidence. [Official documentation](https://www.mediawiki.org/wiki/API:Geosearch).

Each source has its own cooldown. Requests use fixed HTTPS origins, reject redirects, time out after eight seconds, cap responses at 512 KB and deduplicate in-flight queries. At most one upstream request per provider is in flight, with at least five seconds between distinct cache misses. The cache has 200 entries / 2 MB, a ten-minute fresh interval and a one-hour retention ceiling. Stale responses are explicit. No upstream error text is returned. These local provider controls do not replace deployment-wide quotas; this endpoint remains denied in the preliminary public profile.

Both sources work without keys where reachable. Network/provider availability is not guaranteed. Their reports are not injected into Nexus as geolocated observations.

## Nexus initial scope

Nexus currently reads enabled earthquake and FIRMS layers on demand. USGS event time and FIRMS acquisition time are used; retrieval time is never substituted. At most 1,000 records from each layer are compared. The UI selects among the 100 newest anchors and shows up to 20 nearby matches inside 100 km / six hours. No continuous scanning or background historical archive is created.

Facts mean source-reported observations, not independent verification. An association is a spatial/time inference. Wind, smoke, air-quality change, aviation disruption, infrastructure damage and causal confidence are not inferred by this initial implementation.

## Distributed admission

`PHANTOM_PUBLIC_MODE=1` selects an experimental deny-by-default admission profile. It requires `PHANTOM_REDIS_REST_URL` and `PHANTOM_REDIS_REST_TOKEN` (server-only). The Redis REST transport uses atomic EVAL increment/expiry, HTTPS, a 2.5-second timeout and bounded responses. [Official REST documentation](https://upstash.com/docs/redis/features/restapi).

This profile is not a deployment recipe or an authentication system. Most provider endpoints remain denied until reviewed. Redis availability failure returns 503 rather than silently accepting traffic. Paid/local endpoints are not authorized by same-site headers. Keep development bound to localhost. Do not put the Vite development server on the public internet.

## Gemini migration research

Official Google documentation inspected 13 October 2026 currently shows `gemini-3.8-live`, with ephemeral tokens for client-to-server Live connections. Model availability and project limits must be checked again at integration time. [Capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities), [ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

The existing OpenAI voice implementation has not yet been replaced. A disabled-by-default local Gemini ephemeral-token broker is now implemented and fixture-tested; its browser audio and tool wiring remain unfinished. See [credential integration](PHANTOM-CREDENTIALS.md) for exact limits, configuration and remaining verification.
