import test from 'node:test';
import assert from 'node:assert/strict';
import { createTracking } from './tracking.js';

function label(record) {
  const services = Object.fromEntries(
    [
      'context',
      'trails',
      'geoid',
      'groundFloor',
      'focus',
      'militaryRegistry',
      'readout',
      'camera',
      'picking',
    ].map((key) => [key, {}]),
  );
  services.aircraftPresentation = { isTr3b: () => false };
  const tracking = createTracking({
    services,
    flightState: {
      records: { data: new Map([['test', record]]), missingPolls: new Map() },
      feed: {},
    },
    parts: { queries: { _contactLabel: () => 'TEST' } },
  });
  return tracking._trackedLabelText('test');
}

test('tracked flight readout distinguishes absent telemetry from measured zero', () => {
  assert.equal(label({}), 'TEST · Altitude unavailable · Speed unavailable');
  assert.equal(
    label({ altitude: null, velocity: NaN }),
    'TEST · Altitude unavailable · Speed unavailable',
  );
  assert.equal(label({ altitude: 0, velocity: 0 }), 'TEST · 0 ft · 0 kts');
  assert.equal(
    label({ altitude: Infinity, velocity: -1 }),
    'TEST · Altitude unavailable · Speed unavailable',
  );
});

test('tracked flight readout retains measured aviation units', () => {
  assert.equal(
    label({ altitude: 3048, velocity: 100 }),
    'TEST · 10000 ft · 194 kts',
  );
  assert.equal(
    label({ altitude: 9144, velocity: 200 }),
    'TEST · FL300 · 389 kts',
  );
});
