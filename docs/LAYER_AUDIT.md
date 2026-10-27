# Layer repair audit

## Public deployment verification, 28 October 2026

The older local audit below is historical; its missing-local-credential findings do not describe the current Vercel environment. Public URL: https://phantom-lake-two.vercel.app/.

| Area | Current evidence | Remaining limit |
|---|---|---|
| Reload controls | Browser completed an enabled-layer reload; bounded concurrency, isolated failures, cooldown and duplicate suppression pass tests. Added synchronization when reopening the drawer during refresh. | Provider caches and quotas still apply. |
| CCTV | Public catalog returned 3,182–3,356 snapshot cameras; an Austin image returned HTTP 200 with 302,036 JPEG bytes. Browser reports camera grid ready, 64/64. | Catalog availability varies; not every camera feed was opened. No synthetic 18-camera fallback. |
| Flights | Public regional requests returned Austin 453, Chennai 53, London 668 observations. | Regional coverage; counts change. |
| Satellites, earthquakes, fires, clouds | Browser rendered layer statuses with 827 satellites, 30 earthquakes, 10,000 partial fire observations and one cloud imagery layer. | Source timestamps, caps and coverage apply. |
| Street Level | Mapillary coverage tile returned HTTP 200, 562,408 bytes. | Image selection and panorama playback not fully verified; zoom and coverage matter. |
| Traffic | Configured status and real flow tile returned HTTP 200, 11,595 bytes. | Rendering not separately verified in this pass; shared request limits enforced. |
| Directions | Austin route returned HTTP 200, valid geometry, distance 2,209 m and duration 214 s. | Full interactive routing flow not separately verified. |
| Wind | Manifest available, 360×181 grid; binary returned HTTP 200, 521,280 bytes after decoder bundling repair. | Particle rendering not separately verified. |
| Transit, cyclones, launches, radio | Public responses returned 7 feeds, 1 storm, 20 launches and 750 stations respectively. | Individual transit feeds and radio playback not exhaustively verified. |
| Main panels | Explore, Layers, Events, Nexus, Timeline, Map, More and Settings opened in the browser. | Opening a panel does not verify every action inside it. |
| Local ADS-B | Requires a connected receiver. | Cannot be supplied by a hosted API key. |
| AIS vessels | Continuous upstream collection remains a deployment dependency. | Not verified working on this Vercel deployment. |
| Other catalog options | See inventory below for ALPR, recent imagery, bike share, perimeters, radar/lightning, installations and bundled reference layers. | Browser acceptance remains outstanding for these rows. |

Validation: focused reload/provider/rewrite tests pass; production build passes with existing large-chunk warnings; secret scanner reports no findings across 2,211 files and Git history. These checks establish specific repairs, not a guarantee that every third-party source is always available.

Checked 22 October 2026. This is an evidence ledger, not a declaration that every layer passed browser acceptance. `NOT VERIFIED` explicitly means that a current end-to-end result is still required. HTTP success alone does not prove markers or imagery rendered.

## Reproduced defects and evidence

- **P0 Bike Share:** the client encoded an entire HTTPS URL into the route path. The shared gateway rejected that structural encoding before GBFS middleware ran. `node --test src/phantom/gbfsGateway.test.mjs` failed with `GBFS HTTP 400` before repair. The client now uses a query parameter; the proxy validates the target independently. Gateway restrictions remain intact. Focused source, gateway, mounted proxy, timeout, redirect and response-cap checks: 20 passed.
- **P1 Traffic integrity:** road flow measurements were converted into randomly placed moving cars with randomized speeds and stops. These were not vehicle observations. The operational renderer now draws stable road lines: gray reference geometry and measured speed/congestion colors where actual flow exists. It does not start the synthetic vehicle animation or hold continuous rendering. Legacy simulation unit helpers remain separate from the operational layer construction.
- **Credential presence:** the actual Vite dotenv loader plus process environment reported all ten configured-provider checks false: FIRMS, OpenAQ, AISStream, Gemini, OpenSky, TomTom, Google Places, Google Tiles, Cesium ion, Mapillary. No values were printed. This is a missing-local-configuration finding, not an assertion that a supplied account/key is invalid. Chat credentials are not reused.
- **Real keyless probes:** `node scripts/probe-provider-layers.mjs` returned 2,519 NYC stations, 628 Boston stations, 87 Austin stations, 18 recent Launch Library launches, and 115 normalized fire perimeters through the actual backend handler. These establish valid current responses and schemas; browser acceptance is separate.
- **Actual application transport:** the repaired `/api/gbfs?url=...` request through the running application on port 4195 returned HTTP 200 and 87 Austin stations. This includes the real gateway and proxy, not only a direct upstream call.
- Sandbox DNS initially failed; the same public probe with approved network execution succeeded. An intervening automatic approval review failed due to account usage limits, not a security determination. Later execution succeeded.

## Complete registered layer matrix

The inventory follows `src/app/constructCatalog.js`, `src/data/layerState.js`, and the local ADS-B registration. Sources are the actual standalone source composition. Empty regional coverage is distinct from failure.

