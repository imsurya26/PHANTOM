import test from 'node:test';
import assert from 'node:assert/strict';
import { createIngestion } from './ingestion.js';

test('bounded and failed-source snapshots retain partial coverage and clear on a complete refresh', async () => {
  const state = {
    _enabled: true,
    _dataSource: {},
    _cellCacheByGrid: new Map(),
  };
  let payload = { fires: [], truncated: true, coverage: 'Bounded snapshot' };
  const ingestion = createIngestion({
    layerState: state,
    services: { context: { clearSelectedEntityContextForLayer() {} } },
    components: { rendering: { renderCurrentLod() {} } },
    config: { id: 'local-firms' },
    feed: { getSnapshot: async () => payload },
  });
  await ingestion.loadHeatmap();
  assert.equal(state._partial, true);
  assert.equal(state._coverage, 'Bounded snapshot');
  payload = { fires: [], sources: [{ ok: false }, { ok: true }] };
  await ingestion.loadHeatmap();
  assert.equal(state._partial, true);
  payload = { fires: [], sources: [{ ok: true }] };
  await ingestion.loadHeatmap();
  assert.equal(state._partial, false);
  assert.equal(state._coverage, '');
});
