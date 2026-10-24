import { admitSameSite } from './common/same-site.js';
import { readResponseJsonCapped } from './common/http.js';
import { GEMINI_MODEL, geminiSetup } from '../../src/voice/geminiProtocol.js';

// Official REST contract reviewed 2026-10-17: https://ai.google.dev/api/live
// https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens
// This is a local-only provisioning adapter. Public authentication and the
// authenticated admission must be completed before enabling a public service.
export function geminiTokenPlugin({
  env = process.env,
  status,
  fetchImpl = fetch,
  now = Date.now,
  publicAdmission,
} = {}) {
  let inFlight = false;
  let cooldown = 0;
  let windowAt = now();
  let attempts = 0;
  const handler = async (req, res, next) => {
    if (req.url?.split('?')[0] !== '/api/gemini/token') return next();
    const send = (code, body) => {
      res.statusCode = code;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(JSON.stringify(body));
    };
    if (publicAdmission) {
      if (!(await publicAdmission(req, res))) return;
    } else {
      if (admitSameSite(req, res)) return;
      // No trusted-proxy assumptions: this new paid endpoint is strictly local.
      if (
        !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
          req.socket?.remoteAddress,
        ) ||
        env.PHANTOM_PUBLIC_MODE === '1'
      )
        return send(403, {
          state: 'DEGRADED',
          message: 'Voice provisioning is local only.',
        });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(405, { state: 'DEGRADED', message: 'POST required.' });
    }
    if (
      req.url !== '/api/gemini/token' ||
      Number(req.headers?.['content-length'] || 0) !== 0 ||
      req.headers?.['transfer-encoding']
    )
      return send(400, {
        state: 'DEGRADED',
        message: 'This endpoint accepts no parameters or body.',
      });
    const disabled = (env.PHANTOM_DISABLED_PROVIDERS || '')
      .split(',')
      .map((s) => s.trim())
      .includes('gemini');
    if (
      disabled ||
      env.PHANTOM_GEMINI_ENABLED === '0' ||
      !env.GEMINI_API_KEY?.trim()
    )
      return send(503, {
        state: 'DEGRADED',
        message:
          'Voice is not configured or is disabled. Manual controls remain available.',
      });
    if (now() - windowAt >= 3600_000) {
      windowAt = now();
      attempts = 0;
    }
    if (attempts >= 10) {
      status?.record('gemini', 'QUOTA_EXHAUSTED');
      res.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((windowAt + 3600_000 - now()) / 1000))),
      );
      return send(429, {
        state: 'QUOTA_EXHAUSTED',
        message:
          'Local voice session budget reached. Manual controls remain available.',
      });
    }
    if (inFlight || now() < cooldown) {
      res.setHeader(
        'Retry-After',
        String(Math.max(5, Math.ceil((cooldown - now()) / 1000))),
      );
      return send(429, {
        state: 'RATE_LIMITED',
        message: 'Please wait before starting another voice session.',
      });
    }
    const model = env.GEMINI_LIVE_MODEL || GEMINI_MODEL;
    if (!/^gemini-[a-z0-9.-]{1,80}$/.test(model))
      return send(503, {
        state: 'DEGRADED',
        message: 'Voice model configuration is invalid.',
      });
    inFlight = true;
    attempts++;
    cooldown = now() + 15_000;
    try {
      const expireTime = new Date(now() + 5 * 60_000).toISOString();
      const newSessionExpireTime = new Date(now() + 60_000).toISOString();
      const signal = AbortSignal.timeout(8000);
      const response = await fetchImpl(
        'https://generativelanguage.googleapis.com/v1beta/auth_tokens',
        {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: {
            'x-goog-api-key': env.GEMINI_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uses: 1,
            expireTime,
            newSessionExpireTime,
            bidiGenerateContentSetup: geminiSetup(model),
          }),
        },
      );
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        const state = [401, 403].includes(response.status)
          ? 'AUTH_ERROR'
          : response.status === 429
            ? 'RATE_LIMITED'
            : 'OUTAGE';
        status?.record('gemini', state);
        cooldown = now() + (state === 'OUTAGE' ? 30_000 : 300_000);
        return send(503, {
          state,
          message:
            'Voice is temporarily unavailable. Manual controls remain available.',
        });
      }
      const data = await readResponseJsonCapped(response, 16 * 1024, signal);
      if (
        typeof data?.name !== 'string' ||
        !/^auth_tokens\/[A-Za-z0-9._~-]{1,8000}$/.test(data.name) ||
        data.name.includes(env.GEMINI_API_KEY)
      )
        throw new Error('Invalid ephemeral token');
      // Provisioning success alone does not prove a working audio session.
      status?.record('gemini', attempts >= 8 ? 'QUOTA_WARNING' : 'DEGRADED');
      // Deliberately whitelist only the ephemeral credential; no upstream body,
      // permanent key, arbitrary client config, history or transcript is stored.
      return send(200, {
        token: data.name,
        model,
        expireTime,
        newSessionExpireTime,
      });
    } catch {
      cooldown = now() + 30_000;
      status?.record('gemini', 'OUTAGE');
      return send(503, {
        state: 'OUTAGE',
        message:
          'Voice is temporarily unavailable. Manual controls remain available.',
      });
    } finally {
      inFlight = false;
    }
  };
  const install = (server) => {
    server.middlewares.use(handler);
  };
  return {
    name: 'phantom-gemini-token',
    configureServer: install,
    configurePreviewServer: install,
  };
}
