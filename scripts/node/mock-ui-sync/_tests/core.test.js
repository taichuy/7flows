const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseCliArgs, syncMockUiWorkspace } = require('../core.js');

test('parseCliArgs defaults to rebuilding web into tmp/mock-ui on port 3210', () => {
  assert.deepEqual(parseCliArgs([]), {
    help: false,
    source: 'web',
    target: path.join('tmp', 'mock-ui'),
    port: 3210,
  });
});

test('syncMockUiWorkspace resets the sandbox, copies source files, and rewrites vite port', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-mock-ui-'));
  const sourceDir = path.join(repoRoot, 'web');
  const targetDir = path.join(repoRoot, 'tmp', 'mock-ui');
  const sourceAppDir = path.join(sourceDir, 'app');
  const sourcePackagesDir = path.join(sourceDir, 'packages', 'ui', 'src');

  fs.mkdirSync(sourceAppDir, { recursive: true });
  fs.mkdirSync(sourcePackagesDir, { recursive: true });
  fs.mkdirSync(path.join(sourceDir, 'node_modules', 'left-pad'), { recursive: true });
  fs.mkdirSync(path.join(sourceAppDir, 'dist'), { recursive: true });

  fs.writeFileSync(
    path.join(sourceDir, 'package.json'),
    JSON.stringify({ name: 'mock-web-workspace' }, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(sourceAppDir, 'vite.config.ts'),
    [
      'export default {',
      '  server: {',
      "    host: '0.0.0.0',",
      '    port: 3100,',
      '    strictPort: true',
      '  }',
      '};',
      '',
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(path.join(sourcePackagesDir, 'index.tsx'), 'export const ui = true;\n', 'utf8');
  fs.writeFileSync(path.join(sourceDir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1;\n', 'utf8');
  fs.writeFileSync(path.join(sourceAppDir, 'dist', 'artifact.js'), 'artifact\n', 'utf8');

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'stale.txt'), 'stale\n', 'utf8');

  syncMockUiWorkspace({ repoRoot });

  assert.equal(fs.existsSync(path.join(targetDir, 'stale.txt')), false);
  assert.equal(fs.existsSync(path.join(targetDir, 'package.json')), true);
  assert.equal(fs.existsSync(path.join(targetDir, 'packages', 'ui', 'src', 'index.tsx')), true);
  assert.equal(fs.existsSync(path.join(targetDir, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(targetDir, 'app', 'dist')), false);

  const viteConfig = fs.readFileSync(path.join(targetDir, 'app', 'vite.config.ts'), 'utf8');
  assert.match(viteConfig, /port:\s*3210/u);
  assert.doesNotMatch(viteConfig, /port:\s*3100/u);
});
