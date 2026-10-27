import test from 'node:test';
import assert from 'node:assert/strict';
import { syncSatelliteRenderDemand } from './renderDemand.js';
import { createIngestion } from './ingestion.js';
import { createLifecycle } from './lifecycle.js';

function fixture(readGroup = async () => ({ ok: false })) {
  const owners = new Set();
  const state = {
    _enabled: true,
    _catalog: new Map(),
    _points: new Map(),
    _orbitPaths: new Map(),
    _activeUpdateControllers: new Set(),
    _trackingRefreshEpoch: 0,
  };
  const services = {
    render: {
      holdContinuousRender: (id) => owners.add(id),
      releaseContinuousRender: (id) => owners.delete(id),
    },
    focus: {},
    picking: { registerPickOwner() {} },
  };
  const parts = {
    orbits: { parseTLE: () => [] },
    labels: { _syncIssOverlay() {} },
    interaction: { _installClickHandler() {} },
    tracking: { _applyPendingTrackingRestore() {} },
  };
  const context = { state, services, parts, source: { readGroup } };
  return {
    ...context,
    owners,
    update: createIngestion(context).methods.update,
  };
}

test('enabling an empty satellite layer leaves rendering idle; arrivals resume animation', () => {
  const f = fixture();
  const lifecycle = createLifecycle(f).methods;
  lifecycle.enable();
  assert.equal(f.owners.size, 0);
  f.state._catalog.set(25544, {});
  lifecycle.enable();
  assert.deepEqual([...f.owners], ['satellites']);
  f.state._catalog.clear();
  syncSatelliteRenderDemand(f.state, f.services.render);
  assert.equal(f.owners.size, 0);
});

test('failed and empty production updates release idle demand but preserve a stale populated catalog', async () => {
  for (const readGroup of [
    async () => {
      throw new Error('Fixture unavailable');
    },
    async () => ({ ok: true, text: '' }),
  ]) {
    const f = fixture(readGroup);
    f.owners.add('satellites');
    await f.update({});
    assert.equal(f.owners.size, 0);
    assert.equal(f.state._activeUpdateControllers.size, 0);
    f.state._catalog.set(25544, {});
    await f.update({});
    assert.deepEqual([...f.owners], ['satellites']);
  }
});

test('a pending update finishing after disable never reacquires continuous rendering', async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const f = fixture(() => pending);
  f.state._catalog.set(25544, {});
  syncSatelliteRenderDemand(f.state, f.services.render);
  const updating = f.update({});
  f.state._enabled = false;
  syncSatelliteRenderDemand(f.state, f.services.render);
  finish({ ok: false });
  await updating;
  assert.equal(f.owners.size, 0);
});

test('cancelled production update settles render demand and releases its update controller', async () => {
  const f = fixture();
  f.owners.add('satellites');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(f.update({}, { signal: controller.signal }), {
    name: 'AbortError',
  });
  assert.equal(f.owners.size, 0);
  assert.equal(f.state._activeUpdateControllers.size, 0);
});
