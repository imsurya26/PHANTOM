import { BoundedCache } from '../cache/bounded.js';

// https://docs.openaq.org/using-the-api/api-key
// https://docs.openaq.org/using-the-api/rate-limits
// https://docs.openaq.org/resources/latest
const PREFIX = '/api/air-quality/';
const MAX_BYTES = 1024 * 1024;
const TTL = 5 * 60_000;
const text = (value) =>
  typeof value === 'string' ? value.slice(0, 200) : null;
const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const coord = (value, range) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Math.abs(value) <= range;
const failure = (status, state, message) =>
  Object.assign(new Error(message), { status, state });

function station(row) {
  if (
    !positiveId(row?.id) ||
    !coord(row.coordinates?.latitude, 90) ||
    !coord(row.coordinates?.longitude, 180)
  )
    return null;
  return {
    id: row.id,
    name: text(row.name),
    coordinates: {
      latitude: row.coordinates.latitude,
      longitude: row.coordinates.longitude,
    },
    provider: text(row.provider?.name),
    owner: text(row.owner?.name),
    sensors: (Array.isArray(row.sensors) ? row.sensors : [])
      .slice(0, 100)
      .filter((s) => positiveId(s?.id))
      .map((s) => ({
        id: s.id,
        parameter: text(s.parameter?.name),
        units: text(s.parameter?.units),
        displayName: text(s.parameter?.displayName),
      })),
    licenses: (Array.isArray(row.licenses) ? row.licenses : [])
      .slice(0, 20)
      .map((l) => ({
        name: text(l.name),
        attribution: text(l.attribution?.name),
      })),
  };
}

function parseRequest(url) {
  const latest = url.pathname === `${PREFIX}latest`;
  if (!latest && url.pathname !== `${PREFIX}locations`) return null;
  const allowed = latest ? ['locationId'] : ['lat', 'lon', 'radius'];
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
      throw failure(400, 'invalid-request', 'Invalid air quality query');
  }
  if (latest) {
    const raw = url.searchParams.get('locationId');
    const id = Number(raw);
    if (!/^\d+$/.test(raw || '') || !positiveId(id))
      throw failure(400, 'invalid-request', 'A valid locationId is required');
    return { id, key: `latest:${id}` };
  }
  const latRaw = url.searchParams.get('lat'),
    lonRaw = url.searchParams.get('lon');
  const lat = Number(latRaw),
    lon = Number(lonRaw),
    radius = Number(url.searchParams.get('radius') ?? 10000);
  if (
    !latRaw?.trim() ||
    !lonRaw?.trim() ||
    !coord(lat, 90) ||
    !coord(lon, 180) ||
    !Number.isInteger(radius) ||
    radius < 1 ||
    radius > 25000
  ) {
    throw failure(
      400,
      'invalid-request',
      'Valid lat, lon and radius (1–25000 meters) are required',
    );
  }
  return { lat, lon, radius, key: `locations:${lat}:${lon}:${radius}` };
}

