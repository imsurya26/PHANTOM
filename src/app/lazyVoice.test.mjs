import test from 'node:test';
import assert from 'node:assert/strict';
import { createLazyVoice } from './lazyVoice.js';

test('voice stays unloaded until requested and concurrent requests share initialization', async () => {
  let loads = 0,
    initialized = 0;
  const voice = createLazyVoice({}, async () => {
    loads++;
    return {
      initGevVoiceCommands() {
        initialized++;
        return { runner: (n) => n, stop() {} };
      },
    };
  });
  assert.equal(loads, 0);
  assert.deepEqual(await Promise.all([voice.runner('a'), voice.runner('b')]), [
    'a',
    'b',
  ]);
  assert.equal(loads, 1);
  assert.equal(initialized, 1);
});
test('disposing while voice chunk loads prevents controls mounting', async () => {
  let resolve,
    initialized = false;
  const voice = createLazyVoice(
    {},
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = voice.open();
  voice.stop({ removeUi: true });
  resolve({
    initGevVoiceCommands() {
      initialized = true;
    },
  });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(initialized, false);
});
