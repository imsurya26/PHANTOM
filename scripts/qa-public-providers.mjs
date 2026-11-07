import { mkdir, writeFile } from 'node:fs/promises';
import { decodeFeedMessage } from '../src/data/gtfsRealtime.js';

// Small, read-only upstream probes. No keys, media playback, retries or paid APIs.
const probes = [
  [
    'USGS',
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    (bytes) => {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (body.type !== 'FeatureCollection' || !Array.isArray(body.features))
        throw new Error('Invalid GeoJSON');
      return {
        records: body.features.length,
        generated: body.metadata?.generated ?? null,
      };
    },
  ],
  [
    'CelesTrak',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
    (bytes) => {
      const lines = new TextDecoder().decode(bytes).trim().split(/\r?\n/);
      const records = lines.filter((line) => /^1 \d/.test(line)).length;
      if (
        !records ||
        lines.filter((line) => /^2 \d/.test(line)).length !== records
      )
        throw new Error('Invalid TLE pairs');
      return { records };
    },
  ],
  [
    'ADS-B.lol',
    'https://api.adsb.lol/v2/point/13/80/25',
    (bytes) => {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (!Array.isArray(body.ac)) throw new Error('Missing aircraft array');
      return { records: body.ac.length, providerNow: body.now ?? null };
    },
  ],
  [
    'Radio Browser',
    'https://de1.api.radio-browser.info/json/stations/search?has_geo_info=true&is_https=true&hidebroken=true&limit=3',
    (bytes) => {
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (
        !Array.isArray(body) ||
        !body.every(
          (row) =>
            typeof row.stationuuid === 'string' && typeof row.name === 'string',
        )
      )
        throw new Error('Invalid catalog');
      return { records: body.length, playbackTested: false };
    },
  ],
  [
    'MBTA',
    'https://cdn.mbta.com/realtime/VehiclePositions.pb',
    (bytes) => {
      const body = decodeFeedMessage(bytes);
      if (
        !body ||
        !Array.isArray(body.entities) ||
        body.truncated ||
        !body.header?.version
      )
        throw new Error('Invalid GTFS realtime feed');
      return {
        records: body.entities.length,
        providerTimestamp: body.header?.timestamp ?? null,
      };
    },
  ],
];
const results = [];
for (const [provider, url, validate] of probes) {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'PHANTOM-acceptance/1.0' },
    });
    if (!response.ok) {
      results.push({
        provider,
        checkedAt,
        state: 'unavailable',
        httpStatus: response.status,
      });
      continue;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Response exceeds probe budget');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    results.push({
      provider,
      checkedAt,
      state: 'schema-passed',
      httpStatus: response.status,
      bytes: size,
      ...validate(bytes),
    });
  } catch (error) {
    results.push({
      provider,
      checkedAt,
      state: 'unavailable',
      reason: error.cause?.code || error.name,
      message: error.message,
    });
  }
}
await mkdir('qa-artifacts/public-providers', { recursive: true });
await writeFile(
  'qa-artifacts/public-providers/results.json',
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
// A reachable script is not a successful acceptance gate when a provider failed.
if (results.some((result) => result.state !== 'schema-passed'))
  process.exitCode = 1;
