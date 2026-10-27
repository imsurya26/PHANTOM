import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraHandler } from '../../server/vercel/cameras.js';
import { restoreApiUrl } from '../../server/vercel/rewrite.js';
async function call(handler, path) {
  const res = {
    statusCode: 200,
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
      url: restoreApiUrl(
        '/api?__phantom_route=' + encodeURIComponent(path.slice(5)),
      ),
      method: 'GET',
    },
    res,
  );
  return res;
}
test('camera catalog excludes invented/video-only cameras and never exposes source credentials', async () => {
  const h = createCameraHandler({
    catalog: async () => [
      {
        id: 'camera_123',
        lat: 1,
        lon: 2,
        snapshotUrl: 'https://example.com/private?key=secret',
      },
      { id: 'video-only', url: 'https://example.com/live', feedType: 'hls' },
    ],
  });
  const res = await call(h, '/api/cctv/sources');
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).sources.length, 1);
  assert.doesNotMatch(res.body, /secret|private/);
  assert.equal((await call(h, '/api/cctv/frame/nonexistent')).statusCode, 404);
});
test('registered snapshot routes survive Vercel rewrite, coalesce and cache real images', async () => {
  let calls = 0;
  const h = createCameraHandler({
    catalog: async () => [
      { id: 'camera_123', snapshotUrl: 'https://example.com/a.jpg' },
    ],
    fetchImpl: async () => {
      calls++;
      return new Response(new Uint8Array([255, 216, 255, 1]), {
        headers: { 'content-type': 'image/jpeg' },
      });
    },
  });
  const results = await Promise.all([
    call(h, '/api/cctv/frame/camera_123'),
    call(h, '/api/cctv/frame/camera_123'),
  ]);
  assert.ok(results.every((res) => res.statusCode === 200));
  assert.equal(calls, 1);
  await call(h, '/api/cctv/frame/camera_123');
  assert.equal(calls, 1);
});
test('missing images report failure instead of synthetic footage and numeric coverage tile paths work', async () => {
  const h = createCameraHandler({
    env: { MAPILLARY_CLIENT_TOKEN: 'test' },
    catalog: async () => [
      { id: 'x', snapshotUrl: 'https://example.com/a.jpg' },
    ],
    fetchImpl: async () => new Response('failed', { status: 503 }),
    tile: async (address) => {
      assert.equal(address.z, '14');
      return { bytes: Buffer.from([1, 2]) };
    },
  });
  assert.equal((await call(h, '/api/cctv/frame/x')).statusCode, 503);
  assert.equal(
    (await call(h, '/api/mapillary/tiles/coverage/14/100/200')).statusCode,
    200,
  );
});
