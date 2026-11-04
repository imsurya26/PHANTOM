import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRadioDirectory } from './radioDirectory.js';

const stations = [
  { id: 'a', name: 'Coast FM', country: 'India', countryCode: 'IN', state: 'Tamil Nadu', languages: ['Tamil'], tags: ['jazz'] },
  { id: 'b', name: 'Coast FM', country: 'United States', state: 'California', languages: ['English'], tags: ['jazz'] },
  { id: 'c', name: 'City', country: 'India', languages: [], tags: ['news'] },
];
test('radio directory combines all filters without inventing missing metadata', () => {
  assert.deepEqual(filterRadioDirectory(stations, { station: ' coast ', country: 'INDIA', region: 'nadu', language: 'Tamil', genre: 'jazz' }).matches.map(s => s.id), ['a']);
  assert.equal(filterRadioDirectory(stations, { region: 'unknown' }).total, 0);
  assert.equal(filterRadioDirectory([], {}).total, 0);
});
test('radio directory bounds rendered results while reporting the actual match count', () => {
  const result = filterRadioDirectory(stations, {}, 1);
  assert.equal(result.total, 3);
  assert.equal(result.matches.length, 1);
  assert.equal(stations.length, 3);
});
