import test from 'node:test';
import assert from 'node:assert/strict';
import { useFreeMapForSearch } from './searchPolicy.js';
import { classifyMapFailure, safeMapError } from './diagnostics.js';

test('free search switches maps before querying and leaves an existing free map alone', async () => {
  let active = 'photoreal';
  const events = [];
  const service = useFreeMapForSearch(
    {
      geocode: async (q) => {
        events.push(q);
        return q;
      },
    },
    {
      getActiveId: () => active,
      setStack: async (id) => {
        events.push(id);
        active = id;
      },
    },
  );
  assert.equal(await service.geocode('Chennai'), 'Chennai');
  await service.geocode('Paris');
  assert.deepEqual(events, ['osm', 'Chennai', 'Paris']);
});

test('search does not query if a Google map switch was superseded', async () => {
  const service = useFreeMapForSearch(
    { geocode: () => assert.fail('must not query') },
    {
      getActiveId: () => 'photoreal',
      setStack: async () => {},
    },
  );
  assert.deepEqual(await service.geocode('Chennai'), {
    place: null,
    answered: false,
  });
});

test('map diagnostics retain HTTP evidence without guessing billing vs CORS or leaking text', () => {
  for (const [statusCode, code] of [
    [401, 'AUTHENTICATION'],
    [403, 'ACCESS_DENIED'],
    [429, 'QUOTA_OR_RATE_LIMIT'],
    [500, 'PROVIDER_OUTAGE'],
  ]) {
    const original = {
      statusCode,
      message: 'secret upstream URL',
      response: 'private',
    };
    assert.deepEqual(classifyMapFailure(original), {
      code,
      httpStatus: statusCode,
    });
    const safe = safeMapError(original);
    assert.doesNotMatch(safe.message + JSON.stringify(safe), /secret|private/);
  }
  assert.equal(
    classifyMapFailure(new TypeError('Failed fetch')).code,
    'NETWORK_OR_PROVIDER',
  );
});
