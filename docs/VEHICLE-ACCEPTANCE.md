# Vehicle and camera acceptance — 5 November 2026

## Implemented support

| Category | Data and visual contract | Camera support |
| --- | --- | --- |
| Commercial and military aircraft | Existing provider records; classification selects calibrated assets, with fallback visuals when type is unknown. | Follow, Chase when heading exists, Orbit, Top-down, Cinematic, existing aircraft cockpit, Free. |
| Helicopters, light aircraft, business jets, UAVs, widebody aircraft, turboprops | Six specialized assets: Bell 206, C172, Citation II, MQ-9, B789 and ATR72 (`src/data/aircraftClass.js`). These are representative class models, not verified exact airframes. Attribution remains in `public/models/README.md`. | Aircraft camera support applies where a tracked aircraft and cockpit entry context exist. |
| AIS vessels | Selected provider position and heading, with reported course as fallback. Current AIS renderer uses ship-shaped billboards; a bundled cargo-ship asset does not mean every AIS vessel renders a detailed model. | Simulated first-person, explicitly labeled. Eye is at least 8 m above plotted position and loaded terrain. No actual bridge geometry or video is implied. |
| Satellites | Existing orbit propagation and source attribution; not onboard telemetry. | Tracked Follow, Orbit, Top-down and Cinematic; Chase requires a reported heading and is unavailable without it. |
| Rockets | Existing mission metadata, replay and mission camera controls. Replay is distinct from live vehicle telemetry. | Existing mission/replay controller retains ownership; no generic live rocket cockpit is claimed. |
| Transit | Existing provider-backed public transit layer remains intact. | Existing transit inspection controls; no new universal transit cockpit claim. |
| Cars and trucks | Traffic flow measures road conditions, not individual vehicle positions (`src/layers/traffic/model.js`). Animated dots are visualization, not verified vehicle telemetry. | No first-person tracking of invented individual vehicles. |
| Submarines | No reliable individual submarine-position source is configured in this repository. | Unavailable; no fabricated underwater telemetry or geometry was added. |

Existing aircraft distance simplification, tracked model scale caps, orientation
and visual-position sampling remain intact. No additional high-poly assets or
unverified licensed downloads were introduced.

## Safety and ownership verification

First-person arrival now cancels immediately if the selected source disappears,
changes identity, jumps over 2 km, or another tracked camera takes ownership.
Generation checks prevent a cancelled arrival callback from restarting motion.
The arrival origin is cloned, so providers mutating a Cartesian position cannot
bypass jump detection. After arrival, the interpolated camera eye is clamped
against newly loaded terrain before every camera write. Unknown terrain or
photogrammetry meshes cannot be treated as a guaranteed collision surface.

The targeted Node run covered first-person, object-camera modes and existing
orientation controls: 33 tests passed, zero failed. Tests include late terrain,
source changes during arrival, mutable source positions, manual interruption,
reduced motion, navigation handoffs and listener cleanup. The source change
requires the parent task's final build/browser integration check. No new live
provider acceptance or hardware performance result is claimed by this document.
