import test from 'node:test';
import assert from 'node:assert/strict';
import { createVercelHandler } from '../../server/vercel/handler.js';
import { restoreApiUrl } from '../../server/vercel/rewrite.js';
async function call(handler, route = 'tomtom/flow/8/60/104.pbf') {
  const res = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(body) {
      this.body = body;
    },
  };
  await handler(
    {
      url: restoreApiUrl('/api?__phantom_route=' + route),
      method: 'GET',
      headers: {},
    },
    res,
  );
  return res;
}
test('traffic tiles require shared admission, coalesce cache hits and do not expose credentials', async () => {
  let calls = 0;
  const budgets = [];
  const handler = createVercelHandler({
    env: { TOMTOM_API_KEY: 'private-test-key' },
    limiter: {
      distributed: true,
      consume: async (key, limit) => {
        budgets.push([key, limit]);
        return { allowed: true };
      },
    },
    fetchImpl: async () => {
      calls++;
      return new Response(new Uint8Array([1, 2]), {
        headers: { 'content-type': 'application/x-protobuf' },
      });
    },
  });
  const responses = await Promise.all([call(handler), call(handler)]);
  assert.ok(responses.every((r) => r.statusCode === 200));
  assert.equal(calls, 1);
  assert.deepEqual(
    budgets.map((b) => b[1]),
    [300, 3000],
  );
  assert.doesNotMatch(
    JSON.stringify(await call(handler, 'tomtom/status')),
    /private-test-key/,
  );
  assert.equal(
    (await call(handler, 'tomtom/flow/8/999/0.pbf')).statusCode,
    400,
  );
  const blocked = createVercelHandler({
    env: { TOMTOM_API_KEY: 'test' },
    fetchImpl: async () => {
      throw Error('must not call');
    },
  });
  assert.equal((await call(blocked)).statusCode, 503);
});
