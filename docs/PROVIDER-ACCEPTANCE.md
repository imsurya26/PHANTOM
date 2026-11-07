# Provider acceptance — 5 November 2026

This is code and deterministic integration acceptance, not a new live-provider
or deployed-account certification. No paid calls or credential values were used
in this audit. Historical success counts in deployment documentation are dated
observations and are not evidence of current availability.

## Completed verification

31 focused tests passed across `vercelHardening`, `security`, `providerRegistry`,
`providerDisable`, `vercelOptional` and `vercelPublicRead`. These verify provider
disable controls, unverified status semantics, invalid requests, HTTP methods,
bounded caches, request coalescing, failure responses, shared admission and
credential boundaries. The run used Node 24.14.0; output is in the ignored
`qa-provider-completion.log`.

The provider registry now includes CelesTrak, Radio Browser, public transit,
bike-share and launches. Local and hosted kill switches cover these routes.
An enabled or configured adapter remains NOT_VERIFIED until observations exist.
The current combined GDELT/Wikimedia endpoint conservatively stops when either
provider is disabled. Selective fallback is not advertised.

## Implemented coverage and exact limits

| Feature | Existing implementation | Acceptance limit |
| --- | --- | --- |
| Aircraft | Public ADS-B reads, bounded regional requests and truthful missing telemetry | Coverage depends on receivers; ADS-B does not supply schedules or operational flight status |
| Local ADS-B | Browser RTL-SDR and configured private decoder feeds; source/band merge | Requires attached WebUSB receiver or reachable decoder hardware; neither was exercised here |
| AIS | Persistent local collector and vessel records/cards | Serverless adapter intentionally reports unavailable; production needs persistent collector plus shared snapshots |
| Traffic | TomTom flow and reference roads | Aggregate flow is not individual verified car/truck tracking |
| Transit / bike share | Validated transit feeds and GBFS adapters | Geographic/feed coverage varies; stationary bikes and station capacity are not moving vehicle telemetry |
| Cables / infrastructure | Bundled reference datasets, source attribution and selection | Mapped reference routes are not measured network traffic or current operating status |
| Radio | Radio Browser catalog, filtering and existing player | Stream reachability, codec support and station metadata vary; catalog existence does not prove playback |
| Weather / fires | Weather, wind, cyclones and FIRMS adapters | Acquisition timestamps and coverage matter; key presence does not verify current observations |
| Space | CelesTrak orbital elements and launch information | Orbital propagation and mission replay must not be labeled measured spacecraft telemetry |

## Public hosting boundary

`server/vercel/admission.js` requires the configured HTTPS origin and trusted
edge identity for admitted credential-backed visitor requests. Distributed
storage failure denies admission; it does not fall back to process-local usage
counters. Origin checks are not user authentication. The application is an open
public map, while local receiver, credential-editing and MCP surfaces are not
public APIs. Paid-provider account quotas remain an operator responsibility.

The hosted adapter includes more read services than the original deployment
rollout: optional transit, GBFS, radio, launches, routing, wind/cyclones, weather,
signals, CelesTrak and cameras are implemented alongside aviation and air quality.
Actual production origin, storage availability, provider restrictions and live
media require environment acceptance; no new deployment was performed here.
