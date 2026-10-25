import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('satellite startup leaves photoreal construction to the lazy map source', async () => {
  const source = await readFile(new URL('./scene.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /await loadPhotorealisticTileset\(/);
  assert.match(source, /initialStack: 'esri-imagery'/);
});
