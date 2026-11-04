import * as Cesium from 'cesium';
import { isPickedWorldPosition } from '../data/scenePick.js';

export function usableFirstPersonTarget(target) {
  return Boolean(
    target?.id &&
    isPickedWorldPosition(target.position) &&
    Number.isFinite(target.heading) &&
    target.heading >= 0 &&
    target.heading <= 360,
  );
}

/** Simulated viewpoint over a reported position; never extrapolates telemetry. */
export function createFirstPersonCamera(
  viewer,
  {
    readTarget,
    onStop = () => {},
    reducedMotion = () => false,
    now = () => performance.now(),
  },
) {
  let removeFrame;
  let flying = false;
  let generation = 0;
  let selectedId;
  let cached = false;
  const stop = () => {
    generation++;
    removeFrame?.();
    removeFrame = null;
    selectedId = null;
    if (flying) {
      flying = false;
      viewer.camera.cancelFlight();
    }
    onStop();
  };
  function pose(target) {
    const location = Cesium.Cartographic.fromCartesian(target.position);
    const ground = viewer.scene.globe?.getHeight?.(location);
    location.height =
      Math.max(
        location.height,
        Number.isFinite(ground) ? ground : location.height,
      ) + 8;
    return {
      destination: Cesium.Cartesian3.fromRadians(
        location.longitude,
        location.latitude,
        location.height,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(target.heading),
        pitch: 0,
        roll: 0,
      },
    };
  }
  function start() {
    stop();
    const initial = readTarget();
    if (!usableFirstPersonTarget(initial)) return false;
    selectedId = initial.id;
    cached = initial.stale === true;
    const owner = generation;
    const initialPose = pose(initial);
    flying = true;
    viewer.camera.flyTo({
      ...initialPose,
      duration: reducedMotion() ? 0 : 1.2,
      complete() {
        if (owner !== generation) return;
        flying = false;
        let previous = now();
        let heading = initialPose.orientation.heading;
        const destination = Cesium.Cartesian3.clone(initialPose.destination);
        removeFrame = viewer.scene.preUpdate.addEventListener(() => {
          const target = readTarget();
          if (
            viewer.isDestroyed?.() ||
            viewer.trackedEntity ||
            !usableFirstPersonTarget(target) ||
            target.id !== selectedId
          ) {
            stop();
            return;
          }
          cached = target.stale === true;
          const time = now();
          const dt = Math.min(Math.max((time - previous) / 1000, 0), 0.1);
          previous = time;
          const next = pose(target);
          // A large provider correction is a new arrival, not a straight line
          // through terrain or the Earth. Leave exploration free in that case.
          if (
            Cesium.Cartesian3.distance(destination, next.destination) > 2000
          ) {
            stop();
            return;
          }
          const amount = reducedMotion() ? 1 : 1 - Math.exp(-dt * 5);
          Cesium.Cartesian3.lerp(
            destination,
            next.destination,
            amount,
            destination,
          );
          heading +=
            Cesium.Math.negativePiToPi(next.orientation.heading - heading) *
            amount;
          // Loaded terrain can rise after arrival. Clamp the interpolated eye,
          // not only the target, before publishing the next camera frame.
          const eye = Cesium.Cartographic.fromCartesian(destination);
          const floor = viewer.scene.globe?.getHeight?.(eye);
          if (Number.isFinite(floor) && eye.height < floor + 8)
            Cesium.Cartesian3.fromRadians(
              eye.longitude,
              eye.latitude,
              floor + 8,
              Cesium.Ellipsoid.WGS84,
              destination,
            );
          viewer.camera.setView({
            destination,
            orientation: { heading, pitch: 0, roll: 0 },
          });
          viewer.scene.requestRender();
        });
        viewer.scene.requestRender();
      },
      cancel() {
        if (owner === generation) stop();
      },
    });
    return true;
  }
  return {
    start,
    stop,
    get cached() {
      return cached;
    },
    get active() {
      return Boolean(selectedId);
    },
  };
}
