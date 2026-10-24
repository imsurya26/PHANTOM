/** Exact sphere/frustum outside test for Cesium's normalized Cartesian4 planes.
 * Avoid converting each plane to a Plane for every aircraft on every fleet tick.
 */
export function sphereIntersectsFrustum(volume, center, radius) {
  if (!volume?.planes) return true;
  for (let i = 0; i < volume.planes.length; i += 1) {
    const p = volume.planes[i];
    if (p.x * center.x + p.y * center.y + p.z * center.z + p.w < -radius)
      return false;
  }
  return true;
}
