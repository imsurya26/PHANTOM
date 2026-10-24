# Performance evidence

## PHANTOM flight replay, October 2026

The current Windows fleet workload has **not met** the target of 55 FPS on the
desktop or 30 FPS with 4x CPU throttling. The older Apple M5 figures below are
historical upstream results, not a claim about this machine or the current app.

The developer-only `scripts/profile-flight-replay.mjs` uses a captured historical
flight snapshot (7,411 records, 7,363 accepted aircraft). The snapshot is a test
fixture, never presented as a live provider. Its SHA-256 is
`83e7cda861dd2e815e3fb0d8ddc472ff80dd72fd5a251b3abb27be6a6ceb517b`.

The October 21 warm capture on AMD Radeon graphics (device `0x1681`, ANGLE
Direct3D 11), at 1440 x 900, measured:

| CPU setting   | Rendered FPS | Main-thread CPU | Used JS heap |
| ------------- | -----------: | --------------: | -----------: |
| Normal        |        22.48 |           88.7% |    117.0 MiB |
| 4x throttling |         1.45 |           99.4% |    116.0 MiB |

Evidence: `qa-artifacts/flight-replay/before-warm.json` and its two CPU profiles.
The earlier `before.json` includes shader startup and is unsuitable for a warm
comparison. `after-math.json` contains no completed samples and provides no
evidence of improvement.

The profile showed substantial Cesium billboard attribute packing and bounding
sphere work, with additional fleet interpolation, frustum culling, and detection
enumeration cost. Two exact-math changes address the latter work: normalized
frustum-plane sphere checks and a per-observation local-frame cache that
invalidates when coordinates change. Their correctness is covered by tests;
that alone does not establish an FPS improvement.

The controlled harness now fixes the Austin camera at 150 km, replays identical
observations, disables other layers, warms shaders before measurement, and
samples eight seconds of the same camera motion at normal and 4x CPU settings.
`PHANTOM_REPLAY_BASELINE=1` substitutes the prior Cesium math in this test browser
only. The optimized run uses the normal application modules. Run both against
the same development server, without other browser or test workloads. Results
from the earlier camera setup must not be used as the denominator for this pair.

### Controlled pair — October 23, 2026

Both runs completed on the same local development server using Chrome
155.0.8059.86 and the AMD ANGLE renderer above. Both accepted 7,363 aircraft
from the identical fixture and reported zero page errors. Other browser and test
workloads were stopped during measurement. The baseline substitutes the prior
Cesium visibility calculation and uncached local-frame calculation; the optimized
run uses the current application modules.

| CPU setting   | Prior FPS | Optimized FPS | Prior CPU | Optimized CPU | Prior heap | Optimized heap |
| ------------- | --------: | ------------: | --------: | ------------: | ---------: | -------------: |
| Normal        |     52.20 |         53.46 |     80.3% |         82.9% |  115.2 MiB |      107.3 MiB |
| 4x throttling |     11.68 |         18.87 |     97.3% |         94.4% |  116.8 MiB |       93.2 MiB |

Evidence: `qa-artifacts/flight-replay/controlled-before.json`,
`controlled-after.json`, and their corresponding `-1x.cpuprofile` and
`-4x.cpuprofile` files. Both reports have `complete: true`. The harness exits with
status 1 after writing these completed results because the 55/30 FPS performance
budgets are still unmet; this is a budget failure, not an incomplete capture.

The observed normal-speed change is small (about 2.4%); the throttled sample is
about 61.6% higher. This is one sequential pair, not a repeated statistical
benchmark. Browser cache, garbage collection, background operating-system work,
and sampling variation can affect results. Heap is an end-of-sample reading,
not a peak-memory or leak measurement. Do not interpret this pair as a universal
speedup, compare it directly with the earlier 22.48 FPS camera setup, or claim
that the target is achieved. Full-world, dense urban, combined-layer and mobile
device workloads still require separate acceptance measurements.

## Historical upstream baseline — Apple M5, August 2026

This page records one hardware-rendered Apple M5 comparison captured on 22
August 2026 in Chrome 150 at 1440 x 900. It is not a minimum hardware
specification and should not be used to predict performance on untested systems.
The original capture artifacts are not included here, so this page records
results rather than defining a runnable benchmark.

## Test context

The baseline was captured on 22 August 2026 with these conditions:

| Setting      | Value                                                |
| ------------ | ---------------------------------------------------- |
| Renderer     | Apple M5 Metal through the hardware ANGLE path       |
| Browser      | Chrome 150 in a fresh isolated profile               |
| Viewport     | 1440 x 900 at device pixel ratio 1                   |
| Focus        | Page foregrounded for controlled scenes              |
| Scene sample | 5 seconds of scripted motion, then 5 seconds at rest |
| Startup      | Browser cache disabled; three samples                |

The capture covered three startup samples, 16 cold layer scenarios with 14
measurements, 23 controlled option and stress scenes, and five
hardware-rendered overlay scenes.

## Startup

| Sample |  App ready | Initial settle | Load event | Motion / rest | Used JS heap |
| -----: | ---------: | -------------: | ---------: | ------------: | -----------: |
|      1 | 784.980 ms |   2,035.082 ms |   439.5 ms |   60 / 60 FPS |    102.9 MiB |
|      2 | 604.849 ms |   1,855.836 ms |   442.4 ms |   60 / 60 FPS |    111.6 MiB |
|      3 | 558.527 ms |   1,809.592 ms |   438.8 ms |   60 / 60 FPS |    105.1 MiB |
| Median | 604.849 ms |   1,855.836 ms |   439.5 ms |   60 / 60 FPS |    105.1 MiB |

