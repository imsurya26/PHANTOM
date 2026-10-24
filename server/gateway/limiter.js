import { createHash } from 'node:crypto';
import { BoundedCache } from '../cache/bounded.js';
import { readResponseJsonCapped } from '../providers/common/http.js';

function validateBudget(key, limit, windowMs, maxWindowMs = 120000) {
  if (
    typeof key !== 'string' ||
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    !Number.isSafeInteger(windowMs) ||
    windowMs <= 0 ||
    windowMs > maxWindowMs
  )
    throw new TypeError('Invalid admission budget');
}

export function localLimiter({ now = Date.now } = {}) {
  const buckets = new BoundedCache({
    maxEntries: 10000,
    maxBytes: 2_000_000,
    ttlMs: 120000,
    now,
  });
  return {
    distributed: false,
    async consume(key, limit, windowMs = 60000) {
      validateBudget(key, limit, windowMs);
      const bucket = `${Math.floor(now() / windowMs)}:${key}`;
      const count = (buckets.get(bucket) || 0) + 1;
      buckets.set(bucket, count);
      return {
        allowed: count <= limit,
        retryAfter: Math.ceil((windowMs - (now() % windowMs)) / 1000),
      };
    },
  };
}

// Atomic increment and TTL. No separate EXPIRE that can be lost after a crash.
const SCRIPT =
  "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('PTTL',KEYS[1])}";
export function redisLimiter({ url, token, fetchImpl = fetch }) {
  const endpoint = new URL(url);
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/'
  )
    throw new TypeError('Expected a Redis REST HTTPS origin');
  if (typeof token !== 'string' || !token.trim())
    throw new TypeError('Redis token is required');
  return {
    distributed: true,
    async consume(key, limit, windowMs = 60000) {
      validateBudget(key, limit, windowMs, 86400000);
      const hash = createHash('sha256').update(key).digest('hex');
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(2500),
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          'EVAL',
          SCRIPT,
          1,
          `phantom:limit:${hash}`,
          windowMs,
        ]),
      });
      if (!response.ok) throw new Error('Admission storage unavailable');
      const json = await readResponseJsonCapped(response, 8192);
      if (
        !Array.isArray(json?.result) ||
        json.result.length !== 2 ||
        json.error
      )
        throw new Error('Invalid admission response');
      const [count, ttl] = json.result;
      if (
        !Number.isSafeInteger(count) ||
        count < 1 ||
        !Number.isSafeInteger(ttl) ||
        ttl < 0
      )
        throw new Error('Invalid admission response');
      return {
        allowed: count <= limit,
        retryAfter: Math.max(1, Math.ceil(ttl / 1000)),
      };
    },
  };
}
