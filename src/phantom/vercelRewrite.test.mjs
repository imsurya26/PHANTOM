import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreApiUrl } from '../../server/vercel/rewrite.js';

test('Vercel rewrite restores nested API paths and provider parameters', () => {
  assert.equal(
    restoreApiUrl('/api?__phantom_route=providers/status'),
    '/api/providers/status',
  );
  assert.equal(
    restoreApiUrl('/api?__phantom_route=air-quality/locations&lat=13&lon=80'),
    '/api/air-quality/locations?lat=13&lon=80',
  );
  assert.equal(
    restoreApiUrl('/api?__phantom_route=gemini/token'),
    '/api/gemini/token',
  );
});
test('rewrite rejects ambiguous paths and preserves direct API requests', () => {
  assert.equal(
    restoreApiUrl('/api?__phantom_route=../secret'),
    '/invalid-api-path',
  );
  assert.equal(
    restoreApiUrl(
      '/api?__phantom_route=gemini/token&__phantom_route=providers/status',
    ),
    '/invalid-api-path',
  );
  assert.equal(restoreApiUrl('/api/providers/status'), '/api/providers/status');
});
