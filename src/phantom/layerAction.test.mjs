import test from 'node:test';
import assert from 'node:assert/strict';
import { enableLayerWithFeedback, layerActionMessage } from './layerAction.js';
import { loadNexusSources, loadedNexusSignals } from './nexusPanel.js';

test('layer actions report loading then actual empty or failed source state', async () => {
  const messages = [];
  const layer = {
    id: 'earthquakes',
    name: 'Earthquakes',
    enabled: true,
    stats: { count: 0, status: 'empty' },
  };
  await enableLayerWithFeedback({
    id: layer.id,
    report: (m) => messages.push(m),
    dataManager: {
      setEnabled: async () => {},
      getAll: () => [layer],
    },
  });
  assert.match(messages[0], /Requesting/);
  assert.match(messages[1], /No results.*0 records/);
  layer.stats = { unavailable: true };
  assert.match(layerActionMessage(layer), /Unavailable/);
});

test('closing the drawer suppresses delayed action feedback and errors never expose provider details', async () => {
  const signal = new AbortController();
  const messages = [];
  await enableLayerWithFeedback({
    id: 'earthquakes',
    signal: signal.signal,
    report: (m) => messages.push(m),
    dataManager: {
      setEnabled: async () => {
        signal.abort();
        throw new Error('private key');
      },
    },
  });
  assert.deepEqual(messages, ['Requesting source data…']);
  await enableLayerWithFeedback({
    id: 'earthquakes',
    report: (m) => messages.push(m),
    dataManager: {
      setEnabled: async () => {
        throw new Error('private key');
      },
    },
  });
  assert.match(messages.at(-1), /could not load/);
  assert.doesNotMatch(messages.join(' '), /private key/);
});

test('Nexus loads prerequisites and preserves usable reports when one source fails', async () => {
  const calls = [];
  const layers = new Map([
    [
      'earthquakes',
      {
        enabled: false,
        module: {
          getAnalystRecords: () => [
            { id: 'a', lat: 1, lon: 2, timeMs: Date.now(), magnitude: 3 },
          ],
        },
      },
    ],
    ['local-firms', { enabled: false, module: {} }],
  ]);
  const manager = {
    layers,
    setEnabled: async (id, enabled, options) => {
      calls.push([id, enabled, options.origin]);
      if (id === 'local-firms') throw new Error('private key');
      layers.get(id).enabled = true;
    },
    getAll: () => [
      {
        id: 'earthquakes',
        name: 'Earthquakes',
        enabled: true,
        stats: { count: 1 },
      },
    ],
  };
  const message = await loadNexusSources(manager);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['earthquakes', 'local-firms'],
  );
  assert.ok(calls.every((c) => c[1] && c[2] === 'user'));
  assert.match(message, /1 records/);
  assert.match(message, /Active fires could not load/);
  assert.doesNotMatch(message, /private key/);
  assert.equal(loadedNexusSignals(manager).length, 1);
});
