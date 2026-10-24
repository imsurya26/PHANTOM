import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjection } from './projection.js';
test('selecting a camera without Watch creates no decoder or projection', () => {
  const projection = createProjection({
    state: {},
    services: { render: {} },
    parts: {},
  });
  assert.equal(
    projection.ensureProjectionRuntime({ camera: { id: 'public-camera' } }),
    null,
  );
});
test('closing Watch destroys playback and clears demand without clearing selection', () => {
  let disposed = 0;
  let notified = 0;
  const runtime = {
    cameraId: 'a',
    playback: {
      dispose() {
        disposed++;
      },
    },
  };
  const record = { camera: { id: 'a' }, projection: runtime };
  const state = {
    _watchCameraId: 'a',
    _activeCameraId: 'a',
    _records: [record],
    _projectionEntities: [runtime],
  };
  const projection = createProjection({
    state,
    services: { render: { releaseContinuousRender() {} } },
    parts: {
      selection: { getActiveRecord: () => record },
      rendering: { refreshCoverageStyles() {} },
      presentation: {
        notifyListeners() {
          notified++;
        },
      },
    },
  });
  projection.setMediaWatching(false);
  projection.setMediaWatching(false);
  assert.equal(disposed, 1);
  assert.equal(state._watchCameraId, null);
  assert.equal(state._activeCameraId, 'a');
  assert.equal(record.projection, null);
  assert.deepEqual(state._projectionEntities, []);
  assert.equal(notified, 2);
});
