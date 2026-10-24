# Historical milestone: performance and usability rework — 16 October 2026

This document records the 16 October milestone, not the current implementation or validation status. Its navigation layout, measurements and test totals are historical. For the superseding work and remaining acceptance checks, see [core integration audit](CORE_INTEGRATION_AUDIT.md), [layer audit](LAYER_AUDIT.md), [performance report](PERFORMANCE.md) and [current validation status](PHANTOM-VALIDATION.md).

## Audit before implementation

The code audit and original production-browser samples preceded implementation. Existing collection rendering, render governor, viewport LOD, bounded provider caches and on-demand Nexus were retained.

| Priority | Finding | Change |
| --- | --- | --- |
| Critical | No critical unbounded render loop established by the audit | No unsupported claim of a universal root cause |
| High | FIRMS rebuilt up to 3,600 ground-cell entities during camera-driven LOD changes | Stable cell and detection reconciliation; unchanged viewport adds/removes zero entities in the regression test |
| High | Heavy optional functionality imported during startup | Voice, owner settings and PHANTOM panels load on demand; core catalog remains eager |
| High | Competing legacy panels and seven primary destinations obscured basic tasks | Five desktop destinations, four mobile destinations, explicit advanced workspace |
| High | Missing-key language leaked into normal exploration | Optional settings and friendly feature-unavailable messages |
| Medium | Empty aircraft feed held continuous rendering | Release hold while empty; restore when records arrive |
| Medium | Scheduled polling ignored offline/hidden/constrained state | Suspend automatic work hidden/offline; constrained polling interval multiplied by four |
| Medium | No actionable onboarding or help | First-open choices, optional seven-step tour, Help examples and user guide |
| Low | No opt-in consolidated developer snapshot | Explicit diagnostics query parameter; no normal-visit diagnostic observers |

## Measurement limitations

The Chrome harness uses ANGLE SwiftShader, a software GPU. Browser frame rates are therefore not representative desktop GPU performance. The first baseline's mobile-emulation switch reloaded the page, so it is incomplete; `before-corrected.json` fixes this and uses the actual registered ship and weather IDs. Live provider responses are not controlled fixtures. Missing credentials, coverage and network failures stay visible in each case's layer status.

The test records both browser animation callbacks and actual Cesium renders; a low idle render rate can be desirable. Main-thread CPU is sampled browser task time, not system CPU. GPU utilization is unavailable in this harness. Resource sizes include browser-reported transfer sizes, which are not authoritative for cross-origin billing. First readiness is loading-screen dismissal, not completion of every external map tile.

## Recorded browser samples

These are software-rendered live-network samples, not controlled speedup claims. The default scope mask was also disabled in the new UI, changing the presentation. Requests and heap vary with returned records and map tiles. Some cases regress in this run; representative GPU profiling is still required. CPU ratios from the original harness used the animation interval instead of the complete CDP measurement interval and are not valid utilization figures; they are excluded here.

| Scenario | Before rendered FPS | After rendered FPS | Before heap MiB | After heap MiB | Before requests | After requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Empty idle | 1.51 | 1.88 | 45.3 | 43.8 | 52 | 28 |
| Empty moving | 1.65 | 1.90 | 49.2 | 45.2 | 39 | 33 |
| Aircraft | 0.58 | 0.73 | 92.8 | 76.3 | 55 | 42 |
| Aircraft + ships | 0.71 | 0.96 | 87.3 | 95.7 | 42 | 49 |
| Weather | 0.80 | 0.84 | 91.0 | 85.5 | 66 | 31 |
| Fires | 0.96 | 1.29 | 106.4 | 91.3 | 40 | 45 |
| Mixed layers | 0.95 | 1.15 | 126.3 | 97.6 | 60 | 54 |
| Nexus panel | 1.47 | 0.92 | 124.8 | 102.3 | 58 | 30 |
| Street View panel | 1.40 | 1.32 | 143.2 | 110.2 | 66 | 40 |
| Narrow viewport | 2.30 | 1.65 | 147.0 | 120.7 | 97 | 51 |
| 4× CPU throttle | 2.45 | 1.35 | 171.8 | 126.6 | 52 | 21 |

First readiness was 7.632 seconds before and 3.853 seconds after. The main application chunk decreased from 2,838,589 bytes to approximately 2,695,150 bytes (about 5%). Neither result certifies a fixed startup improvement across devices. The 55–60 FPS desktop and 30+ FPS lower-end targets are **not verified**. The street-level panel test does not certify authenticated imagery playback; the fire case may be unavailable without an owner credential.

Initial full suite: 6,304 tests, 6,292 passed, 10 skipped and two outdated assertions. Both affected files passed after updating the empty-flight render-demand contract and user-facing map message. The pending-load voice disposal check also caught an undefined cleanup reference, now corrected. All 14 isolated allocation checks passed. Desktop/mobile interaction, keyboard focus, grouped layers, search suggestions, lazy voice, tour, provider status, offline behavior, reduced motion and visible attribution passed browser checks.

Final main-suite rerun: **6,304 tests, 6,294 passed, 10 skipped, zero failures**. The corrected focused set passed 39/39. Production build, all 1,327 adopted-file formatting checks, import/package ownership checks and whitespace checks passed. The final secret scan checked 1,852 source files, Git history and 443 build artifacts with zero findings. No local private credential values were present for exact-value comparison.

## Corrected CPU measurement

The corrected follow-up sample uses CDP's complete measurement interval (`after-cpu-corrected.json`): empty idle 16.8%, empty moving 9.3%, aircraft 99.9%, aircraft + ships 91.0%, weather 87.8%, fires 49.0%, mixed layers 56.8%, Nexus panel 38.1%, Street View panel 48.8%, narrow viewport 63.0%, and 4× CPU throttle 96.1% browser main-thread task occupancy. These are not system-wide CPU or GPU utilization. Aircraft-heavy samples still show substantial main-thread load, so the performance goal remains open; this pass must not be described as achieving smooth 60 FPS. There is no trustworthy matching before-CPU sample.

## Component provenance

Magic UI MCP was not available among the callable tools. No Magic UI package or template was installed. The lightweight panel reveal follows the general Blur Fade idea reviewed at https://magicui.design/docs/components/blur-fade, implemented as a local 120 ms opacity/translation transition without blur; reduced-motion disables animations. There are no decorative polling or animation loops in the new shell.

Universal search covers places, coordinates and airport queries through existing geocoding, plus bounded already-loaded object suggestions. It is not an exhaustive global aircraft/ship/infrastructure index. Timeline exposes the existing weather frame and scene controls; global historical aircraft/ship replay requires a history source and is not simulated.

## Release work recorded at this milestone

- Representative GPU and lower-end-device testing is still needed to certify 55–60/30+ FPS targets.
- The core layer catalog remains eagerly imported; further splitting needs lifecycle/parameter contract work.
- Live credential-dependent provider success requires locally configured owner credentials and verification. No chat credentials were imported.
- Subsequent work implemented the Gemini browser voice integration. Authenticated end-to-end acceptance remains pending fresh local credentials; production owner authentication remains separate release work. See the current core integration audit for verification details.
- A universal redesigned inspector and global historical replay are not supplied by this pass; existing object inspectors and source-supported controls remain available.
