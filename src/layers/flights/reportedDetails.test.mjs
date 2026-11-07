import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createQueries } from './queries.js';

test('flight details preserve reported aircraft identity despite a visual model override', () => {
  const record = { callsign: 'TEST', typeName: 'Boeing 787', typeCode: 'B789', altitude: 1000, velocity: 0, true_track: 0 };
  const queries = createQueries({
    flightState: {
      _trackedIcao: 'test',
      records: { data: new Map([['test', record]]), missingPolls: new Map() },
      _billboards: new Map(), feed: {}, _scratchCarto: new Cesium.Cartographic(),
    },
    services: {
      aircraftPresentation: { tr3bTypeLabel: () => 'TR-3B' },
      labels: {}, militaryRegistry: {}, camera: {}, focus: {}, recession: {},
    },
    parts: { testing: {}, motion: { _deadReckon: () => Cesium.Cartesian3.fromDegrees(0, 0, 1000) } },
  });
  const info = queries.methods.getTrackedFlightDetails();
  assert.equal(info.typeName, 'Boeing 787');
  assert.equal(info.typeCode, 'B789');
  assert.equal(info.velocityMps, 0);
  assert.equal(info.track, 0);
});
