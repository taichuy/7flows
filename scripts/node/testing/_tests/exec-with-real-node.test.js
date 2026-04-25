const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('exec-with-real-node shell launcher forwards child exit codes', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-real-node-launcher-'));
  const binDir = path.join(tempDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.symlinkSync(process.execPath, path.join(binDir, 'pnpm'));
  fs.symlinkSync(process.execPath, path.join(binDir, 'node'));

  const childScript = path.join(tempDir, 'exit-code.js');
  fs.writeFileSync(
    childScript,
    'process.exit(Number(process.argv[2] ?? 0));\n',
    'utf8'
  );

  const launcherPath = path.join(process.cwd(), 'scripts/node/exec-with-real-node.sh');
  const result = spawnSync(
    'bash',
    [launcherPath, childScript, '7'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      },
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 7);
  assert.equal(result.signal, null);
});

test('exec-with-real-node shell launcher follows corepack pnpm.js back to real Node', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-real-node-corepack-'));
  const versionRoot = path.join(tempDir, 'nvm', 'versions', 'node', 'v22.12.0');
  const nodePath = path.join(versionRoot, 'bin', 'node');
  const pnpmPath = path.join(versionRoot, 'lib', 'node_modules', 'corepack', 'dist', 'pnpm.js');
  const shimDir = path.join(tempDir, 'bin');
  const markerPath = path.join(tempDir, 'selected-node.txt');

  fs.mkdirSync(path.dirname(nodePath), { recursive: true });
  fs.writeFileSync(
    nodePath,
    `#!/usr/bin/env bash\nprintf '%s' "$0" > "${markerPath}"\nexit "$2"\n`,
    'utf8'
  );
  fs.chmodSync(nodePath, 0o755);

  fs.mkdirSync(path.dirname(pnpmPath), { recursive: true });
  fs.writeFileSync(pnpmPath, '#!/usr/bin/env node\n', 'utf8');
  fs.chmodSync(pnpmPath, 0o755);

  fs.mkdirSync(shimDir, { recursive: true });
  fs.symlinkSync(pnpmPath, path.join(shimDir, 'pnpm'));

  const childScript = path.join(tempDir, 'exit-code.js');
  fs.writeFileSync(childScript, 'process.exit(Number(process.argv[2] ?? 0));\n', 'utf8');

  const launcherPath = path.join(process.cwd(), 'scripts/node/exec-with-real-node.sh');
  const result = spawnSync(
    'bash',
    [launcherPath, childScript, '9'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
      },
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 9);
  assert.equal(fs.readFileSync(markerPath, 'utf8'), fs.realpathSync(nodePath));
});
