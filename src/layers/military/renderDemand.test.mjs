import test from 'node:test';
import assert from 'node:assert/strict';
import { syncMilitaryRenderDemand } from './renderDemand.js';
import { createMilitaryFlightLayer } from './index.js';

test('military rendering follows visible contacts, including a late disabled update', () => {
  const owners = new Set();
  const render = {
    holdContinuousRender: (id) => owners.add(id),
    releaseContinuousRender: (id) => owners.delete(id),
  };
  const state = {
    _billboardCollection: { show: true },
    _billboards: new Map(),
  };
  syncMilitaryRenderDemand(state, render);
  assert.equal(owners.size, 0);
  state._billboards.set('contact', {});
  syncMilitaryRenderDemand(state, render);
  assert.deepEqual([...owners], ['military']);
  state._billboardCollection.show = false;
  syncMilitaryRenderDemand(state, render);
  assert.equal(owners.size, 0);
  state._billboardCollection.show = true;
  syncMilitaryRenderDemand(state, render);
  assert.equal(owners.size, 1);
  state._billboards.clear();
  syncMilitaryRenderDemand(state, render);
  assert.equal(owners.size, 0);
});

test('production military update releases empty demand after source failure and backoff', async () => {
  const owners = new Set(['military']);
  const names = [
    'picking',
    'sprites',
    'trails',
    'aircraftPresentation',
    'camera',
    'militaryRegistry',
    'labels',
    'groundFloor',
    'meshFloor',
    'geoid',
    'focus',
    'readout',
    'context',
    'recession',
  ];
  const services = {
    ...Object.fromEntries(names.map((name) => [name, {}])),
    groundSnap: { createGroundSnap: () => ({ clear() {} }) },
    render: {
      holdContinuousRender: (id) => owners.add(id),
      releaseContinuousRender: (id) => owners.delete(id),
    },
  };
  let calls = 0;
  const layer = createMilitaryFlightLayer({
    services,
    source: {
      getSnapshot: async () => {
        calls++;
        throw new Error('Fixture unavailable');
      },
    },
  });
  await layer.update({});
  assert.equal(owners.size, 0);
  owners.add('military');
  await layer.update({});
  assert.equal(owners.size, 0);
  assert.equal(calls, 1);
});
