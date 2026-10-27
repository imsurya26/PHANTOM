import { weatherProxy } from '../providers/weather.js';
import { createSignalsService, signalsPlugin } from '../providers/signals.js';
import { readResponseTextCapped } from '../providers/common/http.js';
import { filterTrailing24h, parseFirmsCsv } from '../../src/data/firmsCsv.js';
import { sendJson } from './admission.js';

const GROUPS = new Set([
  'stations',
  'visual',
  'gps-ops',
  'glo-ops',
  'galileo',
  'geo',
  'starlink',
]);
const FIRE_SOURCES = [
  'VIIRS_NOAA20_NRT',
  'VIIRS_NOAA21_NRT',
  'VIIRS_SNPP_NRT',
  'MODIS_NRT',
];
const FIRE_TTL = 30 * 60_000;

// Adapt Connect's mounted URL contract without mutating the caller's request.
export function mounted(plugin) {
  let prefix, handle;
  plugin.configureServer({
    middlewares: {
      use(path, fn) {
        prefix = path;
        handle = fn;
      },
    },
  });
  return async (req, res) => {
    const path = req.url.split('?')[0];
    if (path !== prefix && !path.startsWith(`${prefix}/`)) return false;
    const local = Object.create(req);
    local.url = req.url.slice(prefix.length) || '/';
    if (local.url.startsWith('?')) local.url = `/${local.url}`;
    // Vercel's response limit is below some legal high-resolution NOAA images.
    // Reject oversized output explicitly rather than letting the platform drop it.
    const response = Object.create(res);
    response.writeHead = (status, headers) => {
      res.statusCode = status;
      for (const [key, value] of Object.entries(headers))
        res.setHeader(key, value);
    };
    response.end = (body) => {
      if (body && Buffer.byteLength(body) > 4_000_000)
        return sendJson(res, 503, {
          error: 'image_too_large',
          message: 'The source response exceeds the deployment size limit.',
        });
      res.end(body);
    };
    response.once = (...args) => res.once?.(...args);
    response.on = (...args) => res.on?.(...args);
    response.removeListener = (...args) => res.removeListener?.(...args);
    await handle(local, response);
    return true;
  };
}

/** Fixed providers only; bounded bodies, coalescing, TTLs and failure cooldowns. */
export function createEnvironmentHandler({
  env = process.env,
  fetchImpl = fetch,
  firmsFetch = fetchImpl,
  now = Date.now,
} = {}) {
  const weather = mounted(weatherProxy({ fetchImpl, now }));
  const signals = mounted(
    signalsPlugin({ service: createSignalsService({ fetchImpl, now }) }),
  );
  const cache = new Map(),
    pending = new Map(),
    retryAt = new Map();
  async function cached(key, ttl, load) {
    const old = cache.get(key);
    if (old && now() - old.at < ttl) return { ...old, stale: false };
    if (pending.has(key)) return pending.get(key);
    if ((retryAt.get(key) || 0) > now()) {
      if (old && now() - old.at < ttl * 4) return { ...old, stale: true };
      throw Error('Provider cooling down');
    }
    retryAt.set(key, now() + 60_000);
    const operation = Promise.resolve()
      .then(load)
      .then((body) => {
        const entry = { at: now(), body };
        cache.set(key, entry);
        return { ...entry, stale: false };
      })
      .catch(() => {
        if (old && now() - old.at < ttl * 4) return { ...old, stale: true };
        throw Error('Provider unavailable');
      })
      .finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  }
  async function text(url, limit, timeout = 12_000, transport = fetchImpl) {
    const signal = AbortSignal.timeout(timeout);
    const response = await transport(url, {
      signal,
      redirect: 'error',
      headers: {
        'User-Agent': 'PHANTOM/1.0 (+https://github.com/imsurya26/PHANTOM)',
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error('Provider unavailable');
    }
    return readResponseTextCapped(response, limit, signal);
  }
  return async (req, res) => {
    if (await weather(req, res)) return true;
    if (await signals(req, res)) return true;
    const url = new URL(req.url, 'https://internal');
    const tle = url.pathname.startsWith('/api/celestrak/');
    const fires = ['/api/firms', '/api/firms/status'].includes(url.pathname);
    if (!tle && !fires) return false;
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return true;
    }
    const group = url.pathname.slice('/api/celestrak/'.length);
    if (url.search || (tle && !GROUPS.has(group))) {
      sendJson(res, 400, { error: 'invalid_query' });
      return true;
    }
    try {
      if (tle) {
        const entry = await cached(`tle:${group}`, 6 * 3600_000, async () => {
          const body = await text(
            `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`,
            3_500_000,
          );
          if (!/^1 \d/m.test(body) || !/^2 \d/m.test(body))
            throw Error('Invalid TLE');
          return body;
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('x-tle-cache', entry.stale ? 'STALE-ERROR' : 'HIT');
        res.setHeader(
          'Cache-Control',
          entry.stale ? 'no-store' : 'public, max-age=300, s-maxage=21600',
        );
        res.end(entry.body);
      } else if (url.pathname.endsWith('/status')) {
        const entry = cache.get('firms');
        sendJson(res, 200, {
          hasKey: Boolean(env.FIRMS_MAP_KEY),
          lastFetch: entry?.at ?? null,
          count: entry?.body.fires.length ?? 0,
          ttlMs: FIRE_TTL,
        });
      } else if (!env.FIRMS_MAP_KEY) sendJson(res, 503, { error: 'no_key' });
      else {
        const entry = await cached('firms', FIRE_TTL, async () => {
          const records = [],
            sources = [];
          // Sequential requests respect the provider quota and fit the 60s function.
          for (const source of FIRE_SOURCES) {
            try {
              const csv = await text(
                `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(env.FIRMS_MAP_KEY)}/${source}/world/2`,
                16 * 1024 * 1024,
                10_000,
                firmsFetch,
              );
              const parsed = parseFirmsCsv(csv);
              if (!parsed) throw Error('Invalid CSV');
              const fresh = filterTrailing24h(parsed, now());
              for (const record of fresh) records.push(record);
              sources.push({ source, count: fresh.length, ok: true });
            } catch {
              sources.push({ source, count: 0, ok: false });
            }
          }
          if (!sources.some((source) => source.ok)) throw Error('No sources');
          // Bound JSON and browser work. Explicitly disclose a partial snapshot.
          records.sort((a, b) => b.frp - a.frp);
          const fires = [];
          let bytes = 0;
          for (const record of records.slice(0, 10_000)) {
            const size = Buffer.byteLength(JSON.stringify(record)) + 1;
            if (bytes + size > 3_800_000) break;
            fires.push(record);
            bytes += size;
          }
          return {
            fires,
            sources,
            totalCount: records.length,
            truncated: records.length > fires.length,
          };
        });
        const records = filterTrailing24h(entry.body.fires, now());
        sendJson(res, 200, {
          ...entry.body,
          fires: records,
          count: records.length,
          fetchedAt: entry.at,
          stale: entry.stale,
          ttlMs: FIRE_TTL,
          coverage:
            'Up to 10,000 highest fire-radiative-power detections from available sources; not exhaustive.',
        });
      }
    } catch {
      sendJson(res, 503, {
        error: 'upstream_unavailable',
        message: 'The source is temporarily unavailable.',
      });
    }
    return true;
  };
}
