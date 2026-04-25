const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  resolveNodeBinaryFromPath,
  buildNodePreferredEnv,
} = require('../node-runtime.js');

function createCorepackLayout() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-node-runtime-'));
  const versionRoot = path.join(tempDir, 'nvm', 'versions', 'node', 'v22.12.0');
  const nodePath = path.join(versionRoot, 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
  const pnpmPath = path.join(versionRoot, 'lib', 'node_modules', 'corepack', 'dist', 'pnpm.js');
  const shimDir = path.join(tempDir, 'bin');

  fs.mkdirSync(path.dirname(nodePath), { recursive: true });
  fs.writeFileSync(nodePath, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
  fs.chmodSync(nodePath, 0o755);

  fs.mkdirSync(path.dirname(pnpmPath), { recursive: true });
  fs.writeFileSync(pnpmPath, '#!/usr/bin/env node\n', 'utf8');
  fs.chmodSync(pnpmPath, 0o755);

  fs.mkdirSync(shimDir, { recursive: true });
  fs.symlinkSync(pnpmPath, path.join(shimDir, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'));

  return {
    nodePath,
    shimDir,
  };
}

test('resolveNodeBinaryFromPath follows corepack pnpm.js back to the owning Node version', () => {
  const { nodePath, shimDir } = createCorepackLayout();

  assert.equal(
    resolveNodeBinaryFromPath({ PATH: shimDir }),
    fs.realpathSync(nodePath)
  );
});

test('buildNodePreferredEnv honors ONEFLOWBASE_NODE as an explicit real-node override', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-node-runtime-override-'));
  const nodePath = path.join(tempDir, process.platform === 'win32' ? 'node.exe' : 'node');

  fs.writeFileSync(nodePath, '#!/usr/bin/env bash\nexit 0\n', 'utf8');
  fs.chmodSync(nodePath, 0o755);

  const result = buildNodePreferredEnv({
    PATH: '/tmp/not-real-node',
    ONEFLOWBASE_NODE: nodePath,
  });

  assert.equal(result.nodeBinary, fs.realpathSync(nodePath));
  assert.equal(result.env.NODE, fs.realpathSync(nodePath));
  assert.equal(result.env.npm_node_execpath, fs.realpathSync(nodePath));
  assert.equal(result.env.PATH.split(path.delimiter)[0], path.dirname(fs.realpathSync(nodePath)));
});
