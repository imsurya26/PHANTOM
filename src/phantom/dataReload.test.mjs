import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataReloader } from './dataReload.js';

test('manual reload bounds concurrent requests, isolates failures and leaves disabled layers alone', async () => {
  let active = 0,
    max = 0;
  const calls = [];
  const rows = ['a', 'b', 'c', 'off'].map((id) => ({
    id,
    enabled: id !== 'off',
    stats: { count: 1 },
  }));
  const manager = {
    getAll: () => rows,
    refreshLayer: async (id) => {
      calls.push(id);
      max = Math.max(max, ++active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      if (id === 'b') throw Error('secret');
      return true;
    },
  };
  const reload = createDataReloader(manager);
  const results = await reload.reloadEnabled();
  assert.equal(max, 2);
  assert.deepEqual(calls.sort(), ['a', 'b', 'c']);
  assert.equal(results.filter((r) => r.ok).length, 2);
  assert.ok(!JSON.stringify(results).includes('secret'));
  await reload.reloadEnabled();
  assert.equal(calls.length, 3);
});

test('overlapping clicks share the same refresh and abort prevents queued requests', async () => {
  let calls = 0;
  const controller = new AbortController();
  const rows = ['a', 'b', 'c'].map((id) => ({ id, enabled: true, stats: {} }));
  const reload = createDataReloader({
    getAll: () => rows,
    refreshLayer: async () => {
      calls++;
      await new Promise((resolve) => setImmediate(resolve));
      controller.abort();
      return true;
    },
  });
  await Promise.all([reload.reload('a'), reload.reload('a')]);
  assert.equal(calls, 1);
  await reload.reloadEnabled({ signal: controller.signal });
  assert.equal(calls, 1);
});
