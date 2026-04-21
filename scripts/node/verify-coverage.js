#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  buildCargoCommandEnv,
  getCargoParallelism,
  getRepoRoot,
  runCommandSequence,
} = require('./testing/warning-capture.js');
const {
  COVERAGE_ROOT,
  frontendThresholds,
  backendThresholds,
} = require('./testing/coverage-thresholds.js');

const VALID_TARGETS = new Set(['frontend', 'backend', 'all']);
const FRONTEND_METRICS = ['lines', 'functions', 'statements', 'branches'];
const COVERAGE_SCOPE_LABEL = '1flowbase-verify-coverage';

function parseCliArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    return { help: true, target: 'all' };
  }

  const [target = 'all'] = argv;

  if (!VALID_TARGETS.has(target)) {
    throw new Error(`Unknown coverage target: ${target}`);
  }

  return { help: false, target };
}

function buildFrontendCommand({ repoRoot }) {
  return {
    label: 'frontend-coverage',
    command: 'pnpm',
    args: ['--dir', 'web/app', 'test:coverage'],
    cwd: repoRoot,
  };
}

function buildBackendCommands({ repoRoot, cargoParallelism }) {
  return backendThresholds.map((entry) => ({
    label: `backend-coverage-${entry.key}`,
    command: 'cargo',
    args: [
      'llvm-cov',
      '--package',
      entry.packageName,
      '--json',
      '--summary-only',
      '--output-path',
      path.join(repoRoot, COVERAGE_ROOT, 'backend', `${entry.key}.json`),
    ],
    cwd: 'api',
    env: buildCargoCommandEnv({ cargoParallelism, disableIncremental: true }),
  }));
}

function buildBackendCleanupCommands() {
  return [
    {
      label: 'backend-coverage-clean',
      command: 'cargo',
      args: ['llvm-cov', 'clean', '--workspace'],
      cwd: 'api',
    },
  ];
}

function usage(writeStdout = (text) => process.stdout.write(text)) {
  writeStdout(
    'Usage: node scripts/node/verify-coverage.js [frontend|backend|all]\n'
      + 'Runs repository-owned coverage gates for frontend, backend, or both.\n'
  );
}

function normalizeCoveragePath(filePath) {
  return filePath.replace(/\\/gu, '/');
}

function readMetricPct(metricSummary) {
  if (!metricSummary || typeof metricSummary !== 'object') {
    return null;
  }

  if (
    Number.isFinite(metricSummary.total)
    && Number.isFinite(metricSummary.covered)
    && metricSummary.total > 0
  ) {
    return (metricSummary.covered / metricSummary.total) * 100;
  }

  if (Number.isFinite(metricSummary.pct)) {
    return metricSummary.pct;
  }

  return null;
}

function aggregateMetric(matchedEntries, metric) {
  let weightedCovered = 0;
  let weightedTotal = 0;
  let pctSum = 0;
  let pctCount = 0;

  for (const entry of matchedEntries) {
    const metricSummary = entry[metric];

    if (
      metricSummary
      && Number.isFinite(metricSummary.total)
      && Number.isFinite(metricSummary.covered)
      && metricSummary.total > 0
    ) {
      weightedCovered += metricSummary.covered;
      weightedTotal += metricSummary.total;
      continue;
    }

    const pct = readMetricPct(metricSummary);

    if (pct !== null) {
      pctSum += pct;
      pctCount += 1;
    }
  }

  if (weightedTotal > 0) {
    return (weightedCovered / weightedTotal) * 100;
  }

  if (pctCount > 0) {
    return pctSum / pctCount;
  }

  return 0;
}

function matchesFrontendThreshold(filePath, prefix) {
  return normalizeCoveragePath(filePath).includes(`/${prefix}`);
}

function collectFrontendCoverageFailures(summary) {
  const entries = Object.entries(summary).filter(([filePath]) => filePath !== 'total');

  return frontendThresholds.flatMap((threshold) => {
    const matchedEntries = entries
      .filter(([filePath]) => matchesFrontendThreshold(filePath, threshold.prefix))
      .map(([, coverage]) => coverage);

    return FRONTEND_METRICS.flatMap((metric) => {
      const actualPct = aggregateMetric(matchedEntries, metric);
      const expectedPct = threshold.thresholds[metric];

      if (actualPct + Number.EPSILON >= expectedPct) {
        return [];
      }

      return [{
        key: threshold.key,
        prefix: threshold.prefix,
        metric,
        expectedPct,
        actualPct,
      }];
    });
  });
}

function readBackendLinePct(summary) {
  return summary?.data?.[0]?.totals?.lines?.percent ?? 0;
}

function collectBackendCoverageFailures(summaries) {
  return backendThresholds.flatMap((threshold) => {
    const actualPct = readBackendLinePct(summaries[threshold.key]);
    const expectedPct = threshold.line;

    if (actualPct + Number.EPSILON >= expectedPct) {
      return [];
    }

    return [{
      key: threshold.key,
      metric: 'lines',
      expectedPct,
      actualPct,
    }];
  });
}