/** Optional server-only OpenAQ v3 adapter. Values are measurements, never an invented AQI. */
export function airQualityPlugin({
  apiKey = process.env.OPENAQ_API_KEY,
  fetchImpl = fetch,
  now = Date.now,
  status,
} = {}) {
  const cache = new BoundedCache({
    maxEntries: 100,
    maxBytes: 4 * MAX_BYTES,
    ttlMs: TTL,
    now,
  });
  const inflight = new Map();
  let cooldownUntil = 0;
  // Conservative fixed windows remain below OpenAQ's free 60/min and 2000/hour.
  let minute = { at: now(), count: 0 },
    hour = { at: now(), count: 0 };
  const configured = typeof apiKey === 'string' && apiKey.trim().length > 0;
  async function upstream(path) {
    if (now() < cooldownUntil)
      throw failure(503, 'cooldown', 'OpenAQ is cooling down; try again later');
    if (now() - minute.at >= 60_000) minute = { at: now(), count: 0 };
    if (now() - hour.at >= 3600_000) hour = { at: now(), count: 0 };
    if (minute.count >= 25 || hour.count >= 900)
      throw failure(
        429,
        'rate-limited',
        'OpenAQ request budget reached; try again later',
      );
    minute.count += 1;
    hour.count += 1;
    const response = await fetchImpl(new URL(path, 'https://api.openaq.org'), {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401 || response.status === 403) {
        status?.record('openaq', 'AUTH_ERROR');
        cooldownUntil = now() + TTL;
        throw failure(
          503,
          'authentication-required',
          'OpenAQ rejected the server API key',
        );
      }
      if (response.status === 429) {
        status?.record('openaq', 'RATE_LIMITED');
        // Wait through a full hourly window, including the hourly free-tier ceiling.
        cooldownUntil = now() + 3600_000;
        throw failure(
          503,
          'rate-limited',
          'OpenAQ rate limit reached; try again later',
        );
      }
      throw failure(502, 'unavailable', 'OpenAQ is temporarily unavailable');
    }
    const length = Number(response.headers.get('content-length'));
    if (length > MAX_BYTES || !response.body) {
      await response.body?.cancel();
      throw new Error('Invalid response');
    }
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw new Error('Response too large');
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(data?.results) || data.results.length > 1000)
      throw new Error('Invalid response');
    return data;
  }
  async function load(query) {
    try {
      let results,
        extra = {};
      if (query.id) {
        const details = await upstream(`/v3/locations/${query.id}`);
        const location = station(details.results[0]);
        if (!location || location.id !== query.id)
          throw new Error('Invalid location');
        const data = await upstream(
          `/v3/locations/${query.id}/latest?limit=100&page=1`,
        );
        if (data.results.length > 100) throw new Error('Too many measurements');
        results = data.results
          .filter(
            (r) =>
              r.locationsId === query.id &&
              positiveId(r.sensorsId) &&
              typeof r.value === 'number' &&
              Number.isFinite(r.value) &&
              typeof r.datetime?.utc === 'string' &&
              Number.isFinite(Date.parse(r.datetime.utc)),
          )
          .map((r) => {
            const sensor = location.sensors.find((s) => s.id === r.sensorsId);
            return {
              sensorId: r.sensorsId,
              locationId: query.id,
              value: r.value,
              observedAt: r.datetime.utc,
              parameter: sensor?.parameter ?? null,
              units: sensor?.units ?? null,
              coordinates: location.coordinates,
            };
          });
        if (results.length !== data.results.length)
          throw new Error('Invalid measurements');
        extra = {
          location,
          truncated: Number(data.meta?.found) > results.length,
        };
      } else {
        const params = new URLSearchParams({
          coordinates: `${query.lat},${query.lon}`,
          radius: String(query.radius),
          limit: '50',
          page: '1',
        });
        const data = await upstream(`/v3/locations?${params}`);
        results = data.results.slice(0, 50).map(station).filter(Boolean);
        if (results.length !== data.results.length)
          throw new Error('Invalid locations');
        extra = { truncated: Number(data.meta?.found) > results.length };
      }
      const payload = {
        state: 'available',
        source: 'OpenAQ',
        fetchedAt: new Date(now()).toISOString(),
        results,
        ...extra,
      };
      cache.set(query.key, payload);
      status?.record('openaq', 'AVAILABLE');
      return payload;
    } catch (error) {
      if (!error.state) status?.record('openaq', 'OUTAGE');
      cooldownUntil = Math.max(cooldownUntil, now() + 30_000);
      throw error.state
        ? error
        : failure(502, 'unavailable', 'OpenAQ is temporarily unavailable');
    }
  }
  const handler = async (req, res, next) => {
    if (!req.url?.startsWith(PREFIX)) return next();
    const send = (status, payload) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(payload));
    };
    try {
      const query = parseRequest(new URL(req.url, 'http://localhost'));
      if (!query) return next();
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        throw failure(405, 'invalid-request', 'GET required');
      }
      if (!configured)
        return send(200, {
          state: 'key-required',
          source: 'OpenAQ',
          message:
            'Configure OPENAQ_API_KEY on the server to enable air quality',
          results: [],
        });
      if (status && !status.enabled('openaq'))
        return send(503, { state: 'disabled', source: 'OpenAQ', results: [] });
      const cached = cache.get(query.key);
      if (cached) return send(200, { ...cached, cached: true });
      if (!inflight.has(query.key)) {
        if (inflight.size >= 4)
          throw failure(
            503,
            'busy',
            'OpenAQ request capacity reached; try again later',
          );
        inflight.set(
          query.key,
          load(query).finally(() => inflight.delete(query.key)),
        );
      }
      return send(200, { ...(await inflight.get(query.key)), cached: false });
    } catch (error) {
      return send(error.status || 502, {
        source: 'OpenAQ',
        state: error.state || 'unavailable',
        message: error.state
          ? error.message
          : 'OpenAQ is temporarily unavailable',
        results: [],
      });
    }
  };
  return {
    name: 'openaq-air-quality',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
