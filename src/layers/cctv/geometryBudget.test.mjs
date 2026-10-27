import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGeometryQueue,
  INITIAL_CCTV_GEOMETRY_LIMIT,
} from './geometryQueue.js';
import { createIngestion } from './ingestion.js';

test('thousands of catalog cameras do not start thousands of geometry refinements', () => {
  const records = Array.from({ length: 4000 }, (_, i) => ({
    camera: { id: String(i), lat: i / 100, lon: 0 },
  }));
  const active = records.at(-1);
  const state = {
    _records: records,
    _viewer: {
      camera: { positionCartographic: { latitude: 0, longitude: 0 } },
    },
    _geoQueue: [],
  };
  const queue = createGeometryQueue({
    state,
    services: {},
    parts: {
      selection: { getActiveRecord: () => active },
      model: { haversineKm: (_a, _b, lat) => lat },
      presentation: { notifyListeners() {} },
    },
  });
  queue.startGeometryLoadQueue();
  assert.equal(state._geoQueue.length, INITIAL_CCTV_GEOMETRY_LIMIT);
  assert.equal(state._geoQueue[0], active);
  assert.equal(state._geoQueue[1], records[0]);
  queue.stopGeometryLoadQueue();
});
test('tiles-ready pass cannot reintroduce a full catalog drain', async () => {
  const visible = { geometryPrepared: true },
    selected = { activationDone: true },
    far = {};
  let queued = [];
  const { methods } = createIngestion({
    state: { _enabled: true, _records: [visible, selected, far] },
    parts: {
      model: { projectionTilesReady: () => true },
      ground: { isGroundResolved: () => false },
      geometryQueue: {
        enqueueGeometryRefresh: (r) => {
          queued = r;
        },
      },
      health: { syncHealthState: async () => {} },
      navigation: { maybeAutoHop() {} },
      presentation: { notifyListeners() {} },
    },
  });
  await methods.update();
  assert.deepEqual(queued, [visible, selected]);
});
