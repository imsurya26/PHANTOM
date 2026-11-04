import * as Cesium from 'cesium';
import {
  readCameraTargetFrame,
  setCameraTargetFrame,
} from './cameraOrientationControls.js';
import { trackedDisplayPositionForCamera } from '../data/trackedCamera.js';
import {
  createFirstPersonCamera,
  usableFirstPersonTarget,
} from './firstPersonCamera.js';

const modes = new Set(['follow', 'chase', 'orbit', 'top-down', 'cinematic']);

/** Adjust EntityView's offset; it remains the sole owner of target following. */
export function createObjectCameraModes({
  viewer,
  navigation,
  readHeading = () => null,
  readFirstPersonTarget = () => null,
  cockpit,
  now = () => performance.now(),
  reducedMotion = () => false,
}) {
  let mode = null;
  let removeFrame = null;
  let destroyed = false;
  const firstPerson = createFirstPersonCamera(viewer, {
    readTarget: readFirstPersonTarget,
    reducedMotion,
    now,
    onStop: () => {
      if (mode === 'first-person') mode = null;
    },
  });
  const removers = [];
  const stop = () => {
    firstPerson.stop();
    removeFrame?.();
    removeFrame = null;
    mode = null;
  };
  const listen = (event, callback) => {
    const remove = event?.addEventListener(callback);
    if (remove) removers.push(remove);
  };
  const state = () => ({
    mode: cockpit?.state()?.active
      ? 'cockpit'
      : mode || (viewer.trackedEntity ? 'follow' : 'free'),
    tracked: Boolean(viewer.trackedEntity),
    headingAvailable: Number.isFinite(readHeading(viewer.trackedEntity)),
    firstPersonAvailable: usableFirstPersonTarget(readFirstPersonTarget()),
    cached: firstPerson.active && firstPerson.cached,
  });
  const select = (requested) => {
    if (destroyed) return { ok: false, error: 'Camera controls are closed.' };
    if (requested === 'free') {
      cockpit?.exit();
      const ok = navigation._runExplicitNavigation(
        'free camera',
        () => {
          stop();
          viewer.scene.requestRender();
          return true;
        },
        { trackingOrigin: 'user' },
      );
      return { ok: Boolean(ok) };
    }
    if (requested === 'cockpit') return cockpit?.enter() || { ok: false };
    if (requested === 'first-person') {
      if (!usableFirstPersonTarget(readFirstPersonTarget()))
        return {
          ok: false,
          error:
            'Select a vessel with a reported position and heading or course first.',
        };
      const ok = navigation._runExplicitNavigation(
        'first-person camera',
        () => {
          stop();
          const started = firstPerson.start();
          if (started) mode = 'first-person';
          return started;
        },
        { trackingOrigin: 'user', preserveVesselSelection: true },
      );
      return { ok: Boolean(ok) };
    }
    if (!modes.has(requested))
      return { ok: false, error: 'Unknown camera mode.' };
    if (cockpit?.state()?.active)
      return {
        ok: false,
        error: 'Return to free camera before changing this view.',
      };
    if (!viewer.trackedEntity)
      return {
        ok: false,
        error: 'Select an aircraft or satellite to follow first.',
      };
    const frame = readCameraTargetFrame(viewer);
    if (!frame)
      return {
        ok: false,
        error: 'The selected object has no usable position.',
      };
    const heading = readHeading(viewer.trackedEntity);
    if (requested === 'chase' && !Number.isFinite(heading))
      return { ok: false, error: 'Chase view requires a reported heading.' };
    const ok = navigation.runOrientation('camera mode', () => {
      stop();
      const entity = viewer.trackedEntity;
      mode = requested;
      const start = now();
      let previous = start;
      let currentHeading = frame.heading;
      const desiredPitch = Cesium.Math.toRadians(
        requested === 'top-down' ? -89 : -25,
      );
      const duration = reducedMotion() ? 0 : 800;
      const update = () => {
        if (
          destroyed ||
          viewer.trackedEntity !== entity ||
          viewer.isDestroyed?.()
        ) {
          stop();
          return;
        }
        const time = now();
        // No catch-up jump after a background tab or a suspended computer.
        const dt = Math.min(Math.max((time - previous) / 1000, 0), 0.1);
        previous = time;
        const progress = duration ? Math.min((time - start) / duration, 1) : 1;
        const eased = Cesium.EasingFunction.CUBIC_IN_OUT(progress);
        const target = trackedDisplayPositionForCamera(
          entity,
          viewer.clock.currentTime,
        );
        if (!target) {
          stop();
          return;
        }
        if (requested === 'chase') {
          const next = readHeading(entity);
          if (!Number.isFinite(next)) {
            stop();
            return;
          }
          const delta = Cesium.Math.negativePiToPi(
            Cesium.Math.toRadians(next) - currentHeading,
          );
          currentHeading +=
            delta * (reducedMotion() ? 1 : 1 - Math.exp(-dt * 4));
        } else if (
          (requested === 'orbit' || requested === 'cinematic') &&
          !reducedMotion()
        ) {
          currentHeading +=
            Cesium.Math.toRadians(requested === 'orbit' ? 8 : 3) * dt * eased;
        }
        const applied = setCameraTargetFrame(viewer, {
          target,
          heading: currentHeading,
          pitch: Cesium.Math.lerp(frame.pitch, desiredPitch, eased),
          range: Math.max(150, frame.range),
        });
        if (!applied) {
          stop();
          return;
        }
        if (
          progress === 1 &&
          (requested === 'follow' ||
            requested === 'top-down' ||
            (reducedMotion() && requested !== 'chase'))
        ) {
          removeFrame?.();
          removeFrame = null;
        }
      };
      removeFrame = viewer.scene.preUpdate.addEventListener(update);
      viewer.scene.requestRender();
      return true;
    });
    return { ok: Boolean(ok) };
  };
  listen(viewer.trackedEntityChanged, stop);
  const unsubscribe = navigation.subscribeCameraHandoff(stop);
  removers.push(unsubscribe);
  for (const type of ['pointerdown', 'wheel']) {
    viewer.scene.canvas.addEventListener(type, stop, { passive: true });
    removers.push(() => viewer.scene.canvas.removeEventListener(type, stop));
  }
  return {
    state,
    select,
    destroy() {
      destroyed = true;
      stop();
      for (const remove of removers) remove?.();
    },
  };
}
