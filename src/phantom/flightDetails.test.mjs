import test from 'node:test';
import assert from 'node:assert/strict';
import { flightDetailRows } from './flightDetails.js';

test('flight details never infer schedules or operational status from telemetry', () => {
  const rows = Object.fromEntries(
    flightDetailRows({
      callsign: ' TEST ',
      altitudeM: 0,
      velocityMps: 0,
      track: 0,
      onGround: true,
    }),
  );
  assert.equal(rows['Callsign / flight number'], 'TEST');
  assert.equal(rows['Reported altitude'], '0 ft');
  assert.equal(rows['Reported speed'], '0 kt');
  assert.equal(rows['Reported heading'], '0 °');
  for (const field of [
    'Scheduled departure',
    'Estimated / actual departure',
    'Scheduled arrival',
    'Estimated arrival',
    'Flight status',
  ])
    assert.equal(rows[field], 'Unavailable');
});

test('flight details label enrichment and reject missing or invalid telemetry', () => {
  const rows = Object.fromEntries(
    flightDetailRows({
      origin: 'AAA',
      destination: 'BBB',
      altitudeM: null,
      velocityMps: NaN,
      track: -1,
    }),
  );
  assert.equal(rows['Origin · inferred route'], 'AAA');
  assert.equal(rows['Destination · inferred route'], 'BBB');
  for (const field of [
    'Reported altitude',
    'Reported speed',
    'Reported heading',
    'Aircraft type',
  ])
    assert.equal(rows[field], 'Unavailable');
});
