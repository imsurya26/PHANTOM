# Public-provider acceptance — 6 November 2026

Five bounded, read-only upstream checks passed between **12:43:23 and 12:43:28
IST** (07:13:23–07:13:28 UTC). Each provider received one request, with a
12-second timeout and 5 MiB response ceiling. No credentials, paid APIs,
station playback, retries or new deployment were involved.

| Provider and exact endpoint | HTTP | Validation | Observed result |
| --- | --- | --- | --- |
| [USGS daily earthquakes](https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson) | 200 | GeoJSON FeatureCollection with feature array | 220 features; 156,838 bytes; generated epoch milliseconds `1793949193000` |
| [CelesTrak stations](https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle) | 200 | Nonempty TLE line-1/line-2 pairs with matching counts | 15 pairs; 2,520 bytes |
| [ADS-B.lol regional aircraft](https://api.adsb.lol/v2/point/13/80/25) | 200 | JSON aircraft array | 5 records; 2,942 bytes; provider epoch milliseconds `1793949206000` |
| [Radio Browser HTTPS catalog sample](https://de1.api.radio-browser.info/json/stations/search?has_geo_info=true&is_https=true&hidebroken=true&limit=3) | 200 | Station array with string identifiers and names | 3 records; 3,990 bytes; playback not tested |
| [MBTA vehicle positions](https://cdn.mbta.com/realtime/VehiclePositions.pb) | 200 | Repository GTFS-Realtime decoder; versioned header, entity array, no truncation | 21 entities; 2,227 bytes; provider epoch seconds `1793949206` |

The reusable command is `node scripts/qa-public-providers.mjs`. The run used the
local supported Node 24.14.0 runtime. Machine-readable evidence is saved in
ignored `qa-artifacts/public-providers/results.json`; console evidence is in
ignored `qa-public-provider-acceptance.log`. A later failed probe makes the
command exit nonzero while preserving every provider's individual result.

## What this establishes

These endpoints were reachable from this workstation and returned the specified
response shapes at the recorded time. This verifies real public responses,
not fixtures. It does not establish worldwide completeness, the accuracy of
every record, future availability, or performance from another region.

The TLE probe verifies pair structure, not orbital accuracy or measured satellite
positions. The radio probe verifies directory metadata, not playable audio. The
MBTA count is decoded feed entities, not a claim that every entity is currently
moving. Aircraft observations do not provide airline schedules or operational
flight status.

## Remaining environment-specific limits

No production deployment or deployment-origin test was performed. Hosted Redis
admission, browser restrictions, live CCTV/media playback and credential-backed
providers require their configured environment. Local ADS-B requires actual
receiver/decoder hardware; AIS needs a persistent collector and shared snapshots.
Neither hardware nor the persistent AIS service was exercised by these probes.
See [provider acceptance](PROVIDER-ACCEPTANCE.md) for the separate deterministic
security and adapter tests.
