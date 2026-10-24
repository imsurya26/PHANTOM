import { BoundedCache } from '../cache/bounded.js';
import { readResponseJsonCapped } from './common/http.js';

const TEN_MINUTES = 600_000;
const SOURCES = Object.freeze({
  news: {
    source: 'GDELT',
    kind: 'News mentions',
    attribution: 'The GDELT Project; articles retain publisher rights.',
  },
  places: {
    source: 'Wikipedia',
    kind: 'Reference context',
    attribution:
      'Wikipedia contributors; linked articles retain their licenses.',
  },
});

export function parseSignalQuery(params) {
  if (
    [...params.keys()].some((key) => !['lat', 'lon', 'q'].includes(key)) ||
    ['lat', 'lon', 'q'].some((key) => params.getAll(key).length > 1)
  )
    return null;
  const rawLat = params.get('lat');
  const rawLon = params.get('lon');
  if (!rawLat?.trim() || !rawLon?.trim()) return null;
  const numeric = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (!numeric.test(rawLat) || !numeric.test(rawLon)) return null;
  const lat = Number(rawLat),
    lon = Number(rawLon);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  const query = (params.get('q') || '').trim();
  if (query.length > 80 || (query && !/^[\p{L}\p{N} ,.'-]{2,80}$/u.test(query)))
    return null;
  // Coarse cells contain cache cardinality without pretending exact-point results.
  return {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
    query,
  };
}

function publicLink(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function normalizeNews(payload) {
  if (!Array.isArray(payload?.articles))
    throw new Error('Invalid news payload');
  return payload.articles.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid news item');
    const url = publicLink(item.url);
    if (!url || typeof item.title !== 'string' || !item.title.trim()) return [];
    const rawDate = String(item.seendate || '');
    const stamp = /^\d{8}T\d{6}Z$/.test(rawDate)
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}T${rawDate.slice(9, 11)}:${rawDate.slice(11, 13)}:${rawDate.slice(13, 15)}Z`
      : null;
    return [
      {
        title: item.title.slice(0, 240),
        url,
        publisher: new URL(url).hostname,
        indexedAt: stamp && Number.isFinite(Date.parse(stamp)) ? stamp : null,
        confidence: 'Unverified news mention',
      },
    ];
  });
}

export function normalizePlaces(payload) {
  if (!Array.isArray(payload?.query?.geosearch))
    throw new Error('Invalid places payload');
  return payload.query.geosearch.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== 'object')
      throw new Error('Invalid place item');
    if (
      !Number.isSafeInteger(item.pageid) ||
      item.pageid < 1 ||
      typeof item.title !== 'string' ||
      !Number.isFinite(item.lat) ||
      !Number.isFinite(item.lon) ||
      Math.abs(item.lat) > 90 ||
      Math.abs(item.lon) > 180
    )
      return [];
    return [
      {
        title: item.title.slice(0, 240),
        url: `https://en.wikipedia.org/?curid=${item.pageid}`,
        lat: item.lat,
        lon: item.lon,
        distanceM:
          Number.isFinite(item.dist) && item.dist >= 0
            ? Math.round(item.dist)
            : null,
      },
    ];
  });
}

