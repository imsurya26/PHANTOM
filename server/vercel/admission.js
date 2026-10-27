import { isIP } from 'node:net';
import { redisLimiter } from '../gateway/limiter.js';

export function sendJson(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

// A dedicated Redis database is shared by every region and cold start. Failed
// or denied reservations are not refunded: conservative admission is intentional.
export function createPublicAdmission({
  env = process.env,
  limiter,
  fetchImpl = fetch,
} = {}) {
  let store = limiter;
  if (!store) {
    try {
      store = redisLimiter({
        url:
          env.PHANTOM_REDIS_REST_URL ||
          env.KV_REST_API_URL ||
          env.UPSTASH_REDIS_REST_URL,
        token:
          env.PHANTOM_REDIS_REST_TOKEN ||
          env.KV_REST_API_TOKEN ||
          env.UPSTASH_REDIS_REST_TOKEN,
        fetchImpl,
      });
    } catch {
      /* Missing infrastructure must not fall back to process memory. */
    }
  }
  async function reserve(budgets) {
    if (!store?.distributed) throw new Error('Admission unavailable');
    for (const [key, limit, window] of budgets) {
      const result = await store.consume(`public:v1:${key}`, limit, window);
      if (!result.allowed) return result;
    }
    return { allowed: true };
  }
  return {
    async admit(req, res, provider) {
      try {
        const origin = new URL(env.PHANTOM_PUBLIC_ORIGIN);
        if (
          env.VERCEL !== '1' ||
          origin.protocol !== 'https:' ||
          origin.origin !== env.PHANTOM_PUBLIC_ORIGIN ||
          req.headers.host !== origin.host ||
          (req.headers.origin && req.headers.origin !== origin.origin) ||
          (provider === 'gemini' && req.headers.origin !== origin.origin) ||
          (req.headers['sec-fetch-site'] &&
            req.headers['sec-fetch-site'] !== 'same-origin')
        ) {
          sendJson(res, 403, {
            state: 'restricted',
            message: 'Use this feature from the PHANTOM site.',
          });
          return false;
        }
        // Vercel overwrites x-forwarded-for at its trusted edge. Never trust it
        // in the local server or behind a separate self-hosted adapter.
        const ip = req.headers['x-forwarded-for'];
        if (typeof ip !== 'string' || !isIP(ip))
          throw new Error('Missing edge identity');
        const budgets =
          provider === 'gemini'
            ? [
                [`gemini:ip:${ip}:hour`, 3, 3600000],
                [`gemini:ip:${ip}:day`, 6, 86400000],
                ['gemini:global:hour', 10, 3600000],
                ['gemini:global:day', 30, 86400000],
              ]
            : [
                [`openaq:ip:${ip}:minute`, 20, 60000],
                [`openaq:ip:${ip}:day`, 300, 86400000],
                ['openaq:requests:minute', 120, 60000],
                ['openaq:requests:day', 5000, 86400000],
              ];
        const result = await reserve(budgets);
        if (!result.allowed) {
          res.setHeader('Retry-After', String(result.retryAfter));
          sendJson(res, 429, {
            state: 'RATE_LIMITED',
            message: 'Usage limit reached. Try again later.',
          });
          return false;
        }
        return true;
      } catch {
        sendJson(res, 503, {
          state: 'DEGRADED',
          message: 'Usage controls are unavailable. Try again later.',
        });
        return false;
      }
    },
    async firmsFetch(url, options) {
      // Key-backed global snapshots must stay bounded across cold starts.
      const result = await reserve([
        ['firms:upstream:hour', 16, 3600000],
        ['firms:upstream:day', 240, 86400000],
      ]);
      if (!result.allowed) throw new Error('Fire data usage limit reached');
      return fetchImpl(url, options);
    },
    async trafficFetch(url, options) {
      const result = await reserve([
        ['tomtom:upstream:hour', 300, 3600000],
        ['tomtom:upstream:day', 3000, 86400000],
      ]);
      if (!result.allowed)
        throw Object.assign(new Error('Traffic allowance reached'), {
          status: 429,
        });
      return fetchImpl(url, options);
    },
    async openaqFetch(url, options) {
      // Count each real upstream call, including fan-out, independently of caches.
      const result = await reserve([
        ['openaq:upstream:minute', 25, 60000],
        ['openaq:upstream:hour', 900, 3600000],
        ['openaq:upstream:day', 5000, 86400000],
      ]);
      if (!result.allowed)
        throw Object.assign(new Error('Air quality usage limit reached'), {
          status: 429,
          state: 'rate-limited',
        });
      return fetchImpl(url, options);
    },
  };
}
