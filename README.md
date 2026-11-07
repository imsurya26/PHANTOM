# PHANTOM

PHANTOM is a browser-based Earth exploration application that brings maps, public observations and geographic context into an interactive 3D globe. It builds on [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) by Bilawal Sidhu, with upstream attribution retained.

## Overview

Search for a place, choose map layers, inspect reported objects and explore nearby information. The globe starts without API credentials; optional providers enable additional imagery, data and voice capabilities. Available coverage depends on the source, region, network and deployment configuration.

## Features

- Cesium globe with map selection, place and coordinate search, layers and shareable views.
- Aircraft, satellite, earthquake and other geographic layers, with source information and object details.
- Tracked-object camera controls, aircraft cockpit views and simulated vessel first-person views.
- Street Level imagery and public CCTV panels, with coverage and media availability determined by their providers.
- Radio directory, transit and bike-share layers, weather overlays and attributed infrastructure data.
- Responsive PHANTOM navigation, optional voice controls, offline notice and printable session summaries.

Offline mode displays a reconnect notice; it does not provide an offline globe or cache live feeds. Simulated viewpoints and illustrative models are not onboard video or authoritative vehicle geometry.

## Technology Stack

JavaScript ES modules, CesiumJS, Vite, HTML/CSS and Node.js provider adapters. Tests use the Node.js test runner and Puppeteer. Vercel serves the production build with Node API functions.

## Prerequisites

- **Node.js 24.14.0 or later within 24.x, or Node.js 26.x**, with npm.
- Git and a modern browser with WebGL support.
- Network access for maps and external data. Optional services may require accounts and credentials.

## Installation

```bash
git clone https://github.com/imsurya26/PHANTOM.git
cd PHANTOM
npm ci
npm run doctor -- --json
```

## Environment Variables

No API key is required to start the local globe. For optional integrations, copy the names needed from [.env.example](.env.example) into an ignored `.env.local` file or set them in your shell. Restart the development server after configuration changes.

| Capability | Environment variable names |
| --- | --- |
| Cesium imagery/terrain | `CESIUM_ION_TOKEN` |
| Google map tiles | `GOOGLE_MAPS_API_KEY` |
| Google Places server access | `GOOGLE_MAPS_SERVER_API_KEY` |
| Mapillary Street Level | `MAPILLARY_CLIENT_TOKEN` |
| OpenSky aircraft | `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET` |
| AISStream vessels | `AISSTREAM_API_KEY` |
| NASA FIRMS fires | `FIRMS_MAP_KEY` |
| OpenAQ air quality | `OPENAQ_API_KEY` |
| TomTom traffic | `TOMTOM_API_KEY` |
| Gemini voice | `GEMINI_API_KEY` |
| Retained OpenAI integration | `OPENAI_API_KEY` |
| Optional Launch Library authentication | `LL2_API_TOKEN` |
| Provider disable list | `PHANTOM_DISABLED_PROVIDERS` |
| Hosted admission controls | `PHANTOM_PUBLIC_ORIGIN`, `PHANTOM_REDIS_REST_URL`, `PHANTOM_REDIS_REST_TOKEN` |

The Cesium, Google map tiles and Mapillary client credentials are browser-visible. Restrict them at the provider to the necessary permissions and allowed URLs. Private credentials belong on the server, never in `VITE_*` variables, committed files or browser storage. A configured credential does not establish that its provider is reachable. See [security guidance](SECURITY.md) and the [deployment guide](docs/VERCEL_DEPLOYMENT.md).

## Local Development

```bash
npm run dev
```

Open `http://localhost:4173` (or the address printed by Vite). Start with **Search Earth** and **Layers**; additional panels are available through **More**. The development server binds to localhost by default.

## Build

```bash
npm run build
npm run preview
```

Vite writes the build to `dist/`. Local preview checks the built application; it does not reproduce Vercel's serverless execution environment.

## Testing

```bash
npm test
npm run doctor -- --json
npm run format:check
npm run check:boundaries
npm run security:scan
npm run security:scan -- --artifacts
```

Run the artifact scan after building. The security scanner checks source and Git history; CI fetches full history. No separate `lint` or `typecheck` script is defined.

Browser checks require a running application and Chrome. Puppeteer installs its browser during a normal dependency installation. With preview running at `http://localhost:4173`, representative gates include:

```bash
npm run qa:street-level:fixtures -- --strict --url http://localhost:4173
npm run qa:panel-resize -- --url http://localhost:4173
npm run qa:perf -- --url http://localhost:4173
```

Additional scripts cover flight details, object cameras, map selection and offline/print behavior. Set `QA_BASE_URL` to the running preview URL for those gates. Test results are specific to the revision and environment tested; local browser checks do not certify every external provider or device.

## Deployment

Use the existing Vercel project connected to this repository. [vercel.json](vercel.json) configures Vite, the build command `npx vite build --config build/vercel.config.js`, the `dist` output directory and `/api/*` routing to the Node API. Use Node 24.x and configure production environment variables in Vercel.

Set `PHANTOM_PUBLIC_ORIGIN` to the exact HTTPS production origin. The admitted public services require shared Redis REST configuration; missing admission configuration denies protected requests. Browser-visible credential changes require a rebuild. See [Vercel deployment](docs/VERCEL_DEPLOYMENT.md) for supported aliases and provider boundaries.

Local receiver access, credential editing, MCP and debug endpoints are not exposed by the public adapter. AISStream needs a persistent collector and shared snapshots; a short-lived serverless function cannot replace that collector. Unsupported or unavailable sources must remain visibly unavailable. Verify the deployed revision, globe, assets and required API responses before treating a deployment as accepted.

## Data Sources

Sources include OpenStreetMap, Esri, adsb.lol/OpenSky, CelesTrak, USGS, NOAA, public transport feeds, Radio Browser and regional camera operators. Google, Cesium, Mapillary and other optional integrations have separate access and usage terms.

Coverage, timestamps and availability vary. Satellite positions are calculated from orbital elements; road traffic can be simulated from aggregate data. Camera imagery may be a snapshot, clip or live stream. Flight routes may be inferred; missing schedules and other unavailable fields are not guaranteed data. The application is for exploration, not navigation or operational decision-making.

See [DATA_SOURCES.md](DATA_SOURCES.md) for source attribution and licensing, and [model attribution](public/models/README.md) for bundled 3D assets.

## Project Structure

- `src/` — application, PHANTOM shell, globe layers and UI.
- `server/` and `api/` — local provider services and hosted API adapters.
- `build/` — required Vite configuration and build helpers.
- `public/` — static assets, models and offline notice.
- `scripts/` — setup, validation and browser checks.
- `docs/` — user guidance, architecture and acceptance records.

## License

Source code is licensed under the [MIT License](LICENSE), retaining copyright attribution to Bilawal Sidhu. Third-party datasets and visual assets retain their own licenses. In particular, bundled datasets may have non-commercial restrictions; the MIT license does not grant rights to those datasets. Preserve source and model attribution and review their terms before reuse.
