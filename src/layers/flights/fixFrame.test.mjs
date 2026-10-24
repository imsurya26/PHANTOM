import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createFixFrameCache } from './fixFrame.js';

test('motion frame is reused without changing projection, and refloored fixes invalidate it', () => {
  const getFrame = createFixFrameCache();
  const fix = { position: Cesium.Cartesian3.fromDegrees(-97, 30, 10000) };
  const expected = Cesium.Transforms.eastNorthUpToFixedFrame(fix.position);
  const frame = getFrame(fix);
  assert.ok(Cesium.Matrix4.equals(frame, expected));
  assert.equal(getFrame(fix), frame);
  fix.position.z += 500;
  const updated = getFrame(fix);
  assert.equal(updated, frame);
  assert.ok(
    Cesium.Matrix4.equals(
      updated,
      Cesium.Transforms.eastNorthUpToFixedFrame(fix.position),
    ),
  );
  assert.ok(!Cesium.Matrix4.equals(updated, expected));
});