/** Provider-isolated cooldowns, coalescing and strictly bounded stale retention. */
export function createSignalsService({
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const cache = new BoundedCache({
    maxEntries: 200,
    maxBytes: 2_000_000,
    ttlMs: TEN_MINUTES * 6,
    now,
  });
  const inflight = new Map();
  const circuits = {
    news: { failures: 0, until: 0 },
    places: { failures: 0, until: 0 },
  };
  const nextRequestAt = { news: 0, places: 0 };
  const activeProviders = new Set();
  async function read(kind, key, url, normalize) {
    const cached = cache.get(key);
    const base = SOURCES[kind];
    if (cached && now() - cached.fetchedAt < TEN_MINUTES)
      return {
        ...base,
        ...cached,
        status: cached.items.length ? 'ready' : 'empty',
      };
    const fallback = () =>
      cached
        ? { ...base, ...cached, status: 'stale' }
        : { ...base, status: 'unavailable', fetchedAt: null, items: [] };
    if (circuits[kind].until > now()) return fallback();
    if (inflight.has(key)) return inflight.get(key);
    if (activeProviders.has(kind)) return fallback();
    // Cache misses cannot turn many distinct user queries into an upstream burst.
    if (nextRequestAt[kind] > now()) return fallback();
    if (inflight.size >= 4) return fallback();
    nextRequestAt[kind] = now() + 5000;
    activeProviders.add(kind);
    const request = Promise.resolve().then(async () => {
      try {
        const signal = AbortSignal.timeout(8000);
        const response = await fetchImpl(url, {
          signal,
          redirect: 'error',
          headers: {
            'User-Agent': 'PHANTOM/0.1 (Earth context explorer)',
            Accept: 'application/json',
          },
        });
        if (!response.ok) throw new Error('Provider unavailable');
        const items = normalize(
          await readResponseJsonCapped(response, 512_000, signal),
        );
        const entry = { items, fetchedAt: now() };
        cache.set(key, entry);
        circuits[kind] = { failures: 0, until: 0 };
        return { ...base, ...entry, status: items.length ? 'ready' : 'empty' };
      } catch {
        const circuit = circuits[kind];
        circuit.failures++;
        circuit.until =
          now() +
          Math.min(300_000, 15_000 * 2 ** Math.min(circuit.failures - 1, 5));
        return fallback();
      } finally {
        activeProviders.delete(kind);
        inflight.delete(key);
      }
    });
    inflight.set(key, request);
    return request;
  }
  return {
    async query({ lat, lon, query }) {
      const newsParams = new URLSearchParams({
        query: query
          ? `"${query.replace(/["\\]/g, ' ')}"`
          : '(wildfire OR earthquake OR cyclone)',
        mode: 'artlist',
        format: 'json',
        maxrecords: '10',
        sort: 'datedesc',
        timespan: '48h',
      });
      const wikiParams = new URLSearchParams({
        action: 'query',
        list: 'geosearch',
        gscoord: `${lat}|${lon}`,
        gsradius: '10000',
        gslimit: '8',
        format: 'json',
      });
      const [news, places] = await Promise.all([
        read(
          'news',
          `news:${query.toLowerCase()}`,
          `https://api.gdeltproject.org/api/v2/doc/doc?${newsParams}`,
          normalizeNews,
        ),
        read(
          'places',
          `places:${lat}:${lon}`,
          `https://en.wikipedia.org/w/api.php?${wikiParams}`,
          normalizePlaces,
        ),
      ]);
      return {
        location: {
          lat,
          lon,
          radiusM: 10000,
          precision: '0.01 degree cache cell',
        },
        query: query || 'Global wildfire, earthquake and cyclone mentions',
        news,
        places,
      };
    },
  };
}

export function signalsPlugin({ service = createSignalsService() } = {}) {
  const install = (server) => {
    server.middlewares.use('/api/phantom/signals', async (req, res) => {
      const send = (status, body) => {
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(body));
      };
      if (req.method !== 'GET')
        return send(405, { error: 'Only GET is supported.' });
      const url = new URL(req.url || '/', 'http://internal');
      if (url.pathname !== '/')
        return send(404, { error: 'Unknown endpoint.' });
      const query = parseSignalQuery(url.searchParams);
      if (!query)
        return send(400, {
          error:
            'Provide valid latitude, longitude and an optional plain-language topic of 2–80 characters.',
        });
      try {
        const result = await service.query(query);
        if (!res.destroyed) send(200, result);
      } catch {
        if (!res.destroyed)
          send(503, {
            error:
              'Context is temporarily unavailable. The map remains available.',
          });
      }
    });
  };
  return {
    name: 'phantom-signals',
    configureServer: install,
    configurePreviewServer: install,
  };
}
