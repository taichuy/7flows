const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildCleanupPlan,
  parseCliArgs,
  runArtifactCleanup,
  sumTargetBytes,
} = require('../core.js');

function writeFixtureFile(filePath, content = 'fixture\n') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

test('parseCliArgs defaults to a status dry-run', () => {
  assert.deepEqual(parseCliArgs([]), {
    apply: false,
    help: false,
    profile: 'status',
  });
});

test('backend-cache profile removes cargo incremental and llvm-cov targets without deleting debug deps', () => {
  const plan = buildCleanupPlan({
    repoRoot: '/repo',
    profile: 'backend-cache',
  });
  const relativePaths = plan.targets.map((target) => target.relativePath);

  assert.deepEqual(relativePaths, [
    path.join('api', 'target', 'debug', 'incremental'),
    path.join('api', 'target', 'llvm-cov-target'),
    path.join('api', 'target', 'tmp'),
  ]);
  assert.equal(relativePaths.includes(path.join('api', 'target', 'debug', 'deps')), false);
});

test('sumTargetBytes avoids double counting nested status paths', () => {
  assert.equal(
    sumTargetBytes([
      {
        absolutePath: path.join('/repo', 'api', 'target'),
        relativePath: path.join('api', 'target'),
        sizeBytes: 100,
      },
      {
        absolutePath: path.join('/repo', 'api', 'target', 'debug', 'incremental'),
        relativePath: path.join('api', 'target', 'debug', 'incremental'),
        sizeBytes: 40,
      },
      {
        absolutePath: path.join('/repo', 'web', 'app', 'dist'),
        relativePath: path.join('web', 'app', 'dist'),
        sizeBytes: 5,
      },
    ]),
    105
  );
});

test('runArtifactCleanup keeps files during dry-run and removes selected artifacts with apply', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-clean-artifacts-'));
  const distFile = path.join(repoRoot, 'web', 'app', 'dist', 'bundle.js');
  const incrementalFile = path.join(repoRoot, 'api', 'target', 'debug', 'incremental', 'state.bin');
  const depsFile = path.join(repoRoot, 'api', 'target', 'debug', 'deps', 'api_server_test');
  const governanceFile = path.join(repoRoot, 'tmp', 'test-governance', 'coverage', 'coverage-summary.json');

  writeFixtureFile(distFile);
  writeFixtureFile(incrementalFile);
  writeFixtureFile(depsFile);
  writeFixtureFile(governanceFile);

  const dryRunOutput = [];
  const dryRunStatus = runArtifactCleanup({
    repoRoot,
    options: parseCliArgs(['all']),
    writeStdout: (text) => dryRunOutput.push(text),
  });

  assert.equal(dryRunStatus, 0);
  assert.equal(fs.existsSync(distFile), true);
  assert.equal(fs.existsSync(incrementalFile), true);
  assert.match(dryRunOutput.join(''), /dry-run/u);

  const applyOutput = [];
  const applyStatus = runArtifactCleanup({
    repoRoot,
    options: parseCliArgs(['all', '--apply']),
    writeStdout: (text) => applyOutput.push(text),
  });

  assert.equal(applyStatus, 0);
  assert.equal(fs.existsSync(path.dirname(distFile)), false);
  assert.equal(fs.existsSync(path.dirname(incrementalFile)), false);
  assert.equal(fs.existsSync(depsFile), true);
  assert.equal(fs.existsSync(governanceFile), true);
  assert.match(applyOutput.join(''), /removed/u);
});
