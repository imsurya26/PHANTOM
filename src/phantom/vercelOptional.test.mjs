import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createOptionalReadHandler } from '../../server/vercel/optional.js';
async function invoke(path, method = 'GET') {
  const handler = createOptionalReadHandler({
    fetchImpl: async () => {
      throw Error('unexpected upstream');
    },
  });
  const req = new EventEmitter();
  Object.assign(req, { url: path, method, headers: {} });
  const res = new EventEmitter();
  res.statusCode = 200;
  res.setHeader = () => {};
  res.end = (body) => {
    res.body = body;
  };
  assert.equal(await handler(req, res), true);
  return res;
}
test('transit catalog is mounted and returns explicit public feeds', async () => {
  const res = await invoke('/api/transit/feeds');
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(JSON.parse(res.body).feeds));
});
test('optional provider adapters reject unsafe targets and unsupported methods', async () => {
  assert.equal(
    (await invoke('/api/gbfs?url=https://127.0.0.1/station_information.json'))
      .statusCode,
    403,
  );
  assert.equal(
    (await invoke('/api/wind/manifest?model=arbitrary')).statusCode,
    400,
  );
  assert.equal((await invoke('/api/launches', 'POST')).statusCode, 405);
});
