import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createRendering } from './rendering.js';

test('operational traffic draws reference roads without spawning fabricated vehicles', (t) => {
  for (const name of [
    'HTMLCanvasElement',
    'HTMLImageElement',
    'HTMLVideoElement',
    'ImageBitmap',
    'OffscreenCanvas',
  ]) {
    const previous = globalThis[name];
    globalThis[name] = class {};
    t.after(() => {
      if (previous === undefined) delete globalThis[name];
      else globalThis[name] = previous;
    });
  }
  const primitives = [];
  const state = {
    _operationalRoads: true,
    _dots: [],
    _liveMode: false,
    _viewer: {
      scene: {
        primitives: {
          add(p) {
            primitives.push(p);
            return p;
          },
          remove() {},
        },
        requestRender() {},
      },
      camera: { positionWC: Cesium.Cartesian3.fromDegrees(0, 0, 1000) },
    },
  };
  const parts = {
    retention: {
      reconcile() {
        assert.fail('must not invent vehicle populations');
      },
      refreshCounts() {},
    },
    model: { recolorDotsInPlace() {} },
    style: { heatlineOn: () => false },
  };
  const road = {
    key: 'road-1',
    type: 'primary',
    waypoints: [
      Cesium.Cartesian3.fromDegrees(0, 0),
      Cesium.Cartesian3.fromDegrees(0.01, 0),
    ],
    segmentDist: [1000],
  };
  const renderer = createRendering({ state, parts, services: {} });
  renderer.renderRoadsForAltitude([road], 1000, 'Loaded');
  assert.equal(state._count, 1);
  assert.equal(state._dots.length, 0);
  assert.equal(primitives[0].length, 1);
  const line = primitives[0].get(0);
  state._liveMode = true;
  road.flow = { level: 0.1, closure: true };
  renderer.renderRoadsForAltitude([road], 1000, 'Flow');
  assert.equal(
    primitives[0].get(0),
    line,
    'flow updates preserve road identity',
  );
  assert.equal(
    state._bucketCounts.jam,
    1,
    'closures are real road signals, not hidden cars',
  );
  state._flowError = 'unavailable';
  renderer.renderRoadsForAltitude([road], 1000, 'Failure');
  assert.equal(
    state._bucketCounts.sim,
    1,
    'failed flow returns to reference geometry',
  );
  assert.equal(state._dots.length, 0);
  renderer.renderRoadsForAltitude([], 1000, 'Empty');
  assert.equal(primitives[0].length, 0);
  assert.equal(state._count, 0);
  primitives[0].destroy();
});