The initial-settle measurement is the more useful launch reference because it
includes the first visual and data settling window. All three samples reached
the display ceiling during both motion and rest.

## Cold layer activation

Cold activation was measured separately from warm option switching. Live object
counts are included so that future runs can compare source populations before
attributing a difference to the client.

| Layer                                          |    Activation | Source count | Motion / rest | Used JS heap |
| ---------------------------------------------- | ------------: | -----------: | ------------: | -----------: |
| CCTV city                                      | 19,608.240 ms |           48 |   60 / 60 FPS |    192.7 MiB |
| Space Missions (report label: Rocket missions) |  3,581.066 ms |           26 |   60 / 60 FPS |    131.3 MiB |
| Radio                                          |  3,458.709 ms |          750 |   60 / 60 FPS |    124.8 MiB |
| Bikeshare                                      |  2,069.498 ms |          633 |   60 / 60 FPS |    157.4 MiB |
| Datacenters                                    |    817.693 ms |        4,362 | 59.6 / 60 FPS |    328.2 MiB |
| Flights                                        |    667.671 ms |          247 |   60 / 60 FPS |    118.4 MiB |
| Submarine cables                               |    614.727 ms |        2,629 |   60 / 60 FPS |    412.0 MiB |
| Military Flights                               |    557.113 ms |           68 |   60 / 60 FPS |    118.4 MiB |

CCTV had the largest cold activation cost in this capture. Submarine cables
used the most heap, followed by datacenters. Completed single-layer samples
generally reached 60 FPS, so activation time and heap separate these cases more
clearly than steady-state frame rate.

## Aircraft, detection, and Cockpit

| Scene                           |   Motion / rest |
| ------------------------------- | --------------: |
| Idle globe                      |     60 / 60 FPS |
| Flights, 2D                     |     60 / 60 FPS |
| Flights, 3D proximity           |     60 / 60 FPS |
| Flights, all 3D models          |     60 / 60 FPS |
| Military Flights, all 3D models |     60 / 60 FPS |
| Detection at 25%                | 39.3 / 41.1 FPS |
| Detection at 50%                | 37.4 / 39.8 FPS |
| Detection at 100%               | 34.4 / 35.5 FPS |
| Cockpit                         | 49.6 / 49.2 FPS |

The clean detection scenes processed 8,169 to 8,170 observations. Selected
labels rose from 14 at 25% density to 28 at 50% and 56 at 100%. The aircraft
rows came from an earlier loaded, foreground-controlled pass because the clean
rerun received no live aircraft rows.

## Visual styles and combined stress

| Scene                            |   Motion / rest |
| -------------------------------- | --------------: |
| Normal                           |     60 / 60 FPS |
| CRT (report label: Retro)        |     60 / 60 FPS |
| NVG (report label: Surveillance) |     60 / 60 FPS |
| FLIR (report label: Thermal)     |     49 / 60 FPS |
| Anime                            |   60 / 59.8 FPS |
| Noir                             |   47 / 56.6 FPS |
| Snow                             | 42.3 / 45.8 FPS |
| Combined static                  |   57.6 / 60 FPS |
| Combined operational             | 39.9 / 43.1 FPS |

The combined static scene rendered 11,575 objects, used 872.2 MiB of JavaScript
heap, and issued 48,665 text draws during motion and 54,106 at rest. The combined
operational sample contained 3,909 observations and two selected labels, but its
live aircraft and traffic rows were empty, so it remains a limited stress case.

Snow, Noir, dense detection, and text-heavy combined layers are the clearest
controlled comparison points for later optimization work.

## Keyed live sources

NASA FIRMS, AISStream, and TomTom were captured in a separate hardware-rendered
pass. The page was visible but was not the focused window, so these frame rates
must not be compared directly with the foreground-controlled scenes above.

| Source         |          Point-in-time population | Activation or coverage        |   Motion / rest |
| -------------- | --------------------------------: | ----------------------------- | --------------: |
| NASA FIRMS     | 100,430 detections in 3,557 cells | 30.0 s activation             | 32.1 / 55.2 FPS |
| AISStream      |                    12,000 vessels | 6.4 s activation              | 22.1 / 29.8 FPS |
| TomTom Traffic |                   4,222 road dots | 70% coverage, 2 decoded tiles | 45.0 / 51.7 FPS |

These populations change continuously. A future comparison must record the
live counts again and match the focus conditions.

## Controls for a future capture

Use the same controls before attributing a difference to the application:

1. Record the exact GPU renderer and reject software-rendered or unavailable GPU
   strings.
2. Use a 1440 x 900 viewport at device pixel ratio 1 and keep the page focused.
3. Measure cache-disabled startup separately from cold layer activation and warm
   option switching.
4. Repeat startup three times and compare medians.
5. Sample each option for 5 seconds in scripted motion and 5 seconds at rest.
6. Record live object counts before attributing a difference to the client.
7. Treat a live-source outage as missing coverage, not as evidence of low client
   rendering cost.

## What is not established yet

- This report does not establish Windows performance.
- The report does not record machine memory capacity, so it cannot support a
  minimum-memory recommendation.
- The report does not cover other GPU renderers or viewport configurations.
- Military Installations is outside this comparison because it requires close
  camera context.
- The keyed pass has no controlled rerun suitable for comparison with the
  option scenes.

Use this page as a regression baseline for one known hardware and browser
configuration, not as a compatibility guarantee.
