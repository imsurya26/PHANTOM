import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createObjectCameraModes } from './objectCameraModes.js';

function fixture({ reduced = false, heading = 90 } = {}) {
  let time = 0;
  let reportedHeading = heading;
  let handoff;
  let activeCockpit = false;
  let positionSamples = 0;
  const frames = [];
  const target = Cesium.Cartesian3.fromDegrees(0, 0, 1000);
  const entity = {
    gevDisplayPosition: () => target,
    position: { getValue: () => { positionSamples++; return target; } },
  };
  const viewer = {
    trackedEntity: entity,
    trackedEntityChanged: new Cesium.Event(),
    clock: { currentTime: Cesium.JulianDate.now() },
    scene: {
      canvas: new EventTarget(),
      preUpdate: new Cesium.Event(),
      requestRender() {},
    },
    camera: {
      positionWC: Cesium.Cartesian3.fromDegrees(0, 0, 2000),
      transform: Cesium.Matrix4.IDENTITY,
      heading: 0,
      lookAt: (target, offset) => frames.push({ target, ...offset }),
      lookAtTransform() {},
    },
  };
  const controls = createObjectCameraModes({
    viewer,
    now: () => time,
    reducedMotion: () => reduced,
    readHeading: () => reportedHeading,
    navigation: {
      subscribeCameraHandoff(callback) { handoff = callback; return () => { handoff = null; }; },
      runOrientation(noun, callback) { handoff(); return callback(); },
      _runExplicitNavigation(noun, callback) {
        handoff();
        viewer.trackedEntity = undefined;
        return callback();
      },
    },
    cockpit: {
      state: () => ({ active: activeCockpit }),
      enter() { handoff(); activeCockpit = true; return { ok: true }; },
      exit() { activeCockpit = false; },
    },
  });
  return {
    viewer, entity, frames, controls,
    tick(ms) { time += ms; viewer.scene.preUpdate.raiseEvent(); },
    handoff: () => handoff(),
    setHeading: (value) => { reportedHeading = value; },
    positionSamples: () => positionSamples,
  };
}

test('top-down eases to a safe frame and leaves following to EntityView', () => {
  const f = fixture();
  assert.equal(f.controls.select('top-down').ok, true);
  f.tick(400);
  assert.ok(f.frames.at(-1).pitch < Cesium.Math.toRadians(-89));
  f.tick(400);
  assert.equal(f.frames.at(-1).pitch, Cesium.Math.toRadians(-89));
  assert.equal(f.viewer.trackedEntity, f.entity);
  assert.equal(f.viewer.scene.preUpdate.numberOfListeners, 0);
  assert.equal(f.positionSamples(), 0, 'camera reuses the displayed target sample');
  assert.equal(f.controls.state().mode, 'top-down');
  f.controls.destroy();
});

test('orbit keeps a bounded pace across suspension and stops on manual input', () => {
  const f = fixture();
  f.controls.select('orbit');
  f.tick(800);
  const first = f.frames.at(-1).heading;
  f.tick(600000);
  assert.ok(f.frames.at(-1).heading - first <= Cesium.Math.toRadians(0.81));
  f.viewer.scene.canvas.dispatchEvent(new Event('pointerdown'));
  assert.equal(f.viewer.scene.preUpdate.numberOfListeners, 0);
  assert.equal(f.controls.state().mode, 'follow');
  f.controls.destroy();
});

test('chase rejects missing headings, smooths turns and releases when telemetry disappears', () => {
  const f = fixture({ heading: null });
  assert.equal(f.controls.select('chase').ok, false);
  f.setHeading(90);
  f.controls.select('chase');
  f.tick(100);
  assert.ok(f.frames.at(-1).heading > 0 && f.frames.at(-1).heading < Math.PI / 2);
  f.setHeading(null);
  f.tick(100);
  assert.equal(f.controls.state().mode, 'follow');
  assert.equal(f.viewer.scene.preUpdate.numberOfListeners, 0);
  f.controls.destroy();
});

test('navigation, selection change and destruction each remove animation ownership', () => {
  const f = fixture();
  f.controls.select('cinematic');
  f.handoff();
  assert.equal(f.viewer.scene.preUpdate.numberOfListeners, 0);
  f.controls.select('orbit');
  f.viewer.trackedEntity = {};
  f.tick(100);
  assert.equal(f.viewer.scene.preUpdate.numberOfListeners, 0);
  f.controls.destroy();
  assert.equal(f.viewer.trackedEntityChanged.numberOfListeners, 0);
  assert.equal(f.controls.select('follow').ok, false);
});

test('reduced motion disables continuous orbit and immediately frames chase', () => {
  const f = fixture({ reduced: true });
  f.controls.select('chase');
  f.tick(0);
  assert.equal(f.frames.at(-1).heading, Math.PI / 2);
  f.setHeading(180);
  f.tick(100);
  assert.equal(f.frames.at(-1).heading, Math.PI);
  assert.equal(f.viewer.scene.preUpdate.numberOfListeners, 1);
  f.controls.select('cinematic');
  f.tick(0);
  assert.equal(f.viewer.scene.preUpdate.numberOfListeners, 0);
  f.controls.destroy();
});

test('free camera exits cockpit and tracking; unsupported states return a useful refusal', () => {
  const f = fixture();
  f.controls.select('orbit');
  assert.equal(f.controls.select('cockpit').ok, true);
  assert.equal(f.controls.state().mode, 'cockpit');
  assert.equal(f.viewer.scene.preUpdate.numberOfListeners, 0);
  assert.equal(f.controls.select('top-down').ok, false);
  assert.equal(f.controls.select('free').ok, true);
  assert.equal(f.controls.state().mode, 'free');
  assert.equal(f.viewer.trackedEntity, undefined);
  assert.equal(f.controls.select('follow').ok, false);
  f.controls.destroy();
});
