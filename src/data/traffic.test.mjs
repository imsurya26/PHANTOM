import test from 'node:test';
import assert from 'node:assert/strict';
import trafficLayer, { deriveTrafficFlowError, trafficFeedPresentation } from './traffic.js';
import { layerFeedState } from './manager.js';

test('superseded traffic flow is not an outage', () => {
  assert.equal(deriveTrafficFlowError({name:'AbortError'}),null);
  assert.equal(deriveTrafficFlowError(null),null);
});

test('keyless and failed flow use real road reference without live or simulation claims', () => {
  for(const input of [{},{liveMode:false},{statusUnavailable:true},{liveMode:true,coveragePct:0},{liveMode:true,coveragePct:90,flowError:'upstream unavailable'}]) {
    const result=trafficFeedPresentation(input);
    assert.equal(result.mode,'reference');
    assert.equal(result.fallback,true);
    assert.match(result.loadingLabel,/TRAFFIC REFERENCE/);
    assert.doesNotMatch(result.loadingLabel,/SIMULATED|\bLIVE\b|key/);
    assert.equal(layerFeedState({...result,count:5}),'fallback');
  }
});

test('only genuine healthy flow coverage can claim measured live road conditions', () => {
  const result=trafficFeedPresentation({liveMode:true,coveragePct:87});
  assert.equal(result.mode,'live');
  assert.equal(result.fallback,false);
  assert.match(result.loadingLabel,/LIVE TRAFFIC FLOW/);
  assert.match(result.loadingLabel,/87% measured roads/);
  assert.match(result.loadingLabel,/no individual vehicle locations/);
  assert.equal(layerFeedState({...result,count:5}),'nominal');
});

test('loading preserves road reference semantics without claiming live data', () => {
  const result=trafficFeedPresentation({fetching:true});
  assert.equal(result.mode,'reference');
  assert.equal(result.loadingLabel,'Loading road conditions');
});

test('shipped traffic layer starts with no invented vehicles and can be destroyed repeatedly', () => {
  const stats=trafficLayer.getStats();
  assert.equal(stats.mode,'reference');
  assert.equal(stats.dataKind,'reference');
  assert.equal(stats.vehicleCount,0);
  assert.equal(layerFeedState(stats),'fallback');
  const viewer={camera:{changed:{removeEventListener(){}}}};
  assert.doesNotThrow(()=>trafficLayer.destroy(viewer));
  assert.doesNotThrow(()=>trafficLayer.destroy(viewer));
  assert.equal(trafficLayer.getStats().count,0);
});
