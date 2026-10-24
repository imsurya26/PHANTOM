import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCameraMedia } from './cctvMediaStatus.js';
test('successful HTTP and a live source label cannot imply live video', () => {
  assert.match(
    classifyCameraMedia({
      sourceKind: 'live',
      sourceStatus: 'ok',
      feedType: 'hls',
      isVideo: true,
    }),
    /^Unknown/,
  );
});
test('finite moving clips are recorded video', () => {
  assert.match(
    classifyCameraMedia({
      isVideo: true,
      mediaDecoded: true,
      mediaMoving: true,
      mediaDuration: 11,
      feedType: 'mp4',
    }),
    /^Recorded/,
  );
});
test('decoded advancing nonfinite HLS can be described as live', () => {
  assert.match(
    classifyCameraMedia({
      isVideo: true,
      mediaDecoded: true,
      mediaMoving: true,
      mediaDuration: Infinity,
      feedType: 'hls',
    }),
    /^Live video/,
  );
});
test('snapshot acquisition never fabricates capture time', () => {
  assert.equal(
    classifyCameraMedia({
      sourceKind: 'snapshot',
      sourceStatus: 'ok',
      checkedAt: Date.now(),
    }),
    'Snapshot · capture time unknown',
  );
});
