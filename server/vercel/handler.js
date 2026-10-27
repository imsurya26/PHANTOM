import { airQualityPlugin } from '../providers/airQuality.js';
import { geminiTokenPlugin } from '../providers/gemini.js';
import { createProviderStatus } from '../gateway/provider-status.js';
import { createPublicAdmission, sendJson } from './admission.js';
import { createPublicReadHandler } from './public-read.js';
import { createEnvironmentHandler } from './environment.js';
import { createCameraHandler } from './cameras.js';
import { createOptionalReadHandler } from './optional.js';
import { createTrafficHandler } from './traffic.js';

function middleware(plugin) {
  let handler;
  plugin.configureServer({
    middlewares: {
      use(fn) {
        handler = fn;
      },
    },
  });
  return handler;
}

export function createVercelHandler({
  env = process.env,
  fetchImpl = fetch,
  limiter,
  now = Date.now,
} = {}) {
  const admission = createPublicAdmission({ env, fetchImpl, limiter });
  const publicRead = createPublicReadHandler({ fetchImpl, now });
  const cameras = createCameraHandler({ env, fetchImpl, now });
  const optional = createOptionalReadHandler({ fetchImpl, now });
  const traffic = createTrafficHandler({
    env,
    fetchImpl: admission.trafficFetch,
    now,
  });
  const environment = createEnvironmentHandler({
    env,
    fetchImpl,
    firmsFetch: admission.firmsFetch,
    now,
  });
  // Only the explicitly admitted Gemini handler can use this status instance.
  const status = createProviderStatus({
    env: { ...env, PHANTOM_PUBLIC_MODE: '0' },
    now,
  });
  const gemini = middleware(
    geminiTokenPlugin({
      env,
      fetchImpl,
      now,
      status,
      publicAdmission: (req, res) => admission.admit(req, res, 'gemini'),
    }),
  );
  const airQuality = middleware(
    airQualityPlugin({
      apiKey: env.OPENAQ_API_KEY,
      fetchImpl: admission.openaqFetch,
      now,
      status,
    }),
  );
  return async (req, res) => {
    const raw = req.url || '';
    const path = raw.split('?')[0];
    if (
      raw.length > 4096 ||
      !/^\/api\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*(?:\.(?:pbf|bin))?$/.test(path)
    )
      return sendJson(res, 400, {
        state: 'invalid-request',
        message: 'Invalid API request.',
      });
    try {
      if (
        ['/api/providers/status', '/api/phantom/provider-status'].includes(
          path,
        ) &&
        req.method === 'GET'
      ) {
        const providers = status.snapshot().map((provider) => {
          if (
            [
              'gemini',
              'openaq',
              'cesium',
              'google-tiles',
              'free-map',
              'adsb-lol',
              'photon',
              'usgs',
              'celestrak',
              'firms',
            ].includes(provider.id)
          )
            return provider;
          return {
            ...provider,
            enabled: false,
            status: 'DISABLED',
            state: 'DEGRADED',
            reason: 'public-adapter-unavailable',
          };
        });
        return sendJson(res, 200, { providers });
      }
      if (path === '/api/gemini/token')
        return await gemini(req, res, () =>
          sendJson(res, 404, { state: 'unavailable' }),
        );
      if (
        ['/api/air-quality/locations', '/api/air-quality/latest'].includes(path)
      ) {
        if (req.method !== 'GET')
          return sendJson(res, 405, {
            state: 'invalid-request',
            message: 'GET required.',
          });
        if (!(await admission.admit(req, res, 'openaq'))) return;
        return await airQuality(req, res, () =>
          sendJson(res, 404, { state: 'unavailable' }),
        );
      }
      if (await publicRead(req, res)) return;
      if (await environment(req, res)) return;
      if (await cameras(req, res)) return;
      if (await optional(req, res)) return;
      if (await traffic(req, res)) return;
      return sendJson(res, 503, {
        state: 'unavailable',
        message: 'This provider is not available in this deployment.',
        results: [],
      });
    } catch {
      return sendJson(res, 503, {
        state: 'unavailable',
        message: 'This service is temporarily unavailable.',
      });
    }
  };
}
