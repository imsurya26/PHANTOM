import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createFirstPersonCamera, usableFirstPersonTarget } from './firstPersonCamera.js';

function fixture() {
  let time = 0;
  let target = { id: 'ship', position: Cesium.Cartesian3.fromDegrees(0, 0, 2), heading: 90 };
  const views = [];
  let arrival;
  let cancellations = 0;
  const viewer = {
    scene: { preUpdate: new Cesium.Event(), requestRender() {}, globe: { getHeight: () => 5 } },
    camera: {
      flyTo: (options) => { arrival = options; },
      cancelFlight: () => { cancellations++; arrival?.cancel(); },
      setView: (view) => views.push({ ...view, destination: Cesium.Cartesian3.clone(view.destination) }),
    },
  };
  const camera = createFirstPersonCamera(viewer, { readTarget: () => target, now: () => time });
  return {
    camera, viewer, views,
    setTarget: (next) => { target = next; },
    arrive: () => arrival.complete(),
    arrival: () => arrival,
    cancellations: () => cancellations,
    tick: () => { time += 100; viewer.scene.preUpdate.raiseEvent(); },
  };
}

test('simulated first-person requires a real world position and a usable direction', () => {
  assert.equal(usableFirstPersonTarget({ id: 'ship', position: Cesium.Cartesian3.ZERO, heading: 0 }), false);
  assert.equal(usableFirstPersonTarget({ id: 'ship', position: Cesium.Cartesian3.fromDegrees(0, 0), heading: null }), false);
  const f = fixture();
  f.setTarget(null);
  assert.equal(f.camera.start(), false);
  assert.equal(f.camera.active, false);
});

test('arrival clears terrain and follows reported positions without extrapolating speed', () => {
  const f = fixture();
  assert.equal(f.camera.start(), true);
  assert.ok(Math.abs(Cesium.Cartographic.fromCartesian(f.arrival().destination).height - 13) < 0.01);
  f.arrive();
  f.tick();
  const initial = f.views.at(-1).destination;
  for (let n = 0; n < 20; n++) f.tick();
  assert.ok(Cesium.Cartesian3.distance(initial, f.views.at(-1).destination) < 0.001);
  f.setTarget({ id: 'ship', position: Cesium.Cartesian3.fromDegrees(0, 0, 2), heading: 90, stale: true });
  f.tick();
  assert.equal(f.camera.cached, true);
  f.camera.stop();
  assert.equal(f.viewer.scene.preUpdate.numberOfListeners, 0);
});

test('cancelled arrivals cannot reinstall camera motion', () => {
  const f = fixture();
  f.camera.start();
  f.camera.stop();
  f.arrive();
  assert.equal(f.cancellations(), 1);
  assert.equal(f.viewer.scene.preUpdate.numberOfListeners, 0);
  assert.equal(f.camera.active, false);
});

test('newly loaded terrain cannot bury the interpolated first-person eye', () => {
  const f = fixture();
  f.camera.start();
  f.arrive();
  f.viewer.scene.globe.getHeight = () => 100;
  f.tick();
  assert.ok(Cesium.Cartographic.fromCartesian(f.views.at(-1).destination).height >= 107.99);
  f.camera.stop();
});

test('source loss, identity change, large corrections and another tracked owner release first-person', () => {
  for (const scenario of ['missing', 'changed', 'jump', 'owner']) {
    const f = fixture();
    f.camera.start();
    f.arrive();
    if (scenario === 'missing') f.setTarget(null);
    if (scenario === 'changed') f.setTarget({ id: 'other', position: Cesium.Cartesian3.fromDegrees(0, 0), heading: 0 });
    if (scenario === 'jump') f.setTarget({ id: 'ship', position: Cesium.Cartesian3.fromDegrees(10, 10), heading: 0 });
    if (scenario === 'owner') f.viewer.trackedEntity = {};
    f.tick();
    assert.equal(f.camera.active, false, scenario);
    assert.equal(f.viewer.scene.preUpdate.numberOfListeners, 0, scenario);
  }
});
