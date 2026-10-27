import { isValidTileCoord } from '../../src/data/tomtomTiles.js';
import { readResponseBytesCapped } from '../providers/common/http.js';
import { sendJson } from './admission.js';

export function createTrafficHandler({
  env = process.env,
  fetchImpl,
  now = Date.now,
} = {}) {
  const cache = new Map(),
    pending = new Map();
  return async (req, res) => {
    const url = new URL(req.url, 'https://phantom.invalid');
    if (!url.pathname.startsWith('/api/tomtom/')) return false;
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'GET required' });
      return true;
    }
    if (url.pathname === '/api/tomtom/status') {
      sendJson(res, 200, {
        hasKey: Boolean(env.TOMTOM_API_KEY),
        budget: 3000,
        distributed: true,
      });
      return true;
    }
    const match =
      /^\/api\/tomtom\/flow\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.pbf$/.exec(
        url.pathname,
      );
    if (
      !match ||
      !isValidTileCoord(+match[1], +match[2], +match[3]) ||
      url.search
    ) {
      sendJson(res, 400, { error: 'Invalid traffic tile' });
      return true;
    }
    if (!env.TOMTOM_API_KEY) {
      sendJson(res, 503, { error: 'no_key' });
      return true;
    }
    const key = match.slice(1).join('/');
    try {
      let entry = cache.get(key);
      if (!entry || now() - entry.at > 120000) {
        if (!pending.has(key)) {
          if (pending.size >= 6)
            throw Object.assign(Error('busy'), { status: 429 });
          pending.set(
            key,
            Promise.resolve()
              .then(async () => {
                const response = await fetchImpl(
                  `https://api.tomtom.com/traffic/map/4/tile/flow/relative/${key}.pbf?key=${encodeURIComponent(env.TOMTOM_API_KEY)}`,
                  { signal: AbortSignal.timeout(12000), redirect: 'error' },
                );
                if (!response.ok) {
                  await response.body?.cancel();
                  throw Object.assign(Error('upstream'), {
                    status: response.status,
                  });
                }
                const body = await readResponseBytesCapped(response, 2_000_000);
                const result = { body, at: now() };
                cache.set(key, result);
                while (cache.size > 12) cache.delete(cache.keys().next().value);
                return result;
              })
              .finally(() => pending.delete(key)),
          );
        }
        entry = await pending.get(key);
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/x-protobuf');
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.end(entry.body);
    } catch (error) {
      if (error.status === 429) res.setHeader('Retry-After', '60');
      sendJson(res, error.status === 429 ? 429 : 503, {
        error: 'Traffic data temporarily unavailable',
      });
    }
    return true;
  };
}
