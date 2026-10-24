import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncFlightRenderDemand } from './renderDemand.js';

test('empty flights do not hold rendering; arriving and disappearing data changes demand', () => {
  const owners = new Set();
  const render = {
    holdContinuousRender: (id) => owners.add(id),
    releaseContinuousRender: (id) => owners.delete(id),
  };
  const state = {
    _billboardCollection: { show: true },
    _billboards: new Map(),
  };
  syncFlightRenderDemand(state, render);
  assert.equal(owners.size, 0);
  state._billboards.set('aircraft', {});
  syncFlightRenderDemand(state, render);
  assert.deepEqual([...owners], ['flights']);
  state._billboardCollection.show = false;
  syncFlightRenderDemand(state, render);
  assert.equal(owners.size, 0);
  state._billboardCollection.show = true;
  syncFlightRenderDemand(state, render);
  assert.equal(owners.size, 1);
  state._billboards.clear();
  syncFlightRenderDemand(state, render);
  assert.equal(owners.size, 0);
  state._billboardCollection = null;
  syncFlightRenderDemand(state, render);
  assert.equal(owners.size, 0);
});
