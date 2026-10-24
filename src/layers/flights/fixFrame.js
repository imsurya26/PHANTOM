import * as Cesium from 'cesium';

/** One ENU frame per retained observation. Weak ownership follows history expiry;
 * coordinate comparison also covers in-place terrain correction of old fixes.
 */
export function createFixFrameCache() {
  const frames = new WeakMap();
  return (fix) => {
    const p = fix.position;
    let cached = frames.get(fix);
    if (!cached) {
      cached = {
        position: new Cesium.Cartesian3(),
        matrix: new Cesium.Matrix4(),
      };
      frames.set(fix, cached);
    } else if (Cesium.Cartesian3.equals(cached.position, p))
      return cached.matrix;
    Cesium.Cartesian3.clone(p, cached.position);
    return Cesium.Transforms.eastNorthUpToFixedFrame(
      p,
      Cesium.Ellipsoid.WGS84,
      cached.matrix,
    );
  };
}
