import test from 'node:test';
import assert from 'node:assert/strict';
import { detectSecrets } from '../../scripts/scan-secrets.mjs';

test('secret scanner detects configured values in raw, encoded and serialized forms without returning them', () => {
  const synthetic =
    ['not', 'a', 'real', 'credential'].join('/') + '\nquoted"value';
  for (const form of [
    synthetic,
    encodeURIComponent(synthetic),
    JSON.stringify(synthetic).slice(1, -1),
    Buffer.from(synthetic).toString('base64'),
  ]) {
    const rules = detectSecrets(`prefix ${form} suffix`, [synthetic]);
    assert.deepEqual(rules, ['configured-private-value']);
    assert.ok(!JSON.stringify(rules).includes(synthetic));
  }
});

test('secret scanner catches provider formats and private assignments built from synthetic material', () => {
  const material = 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0iL';
  const cases = [
    [['-----BEGIN ', 'PRIVATE KEY-----'].join(''), 'private-key'],
    [['AI', 'za', material, 'xY8'].join(''), 'google-key'],
    [['sk-', material, 'xY8'].join(''), 'openai-key'],
    [['ghp_', material, 'xY8z'].join(''), 'github-token'],
    [
      ['OPENAQ_API_KEY', '=', material].join(''),
      'private-credential-assignment',
    ],
  ];
  for (const [value, expectedRule] of cases) {
    assert.ok(detectSecrets(value).includes(expectedRule), expectedRule);
  }
});

test('secret scanner accepts empty env templates and process references', () => {
  const template = [
    'OPENAQ_API_KEY=',
    'GEMINI_API_KEY=',
    'FIRMS_MAP_KEY=',
  ].join('\n');
  assert.deepEqual(detectSecrets(template), []);
  assert.deepEqual(
    detectSecrets('const value = process.env.OPENAQ_API_KEY;'),
    [],
  );
  assert.deepEqual(detectSecrets('OPENAQ_API_KEY=<configured locally>'), []);
  assert.deepEqual(
    detectSecrets(
      'GOOGLE_MAPS_SERVER_API_KEY: fromDotenv.GOOGLE_MAPS_SERVER_API_KEY,',
    ),
    [],
  );
});

test('only exact configured public browser values are allowed in generated assets', () => {
  const publicValue = [
    'AI',
    'za',
    'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0iL',
    'xY8',
  ].join('');
  assert.ok(detectSecrets(publicValue).includes('google-key'));
  assert.deepEqual(detectSecrets(publicValue, [], [publicValue]), []);
  assert.ok(
    detectSecrets(publicValue, [publicValue], [publicValue]).includes(
      'configured-private-value',
    ),
  );
});
