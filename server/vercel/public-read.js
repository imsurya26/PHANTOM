import { normalizeAdsbLolPointResponse } from '../../src/data/adsbLolFallback.js';
import { readResponseJsonCapped } from '../providers/common/http.js';

const ROUTES = new Set(['/api/flights', '/api/military', '/api/geocode']);

/** Public, keyless reads only. No user-supplied upstream URLs or credentials. */
export function createPublicReadHandler({
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const cache = new Map();
  const pending = new Map();
  function reply(res, code, body, headers = {}) {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    for (const [key, value] of Object.entries(headers))
      res.setHeader(key, value);
    res.end(JSON.stringify(body));
    return true;
  }
  async function load(key, url, ttl, transform, limit) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttl) return hit;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 16) throw new Error('Busy');
    const task = (async () => {
      const signal = AbortSignal.timeout(12000);
      const response = await fetchImpl(url, {
        signal,
        redirect: 'error',
        headers: {
          'User-Agent': 'PHANTOM/1.0 (https://phantom-lake-two.vercel.app)',
        },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Upstream unavailable');
      }
      const payload = transform(
        await readResponseJsonCapped(response, limit, signal),
      );
      const entry = { payload, at: now() };
      if (cache.size >= 128) cache.delete(cache.keys().next().value);
      cache.set(key, entry);
      return entry;
    })();
    pending.set(key, task);
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  }
  return async (req, res) => {
    const url = new URL(req.url || '/', 'https://phantom.invalid');
    const path = url.pathname;
    if (!ROUTES.has(path)) return false;
    if (req.method !== 'GET')
      return reply(res, 405, { error: 'GET required' }, { Allow: 'GET' });
    const params = url.searchParams;
    const permitted =
      path === '/api/flights'
        ? ['lat', 'lon']
        : path === '/api/geocode'
          ? ['q', 'bounds']
          : [];
    if (
      [...params.keys()].some(
        (key) => !permitted.includes(key) || params.getAll(key).length !== 1,
      )
    )
      return reply(res, 400, { error: 'Invalid query' });
    let key, upstream, ttl, transform, headers, maxBytes;
    if (path === '/api/flights') {
      const hasAnchor = params.has('lat') || params.has('lon');
      const lat = hasAnchor ? Number(params.get('lat')) : 30.2672;
      const lon = hasAnchor ? Number(params.get('lon')) : -97.7431;
      if (
        (hasAnchor &&
          (!params.get('lat')?.trim() || !params.get('lon')?.trim())) ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        return reply(res, 400, {
          error: 'Valid latitude and longitude required',
        });
      const anchor = `${Math.round(lat * 4) / 4}/${Math.round(lon * 4) / 4}/250`;
      key = `flights:${anchor}`;
      upstream = `https://api.adsb.lol/v2/point/${anchor}`;
      ttl = 15000;
      maxBytes = 8 * 1024 * 1024;
      transform = (data) => {
        if (!Array.isArray(data?.ac))
          throw new Error('Invalid aircraft response');
        return normalizeAdsbLolPointResponse(data);
      };
      headers = {
        'X-Feed-Source': 'adsb.lol',
        'X-Flight-Source': 'adsb.lol',
        'X-Flight-Coverage':
          'regional snapshot within 250 nautical miles of view',
      };
    } else if (path === '/api/military') {
      key = 'military';
      upstream = 'https://api.adsb.lol/v2/mil';
      ttl = 15000;
      maxBytes = 8 * 1024 * 1024;
      transform = (data) => {
        if (!Array.isArray(data?.ac))
          throw new Error('Invalid military response');
        return data;
      };
      headers = { 'X-Feed-Source': 'adsb.lol' };
    } else {
      const q = (params.get('q') || '').trim();
      if (!q || q.length > 200)
        return reply(res, 400, {
          error: 'Query must contain 1–200 characters',
        });
      key = `geocode:${q.toLowerCase()}`;
      upstream = `https://photon.komoot.io/api/?${new URLSearchParams({ q, limit: '5' })}`;
      ttl = 3600000;
      maxBytes = 512 * 1024;
      transform = (data) => {
        if (!Array.isArray(data?.features))
          throw new Error('Invalid search response');
        const results = data.features
          .slice(0, 5)
          .filter(
            (f) =>
              Number.isFinite(f.geometry?.coordinates?.[0]) &&
              Number.isFinite(f.geometry?.coordinates?.[1]),
          )
          .map((f) => ({
            formatted_address: [
              f.properties?.name,
              f.properties?.city,
              f.properties?.country,
            ]
              .filter(Boolean)
              .join(', '),
            place_id: String(f.properties?.osm_id || ''),
            geometry: {
              location: {
                lat: f.geometry.coordinates[1],
                lng: f.geometry.coordinates[0],
              },
            },
          }));
        return { status: results.length ? 'OK' : 'ZERO_RESULTS', results };
      };
      headers = { 'X-Feed-Source': 'Photon / OpenStreetMap' };
    }
    try {
      const entry = await load(key, upstream, ttl, transform, maxBytes);
      return reply(res, 200, entry.payload, {
        ...headers,
        'X-Feed-Age-Ms': String(Math.max(0, now() - entry.at)),
        'Vercel-CDN-Cache-Control': `s-maxage=${Math.floor(ttl / 1000)}`,
      });
    } catch {
      return reply(
        res,
        503,
        {
          state: 'unavailable',
          error: 'Live source temporarily unavailable. Try again shortly.',
        },
        { 'Retry-After': '30' },
      );
    }
  };
}
