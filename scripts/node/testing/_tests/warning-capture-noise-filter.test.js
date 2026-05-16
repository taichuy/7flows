const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { runCommandSequence } = require('../warning-capture.js');

test('runCommandSequence ignores known tool progress stderr on successful commands', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-warning-capture-'));
  const warningLogPath = path.join(repoRoot, 'tmp', 'test-governance', 'tool-progress.warnings.log');

  const status = runCommandSequence({
    repoRoot,
    scope: 'tool-progress',
    commands: [
      { label: 'cargo-clippy', command: 'cargo', args: ['clippy'] },
      { label: 'frontend-lint', command: 'pnpm', args: ['lint'] },
    ],
    spawnSyncImpl(command) {
      if (command === 'cargo') {
        return {
          status: 0,
          stdout: '',
          stderr: [
            '    Updating crates.io index',
            ' Downloading crates ...',
            '  Downloaded serde v1.0.228',
            '   Compiling api-server v0.1.0 (/repo/api/apps/api-server)',
            '    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.23s',
          ].join('\n'),
        };
      }

      return {
        status: 0,
        stdout: '',
        stderr: [
          'Attention:',
          '• turbo 2.9.6',
          'Turborepo now collects completely anonymous telemetry regarding usage.',
          'This information is used to shape the Turborepo roadmap and prioritize features.',
          "You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:",
          'https://turborepo.dev/docs/telemetry',
        ].join('\n'),
      };
    },
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(status, 0);
  assert.equal(fs.existsSync(warningLogPath), false);
});

test('runCommandSequence keeps full stderr for failed commands', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-warning-capture-'));
  const warningLogPath = path.join(repoRoot, 'tmp', 'test-governance', 'failed-progress.warnings.log');

  const status = runCommandSequence({
    repoRoot,
    scope: 'failed-progress',
    commands: [
      { label: 'cargo-test', command: 'cargo', args: ['test'] },
    ],
    spawnSyncImpl() {
      return {
        status: 1,
        stdout: '',
        stderr: [
          '   Compiling api-server v0.1.0 (/repo/api/apps/api-server)',
          'error: test failed, to rerun pass `-p api-server --lib`',
        ].join('\n'),
      };
    },
    writeStdout() {},
    writeStderr() {},
  });

  const warningLog = fs.readFileSync(warningLogPath, 'utf8');
  assert.equal(status, 1);
  assert.match(warningLog, /Compiling api-server/u);
  assert.match(warningLog, /error: test failed/u);
});
