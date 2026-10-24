import test from 'node:test';
import assert from 'node:assert/strict';
import { searchLoadedRecords } from './universalSearch.js';
test('search reads only enabled layers and returns typed positioned matches', () => {
  const manager = {
    layers: new Map([
      [
        'flights',
        {
          enabled: true,
          module: {
            getAllPositions: () => [
              { id: 'abc', label: 'AI123', latitude: 13, longitude: 80 },
            ],
          },
        },
      ],
      [
        'ais-live-vessels',
        {
          enabled: true,
          module: {
            getAllPositions: () => [
              { id: '123', label: 'Ocean', latitude: 10, longitude: 20 },
            ],
          },
        },
      ],
      [
        'local-dams',
        {
          enabled: false,
          module: {
            getAnalystRecords: () => {
              throw Error('disabled layer read');
            },
          },
        },
      ],
    ]),
  };
  assert.deepEqual(
    searchLoadedRecords(manager, 'AI1').map((r) => r.type),
    ['Aircraft'],
  );
  assert.deepEqual(
    searchLoadedRecords(manager, 'Ocean').map((r) => r.type),
    ['Ship'],
  );
  assert.deepEqual(searchLoadedRecords(manager, 'unknown'), []);
});
