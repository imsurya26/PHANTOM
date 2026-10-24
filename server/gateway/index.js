import { localLimiter, redisLimiter } from './limiter.js';

/** Preliminary public profile: deny unreviewed, paid, local and mutation routes. */
const PUBLIC_READS = new Set([
  '/api/flights',
  '/api/military',
  '/api/celestrak',
  '/api/launches',
  '/api/geocode',
]);
// Match the existing streaming parser ceilings for retained local workflows.
function localBodyLimit(path) {
  if (/^\/api\/realtime\/debug-log(?:[/.]|$)/i.test(path))
    return 8 * 1024 * 1024;
  if (/^\/api\/local-receivers\/aircraft(?:[/.]|$)/i.test(path))
    return 2 * 1024 * 1024;
  if (/^\/mcp(?:[/.]|$)/i.test(path)) return 1024 * 1024;
  return 65536;
}
export function createGateway({
  publicMode = false,
  limiter = localLimiter(),
  log = () => {},
  providerStatus,
} = {}) {
  if (publicMode && !limiter.distributed)
    throw new Error('Public mode requires distributed admission storage');
  let pending = 0;
  return async (req, res, next) => {
    const raw = String(req.url || '');
    const send = (status, code, message, retryAfter) => {
      if (res.headersSent || res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
      });
      res.end(JSON.stringify({ error: message, code }));
      // Only fixed codes and status: never raw URL, query, headers, bodies or keys.
      log({ status, code });
    };
    if (raw.length > 32768)
      return send(414, 'request_too_large', 'The request is too long.');
    const path = raw.split('?')[0];
    // Validate before namespace dispatch: an encoded namespace, absolute-form
    // target or dot segment must not become an API route further downstream.
    if (
      !path.startsWith('/') ||
      /[\\#\u0000-\u0020\u007f]/.test(path) ||
      path.includes('//') ||
      path.split('/').some((part) => part === '.' || part === '..')
    )
      return send(400, 'invalid_path', 'Invalid request path.');
    if (path.includes('%')) {
      let decoded;
      try {
        decoded = decodeURIComponent(path);
      } catch {
        return send(400, 'invalid_path', 'Invalid request path.');
      }
      // Static filenames may include encoded spaces/unicode. Encoded route
      // namespaces and structural characters never pass to downstream routers.
      if (
        /[\\%#\u0000-\u001f\u007f]/.test(decoded) ||
        decoded.includes('//') ||
        decoded
          .split('/')
          .some(
            (part) =>
              /^(?:api|mcp)(?:[.]|$)/i.test(part) ||
              part === '.' ||
              part === '..',
          )
      )
        return send(400, 'invalid_path', 'Invalid request path.');
    }
    if (!/^\/(?:api|mcp)(?:[/.]|$)/i.test(path)) return next();
    const routeProvider = [
      ['firms', /^\/api\/firms(?:[/.]|$)/i],
      ['openaq', /^\/api\/air-quality(?:[/.]|$)/i],
      ['aisstream', /^\/api\/vessels(?:[/.]|$)/i],
      ['gemini', /^\/api\/gemini(?:[/.]|$)/i],
      ['tomtom', /^\/api\/tomtom(?:[/.]|$)/i],
      ['google-places', /^\/api\/google(?:[/.]|$)/i],
      ['mapillary', /^\/api\/mapillary(?:[/.]|$)/i],
    ].find(([, pattern]) => pattern.test(path))?.[0];
    if (routeProvider && providerStatus?.disabled(routeProvider))
      return send(
        503,
        'provider_disabled',
        'This optional provider is disabled.',
      );
    if (publicMode && (!PUBLIC_READS.has(path) || req.method !== 'GET'))
      return send(
        403,
        'feature_restricted',
        'This feature is not available in the public profile.',
      );
    const length = Number(req.headers['content-length'] || 0);
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > (publicMode ? 65536 : localBodyLimit(path))
    )
      return send(413, 'body_too_large', 'The request body is too large.');
    // Public profile only accepts bodyless reads. Local body parsers retain their
    // own streaming limits; gateway never drains their stream before they attach.
    if (publicMode && (length || req.headers['transfer-encoding']))
      return send(
        400,
        'unexpected_body',
        'This endpoint does not accept a body.',
      );
    if (pending >= 128)
      return send(503, 'busy', 'The service is busy. Try again shortly.', 5);
    pending++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      pending--;
      res.removeListener('finish', release);
      res.removeListener('close', release);
    };
    res.once('finish', release);
    res.once('close', release);
    let admitted = false;
    try {
      const expensive =
        /^\/api\/(?:google|openai|realtime|gemini)(?:[/.]|$)/i.test(path);
      // Deliberately use socket IP. Forwarded headers are untrusted until a
      // separately reviewed deployment adapter authenticates its ingress proxy.
      const client = req.socket?.remoteAddress || 'unknown';
      const global = await limiter.consume('global', 2400);
      const budget =
        global.allowed &&
        (await limiter.consume(
          `${expensive ? 'paid' : 'data'}:${client}`,
          expensive ? 10 : 240,
        ));
      if (!global.allowed || !budget.allowed)
        return send(
          429,
          'rate_limited',
          'Too many requests. Please wait before trying again.',
          global.allowed ? budget.retryAfter : global.retryAfter,
        );
      if (!res.destroyed && !res.writableEnded) {
        admitted = true;
        next();
      }
    } catch {
      send(
        503,
        'admission_unavailable',
        'Data access is temporarily unavailable. The map remains available.',
        10,
      );
    } finally {
      if (!admitted) release();
    }
  };
}

export function gatewayPlugin(env = process.env, providerStatus) {
  const publicMode = env.PHANTOM_PUBLIC_MODE === '1';
  const limiter = publicMode
    ? redisLimiter({
        url: env.PHANTOM_REDIS_REST_URL,
        token: env.PHANTOM_REDIS_REST_TOKEN,
      })
    : localLimiter();
  const middleware = createGateway({ publicMode, limiter, providerStatus });
  const install = (server) => {
    server.middlewares.use(middleware);
  };
  return {
    name: 'phantom-gateway',
    configureServer: install,
    configurePreviewServer: install,
  };
}
