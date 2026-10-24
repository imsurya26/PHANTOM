import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { sphereIntersectsFrustum } from './sphereVisibility.js';

test('fleet sphere test agrees with Cesium across world positions, radii and frustum edges', () => {
  const frustum = new Cesium.PerspectiveFrustum({
    fov: Math.PI / 3,
    aspectRatio: 1.6,
    near: 1,
    far: 20000000,
  });
  const volume = frustum.computeCullingVolume(
    new Cesium.Cartesian3(7000000, 0, 0),
    new Cesium.Cartesian3(-1, 0, 0),
    new Cesium.Cartesian3(0, 0, 1),
  );
  let seed = 42;
  const random = () =>
    (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 20000; i++) {
    const center = new Cesium.Cartesian3(
      (random() - 0.5) * 20000000,
      (random() - 0.5) * 20000000,
      (random() - 0.5) * 20000000,
    );
    const radius = random() * 100000;
    assert.equal(
      sphereIntersectsFrustum(volume, center, radius),
      volume.computeVisibility(new Cesium.BoundingSphere(center, radius)) !==
        Cesium.Intersect.OUTSIDE,
    );
  }
  assert.equal(
    sphereIntersectsFrustum(
      { planes: [{ x: 1, y: 0, z: 0, w: 0 }] },
      { x: -2, y: 0, z: 0 },
      2,
    ),
    true,
    'tangent sphere retained',
  );
});