| Layer | Provider / meaning | Before / cause | Repair or fallback | Current test evidence |
|---|---|---|---|---|
| Aircraft | OpenSky / adsb.lol observations | Credential missing for authenticated OpenSky | Existing regional adsb.lol fallback | Separate flight QA; not claimed by this audit |
| Military aircraft | adsb.lol reports and classification | NOT VERIFIED | Public feed, no fabricated aircraft | Browser acceptance pending |
| Local ADS-B | User's local receiver | NOT CONFIGURED until a receiver is connected | Public Aircraft is a separate alternative | Hardware-specific; no receiver verified |
| Live vessels | AISStream | CREDENTIAL MISSING | No fake vessels; isolated unavailable state | Missing credential confirmed; live socket acceptance pending |
| Satellites | CelesTrak orbital elements | NOT VERIFIED | Calculated propagation, not measured live positions | Browser acceptance pending |
| Space Missions | Launch Library 2 | Reported unavailable; current upstream succeeds | Existing bounded cached feed | Real 18-record response; browser acceptance pending |
| Earthquakes | USGS all-day feed | Reported unavailable; exact prior failure unconfirmed | Public event source | Source/schema path inspected; browser acceptance pending |
| Active Fires | NASA FIRMS | CREDENTIAL MISSING | Fire Perimeters is related US data, not a substitute detection feed | Presence check; real FIRMS validation blocked by missing local credential |
| Fire Perimeters | NIFC WFIGS / InciWeb | Reported unavailable; current backend succeeds | Existing public bounded/paged polygons | Real 115 normalized perimeter records |
| Street Traffic | TomTom flow / OSM roads | Synthetic moving vehicles; TomTom credential missing | Reference roads; measured flow colors when supplied | Operational regression proves no spawn, stable line identities, closure color, failure fallback and removal; live browser flow still requires credentials |
| Transit | Configured regional GTFS-RT feeds | NOT VERIFIED; geography/feed dependent | Static schedules must remain reference, not live vehicles | Source catalog and vehicle endpoint inspected; feed acceptance pending |
| Bike Share | Public GBFS operators | BROKEN gateway route contract | Validated query transport | Red-to-green gateway regression; three real systems load upstream; actual app returns 87 Austin stations |
| Cameras | Registered camera catalogs/media | NOT VERIFIED per camera | Explicit snapshot/video/historical/unavailable classifications | Per-camera media acceptance pending |
| Street Level | Mapillary | CREDENTIAL MISSING | No invented imagery; coverage unavailable | Public client-token presence false; no client secret needed for viewing |
| Recent Imagery | NASA CMR HLS / VIIRS | NOT VERIFIED; date/coverage dependent | Historical observation dates retained | Catalog pagination/caps inspected; imagery rendering pending |
| Mapped ALPR Cameras | OSM-derived tiles / Overpass | NOT VERIFIED; zoom/region dependent | Static mapped infrastructure, never live video | Source and bounds guards inspected; browser acceptance pending |
| Radio | Radio station catalog | NOT VERIFIED | Station metadata; playback user initiated | Browser/media acceptance pending |
| Directions | Routing source | NOT VERIFIED | Route calculation, not measured movement | Browser acceptance pending |
| Military Installations | OSM reference features | NOT VERIFIED | Static reference geography | Browser acceptance pending |
| Military Awareness | Derived aircraft/vessel/installations | Depends on source layers | Inference remains separate from source observations | Browser acceptance pending |
| Wind | GFS/IFS model fields | NOT VERIFIED | Calculated weather model, not individual observations | Manifest source inspected; browser acceptance pending |
| Weather Radar | NOAA | NOT VERIFIED; coverage dependent | Public source with acquisition time | Browser acceptance pending |
| Weather Satellite | NOAA | NOT VERIFIED | Public imagery with acquisition time | Browser acceptance pending |
| Weather Lightning | NOAA weather feed | NOT VERIFIED; product coverage dependent | Empty coverage must remain honest | Browser acceptance pending |
| Storms / Cyclones | NOAA NHC | NOT VERIFIED; active-storm dependent | Public storm advisories | Browser acceptance pending |
| Datacenters | Bundled OSM-derived GeoJSONL | Static reference | Local dataset; no credential | Bundled source path inspected; browser acceptance pending |
| Dams | Bundled USACE/OSM-derived GeoJSONL | Static reference | Local dataset; no credential | Bundled source path inspected; browser acceptance pending |
| Submarine Cables | Bundled TeleGeography | Static reference | Keep attribution/license; no live vessel claim | Source composition inspected; browser acceptance pending |
| Bhote Koshi event | Bundled event study | Historical reference | Keep dates/context/license | Browser acceptance pending |
| Bhote Koshi locator | Bundled boundary/location | Static reference | No live claim | Browser acceptance pending |

Air Quality (OpenAQ), Events (GDELT/Wikimedia), and Nexus are on-demand panels rather than catalog layers. OpenAQ is locally unconfigured. Events and Nexus need separate interaction QA; Nexus must describe correlations as inference. Google 3D and Gemini acceptance are tracked separately by their respective integration owners.

## Security and follow-up

GBFS still restricts hosts and station document paths, rejects credential-bearing URLs, custom ports, fragments and query strings in upstream targets, refuses redirects and caps streamed responses. The application gateway is not relaxed. Provider status exposes metadata and booleans only. Missing credentials do not count as a repaired live integration. Remaining unverified rows require browser/network checks and are deliberately not marked working.
