const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const homeApiPath = path.join(
  repoRoot,
  'web',
  'app',
  'src',
  'features',
  'home',
  'api',
  'health.ts'
);
const apiClientPath = path.join(repoRoot, 'web', 'packages', 'api-client', 'src', 'index.ts');
const transportPath = path.join(
  repoRoot,
  'web',
  'packages',
  'api-client',
  'src',
  'transport.ts'
);
const envExamplePath = path.join(repoRoot, 'web', 'app', '.env.example');

test('frontend API defaults point to the new backend port', () => {
  const homeApiSource = fs.readFileSync(homeApiPath, 'utf8');
  const apiClientSource = fs.readFileSync(apiClientPath, 'utf8');
  const transportSource = fs.readFileSync(transportPath, 'utf8');
  const envExampleSource = fs.readFileSync(envExamplePath, 'utf8');

  assert.match(homeApiSource, /getDefaultApiBaseUrl/u);
  assert.match(apiClientSource, /transport/u);
  assert.match(transportSource, /locationLike\?\.hostname/u);
  assert.match(transportSource, /:7800/u);
  assert.match(envExampleSource, /current frontend origin/u);
});
