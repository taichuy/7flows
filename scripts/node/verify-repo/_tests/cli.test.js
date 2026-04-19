const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildCommands, main } = require('../../verify-repo.js');

test('buildCommands composes script tests, frontend full gate and backend verify gate', () => {
  const repoRoot = '/repo-root';

  assert.deepEqual(buildCommands({ repoRoot }), [
    {
      label: 'repo-script-tests',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-scripts.js')],
      cwd: repoRoot,
    },
    {
      label: 'repo-frontend-full',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-frontend.js'), 'full'],
      cwd: repoRoot,
    },
    {
      label: 'repo-backend-full',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'verify-backend.js')],
      cwd: repoRoot,
    },
  ]);
});

test('main runs repository full gate in order and captures advisory output', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-repo-'));
  const calls = [];

  const status = main([], {
    repoRoot,
    env: {},
    writeStdout() {},
    writeStderr() {},
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });

      return {
        status: 0,
        stdout: '',
        stderr: `warning: ${path.basename(args[0])} advisory\n`,
      };
    },
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((call) => call.args),
    [
      [path.join(repoRoot, 'scripts', 'node', 'test-scripts.js')],
      [path.join(repoRoot, 'scripts', 'node', 'test-frontend.js'), 'full'],
      [path.join(repoRoot, 'scripts', 'node', 'verify-backend.js')],
    ]
  );

  const warningLogPath = path.join(repoRoot, 'tmp', 'test-governance', 'verify-repo.warnings.log');
  assert.equal(fs.existsSync(warningLogPath), true);
  const warningLog = fs.readFileSync(warningLogPath, 'utf8');
  assert.match(warningLog, /warning: test-scripts\.js advisory/u);
  assert.match(warningLog, /warning: test-frontend\.js advisory/u);
  assert.match(warningLog, /warning: verify-backend\.js advisory/u);
});
