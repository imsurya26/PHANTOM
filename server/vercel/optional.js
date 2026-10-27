import { mounted } from './environment.js';
import { rocketLaunchesProxy } from '../providers/space/launch-library.js';
import { gbfsProxy } from '../providers/gbfs.js';
import { transitProxy } from '../providers/transit.js';
import { cycloneProxy } from '../providers/cyclones.js';
import { radioBrowserProxy } from '../providers/radio.js';
import { windProxy } from '../providers/wind.js';
import { militaryInstallationsProxy } from '../providers/military-installations.js';
import { installRouteMiddleware } from '../providers/places/routes.js';
import { sendJson } from './admission.js';

/** Validated, bounded public read services; no arbitrary upstream URLs. */
export function createOptionalReadHandler({
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const handlers = new Map([
    [
      '/api/route',
      mounted({
        configureServer: ({ middlewares }) =>
          installRouteMiddleware(middlewares, { fetchImpl }),
      }),
    ],
    ['/api/launches', mounted(rocketLaunchesProxy())],
    ['/api/gbfs', mounted(gbfsProxy())],
    ['/api/transit', mounted(transitProxy({ fetchImpl }))],
    ['/api/cyclones', mounted(cycloneProxy({ fetchImpl, now }))],
    ['/api/radio', mounted(radioBrowserProxy())],
    ['/api/wind', mounted(windProxy({ fetchImpl, now }))],
    ['/api/military-installations', mounted(militaryInstallationsProxy())],
  ]);
  let active = 0;
  return async (req, res) => {
    const path = req.url.split('?')[0];
    const handler = [...handlers].find(
      ([prefix]) => path === prefix || path.startsWith(`${prefix}/`),
    )?.[1];
    if (!handler) return false;
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'GET required' });
      return true;
    }
    if (active >= 8) {
      sendJson(res, 429, { error: 'Data requests busy. Retry shortly.' });
      return true;
    }
    active++;
    try {
      return await handler(req, res);
    } finally {
      active--;
    }
  };
}