function ensureCargoLlvmCovInstalled(spawnSyncImpl = spawnSync, deps = {}) {
  const repoRoot = deps.repoRoot || getRepoRoot();
  const result = spawnSyncImpl('cargo', ['llvm-cov', '--help'], {
    cwd: path.join(repoRoot, 'api'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      'cargo llvm-cov is required for backend coverage. Install it with: cargo install cargo-llvm-cov --locked'
    );
  }
}

function ensureCoverageOutputDirs(repoRoot, target) {
  if (target === 'frontend' || target === 'all') {
    fs.mkdirSync(path.join(repoRoot, COVERAGE_ROOT, 'frontend'), { recursive: true });
  }

  if (target === 'backend' || target === 'all') {
    fs.mkdirSync(path.join(repoRoot, COVERAGE_ROOT, 'backend'), { recursive: true });
  }
}

function readJsonFile(filePath, readFileSyncImpl = fs.readFileSync) {
  return JSON.parse(readFileSyncImpl(filePath, 'utf8'));
}

function loadFrontendCoverageSummary(repoRoot, readFileSyncImpl = fs.readFileSync) {
  return readJsonFile(
    path.join(repoRoot, COVERAGE_ROOT, 'frontend', 'coverage-summary.json'),
    readFileSyncImpl
  );
}

function loadBackendCoverageSummaries(repoRoot, readFileSyncImpl = fs.readFileSync) {
  return Object.fromEntries(
    backendThresholds.map((entry) => [
      entry.key,
      readJsonFile(
        path.join(repoRoot, COVERAGE_ROOT, 'backend', `${entry.key}.json`),
        readFileSyncImpl
      ),
    ])
  );
}

function formatPct(value) {
  return value.toFixed(2);
}

function reportCoverageThresholds({
  repoRoot,
  target,
  readFileSyncImpl = fs.readFileSync,
  writeStdout = (text) => process.stdout.write(text),
  writeStderr = (text) => process.stderr.write(text),
}) {
  const failures = [];

  if (target === 'frontend' || target === 'all') {
    failures.push(...collectFrontendCoverageFailures(loadFrontendCoverageSummary(repoRoot, readFileSyncImpl)));
  }

  if (target === 'backend' || target === 'all') {
    failures.push(...collectBackendCoverageFailures(loadBackendCoverageSummaries(repoRoot, readFileSyncImpl)));
  }

  if (failures.length > 0) {
    writeStderr(`[${COVERAGE_SCOPE_LABEL}] Coverage threshold failures:\n`);

    for (const failure of failures) {
      writeStderr(
        `- ${failure.key} ${failure.metric}: expected >= ${formatPct(failure.expectedPct)}%, `
          + `received ${formatPct(failure.actualPct)}%\n`
      );
    }

    return 1;
  }

  writeStdout(`[${COVERAGE_SCOPE_LABEL}] Coverage thresholds passed for ${target}.\n`);
  return 0;
}

function main(argv = [], deps = {}) {
  const options = parseCliArgs(argv);

  if (options.help) {
    usage(deps.writeStdout);
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();
  const cargoParallelism = deps.cargoParallelism || getCargoParallelism();

  if (options.target === 'backend' || options.target === 'all') {
    ensureCargoLlvmCovInstalled(deps.preflightSpawnSyncImpl, { repoRoot });
  }

  ensureCoverageOutputDirs(repoRoot, options.target);

  const commands = [];

  if (options.target === 'frontend' || options.target === 'all') {
    commands.push(buildFrontendCommand({ repoRoot }));
  }

  if (options.target === 'backend' || options.target === 'all') {
    commands.push(...buildBackendCommands({ repoRoot, cargoParallelism }));
  }

  const env = deps.env || process.env;
  const shouldCleanupBackendCoverage = options.target === 'backend' || options.target === 'all';
  let status = 0;

  if (shouldCleanupBackendCoverage) {
    status = runCommandSequence({
      repoRoot,
      env,
      scope: `verify-coverage-${options.target}-clean-before`,
      commands: buildBackendCleanupCommands(),
      spawnSyncImpl: deps.spawnSyncImpl,
      writeStdout: deps.writeStdout,
      writeStderr: deps.writeStderr,
    });
  }

  if (status === 0) {
    status = runCommandSequence({
      repoRoot,
      env,
      scope: `verify-coverage-${options.target}`,
      commands,
      spawnSyncImpl: deps.spawnSyncImpl,
      writeStdout: deps.writeStdout,
      writeStderr: deps.writeStderr,
    });
  }

  if (status === 0) {
    status = reportCoverageThresholds({
      repoRoot,
      target: options.target,
      readFileSyncImpl: deps.readFileSyncImpl,
      writeStdout: deps.writeStdout,
      writeStderr: deps.writeStderr,
    });
  }

  if (shouldCleanupBackendCoverage) {
    const cleanupStatus = runCommandSequence({
      repoRoot,
      env,
      scope: `verify-coverage-${options.target}-clean-after`,
      commands: buildBackendCleanupCommands(),
      spawnSyncImpl: deps.spawnSyncImpl,
      writeStdout: deps.writeStdout,
      writeStderr: deps.writeStderr,
    });

    if (status === 0 && cleanupStatus !== 0) {
      status = cleanupStatus;
    }
  }

  return status;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[${COVERAGE_SCOPE_LABEL}] ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseCliArgs,
  buildFrontendCommand,
  buildBackendCommands,
  buildBackendCleanupCommands,
  collectFrontendCoverageFailures,
  collectBackendCoverageFailures,
  ensureCargoLlvmCovInstalled,
  main,
};
