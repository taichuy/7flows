#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  buildCargoCommandEnv,
  getRepoRoot,
  runCommandSequence,
  runManagedCommandSequence,
} = require('../testing/warning-capture.js');
const { loadVerifyRuntimeConfig } = require('../testing/verify-runtime.js');
const { resolveNodeBinaryFromPath } = require('../testing/node-runtime.js');
const {
  COVERAGE_ROOT,
  frontendThresholds,
  backendThresholds,
} = require('../testing/coverage-thresholds.js');

const VALID_COVERAGE_TARGETS = new Set(['frontend', 'backend', 'all']);
const VERIFY_COMMANDS = new Set(['backend', 'ci', 'coverage', 'repo']);
const FRONTEND_METRICS = ['lines', 'functions', 'statements', 'branches'];
const COVERAGE_SCOPE_LABEL = '1flowbase-verify-coverage';

function resolveScriptsNodeEntry(repoRoot, entryName) {
  return path.join(repoRoot, 'scripts', 'node', entryName);
}

function resolveScriptsNodeCliEntry(repoRoot, entryName) {
  return `${resolveScriptsNodeEntry(repoRoot, entryName)}.js`;
}

function buildBackendCommands({ cargoJobs, cargoTestThreads }) {
  return [
    {
      label: 'cargo-fmt',
      command: 'cargo',
      args: ['fmt', '--all', '--check'],
      cwd: 'api',
      env: buildCargoCommandEnv({ cargoParallelism: cargoJobs }),
    },
    {
      label: 'cargo-clippy',
      command: 'cargo',
      args: ['clippy', '--workspace', '--all-targets', '--jobs', String(cargoJobs), '--', '-D', 'warnings'],
      cwd: 'api',
      env: buildCargoCommandEnv({ cargoParallelism: cargoJobs, disableIncremental: true }),
    },
    {
      label: 'cargo-test',
      command: 'cargo',
      args: ['test', '--workspace', '--jobs', String(cargoJobs), '--', `--test-threads=${cargoTestThreads}`],
      cwd: 'api',
      env: buildCargoCommandEnv({ cargoParallelism: cargoJobs, disableIncremental: true }),
    },
    {
      label: 'cargo-check',
      command: 'cargo',
      args: ['check', '--workspace', '--jobs', String(cargoJobs)],
      cwd: 'api',
      env: buildCargoCommandEnv({ cargoParallelism: cargoJobs, disableIncremental: true }),
    },
  ];
}

async function runBackend(_argv = [], deps = {}) {
  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });
  const managedRunner = deps.managedRunnerImpl || runManagedCommandSequence;

  return managedRunner({
    repoRoot,
    env,
    scope: 'verify-backend',
    lockMode: 'heavy',
    commandDisplay: 'node scripts/node/verify-backend.js',
    runtimeConfig,
    commands: buildBackendCommands({
      cargoJobs: runtimeConfig.backend.cargoJobs,
      cargoTestThreads: runtimeConfig.backend.cargoTestThreads,
    }),
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}

function buildCiCommands({ repoRoot, env = process.env }) {
  const nodeBinary = resolveNodeBinaryFromPath(env);

  return [
    {
      label: 'ci-verify-repo',
      command: nodeBinary,
      args: [resolveScriptsNodeCliEntry(repoRoot, 'verify'), 'repo'],
      cwd: repoRoot,
    },
    {
      label: 'ci-verify-coverage',
      command: nodeBinary,
      args: [resolveScriptsNodeCliEntry(repoRoot, 'verify'), 'coverage', 'all'],
      cwd: repoRoot,
    },
  ];
}

function usageCi(writeStdout = (text) => process.stdout.write(text)) {
  writeStdout(
    'Usage: node scripts/node/verify-ci.js\n'
      + 'Runs: verify-repo + verify-coverage all\n'
  );
}

async function runCi(argv = [], deps = {}) {
  if (argv.includes('-h') || argv.includes('--help')) {
    usageCi(deps.writeStdout);
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });
  const managedRunner = deps.managedRunnerImpl || runManagedCommandSequence;

  return managedRunner({
    repoRoot,
    env,
    scope: 'verify-ci',
    lockMode: 'heavy',
    commandDisplay: 'node scripts/node/verify-ci.js',
    runtimeConfig,
    commands: buildCiCommands({ repoRoot, env }),
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}

function parseCoverageCliArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    return { help: true, target: 'all' };
  }

  const [target = 'all'] = argv;

  if (!VALID_COVERAGE_TARGETS.has(target)) {
    throw new Error(`Unknown coverage target: ${target}`);
  }

  return { help: false, target };
}

function buildCoverageFrontendCommand({ repoRoot }) {
  return {
    label: 'frontend-coverage',
    command: 'pnpm',
    args: ['--dir', 'web/app', 'test:coverage'],
    cwd: repoRoot,
  };
}

function buildCoverageBackendCommands({ repoRoot, cargoParallelism, cargoTestThreads }) {
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
      '--',
      `--test-threads=${cargoTestThreads}`,
    ],
    cwd: 'api',
    env: buildCargoCommandEnv({ cargoParallelism, disableIncremental: true }),
  }));
}

function buildCoverageBackendCleanupCommands() {
  return [
    {
      label: 'backend-coverage-clean',
      command: 'cargo',
      args: ['llvm-cov', 'clean', '--workspace'],
      cwd: 'api',
    },
  ];
}

function usageCoverage(writeStdout = (text) => process.stdout.write(text)) {
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

function cleanJsonFiles(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    return;
  }

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      fs.rmSync(path.join(directoryPath, entry.name), { force: true });
    }
  }
}

function cleanCoverageOutputFiles(repoRoot, target) {
  if (target === 'frontend' || target === 'all') {
    fs.rmSync(
      path.join(repoRoot, COVERAGE_ROOT, 'frontend', 'coverage-summary.json'),
      { force: true }
    );
  }

  if (target === 'backend' || target === 'all') {
    cleanJsonFiles(path.join(repoRoot, COVERAGE_ROOT, 'backend'));
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

async function runCoverage(argv = [], deps = {}) {
  const options = parseCoverageCliArgs(argv);

  if (options.help) {
    usageCoverage(deps.writeStdout);
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });
  const managedRunner = deps.managedRunnerImpl || runManagedCommandSequence;
  const coverageCommands = [];

  if (options.target === 'backend' || options.target === 'all') {
    ensureCargoLlvmCovInstalled(deps.preflightSpawnSyncImpl, { repoRoot });
  }

  ensureCoverageOutputDirs(repoRoot, options.target);
  cleanCoverageOutputFiles(repoRoot, options.target);

  if (options.target === 'frontend' || options.target === 'all') {
    coverageCommands.push(buildCoverageFrontendCommand({ repoRoot }));
  }

  if (options.target === 'backend' || options.target === 'all') {
    coverageCommands.push(...buildCoverageBackendCommands({
      repoRoot,
      cargoParallelism: runtimeConfig.backend.cargoJobs,
      cargoTestThreads: runtimeConfig.backend.cargoTestThreads,
    }));
  }

  const shouldCleanupBackendCoverage = options.target === 'backend' || options.target === 'all';
  const commands = shouldCleanupBackendCoverage
    ? [...buildCoverageBackendCleanupCommands(), ...coverageCommands]
    : coverageCommands;

  return managedRunner({
    repoRoot,
    env,
    scope: `verify-coverage-${options.target}`,
    lockMode: 'heavy',
    commandDisplay: `node scripts/node/verify-coverage.js ${options.target}`.trim(),
    runtimeConfig,
    commands,
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
    runCommandSequenceImpl: (sequenceOptions) => {
      let status = 0;

      try {
        status = runCommandSequence({
          ...sequenceOptions,
          commands: sequenceOptions.commands,
        });

        if (status === 0) {
          status = reportCoverageThresholds({
            repoRoot,
            target: options.target,
            readFileSyncImpl: deps.readFileSyncImpl,
            writeStdout: deps.writeStdout,
            writeStderr: deps.writeStderr,
          });
        }
      } finally {
        if (shouldCleanupBackendCoverage) {
          const cleanupStatus = runCommandSequence({
            repoRoot,
            env: sequenceOptions.env,
            scope: `verify-coverage-${options.target}-clean-after`,
            commands: buildCoverageBackendCleanupCommands(),
            spawnSyncImpl: deps.spawnSyncImpl,
            writeStdout: deps.writeStdout,
            writeStderr: deps.writeStderr,
          });

          if (status === 0 && cleanupStatus !== 0) {
            status = cleanupStatus;
          }
        }
      }

      return status;
    },
  });
}

function buildRepoCommands({ repoRoot, env = process.env }) {
  const nodeBinary = resolveNodeBinaryFromPath(env);

  return [
    {
      label: 'repo-script-tests',
      command: nodeBinary,
      args: [resolveScriptsNodeCliEntry(repoRoot, 'test'), 'scripts'],
      cwd: repoRoot,
    },
    {
      label: 'repo-contract-tests',
      command: nodeBinary,
      args: [resolveScriptsNodeCliEntry(repoRoot, 'test'), 'contracts'],
      cwd: repoRoot,
    },
    {
      label: 'repo-frontend-full',
      command: nodeBinary,
      args: [resolveScriptsNodeCliEntry(repoRoot, 'test'), 'frontend', 'full'],
      cwd: repoRoot,
    },
    {
      label: 'repo-backend-full',
      command: nodeBinary,
      args: [resolveScriptsNodeCliEntry(repoRoot, 'verify'), 'backend'],
      cwd: repoRoot,
    },
  ];
}

function usageRepo(writeStdout = (text) => process.stdout.write(text)) {
  writeStdout(
    'Usage: node scripts/node/verify-repo.js\n'
      + 'Runs: scripts/node tests + contract tests + frontend full gate + backend full gate\n'
  );
}

async function runRepo(argv = [], deps = {}) {
  if (argv.includes('-h') || argv.includes('--help')) {
    usageRepo(deps.writeStdout);
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });
  const managedRunner = deps.managedRunnerImpl || runManagedCommandSequence;

  return managedRunner({
    repoRoot,
    env,
    scope: 'verify-repo',
    lockMode: 'heavy',
    commandDisplay: 'node scripts/node/verify-repo.js',
    runtimeConfig,
    commands: buildRepoCommands({ repoRoot, env }),
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}

function parseVerifyCliArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help') || argv.length === 0) {
    return {
      help: true,
      command: null,
      rest: [],
    };
  }

  const [command, ...rest] = argv;
  return {
    help: false,
    command,
    rest,
  };
}

function usage(writeStdout = (text) => process.stdout.write(text)) {
  writeStdout(
    'Usage: node scripts/node/verify <backend|ci|coverage|repo> [args]\n'
  );
}

async function main(argv = [], deps = {}) {
  const options = parseVerifyCliArgs(argv);

  if (options.help) {
    usage(deps.writeStdout);
    return 0;
  }

  if (!VERIFY_COMMANDS.has(options.command)) {
    throw new Error(`Unknown verify command: ${options.command}`);
  }

  if (options.command === 'backend') {
    return (deps.runBackendImpl || runBackend)(options.rest, deps);
  }

  if (options.command === 'ci') {
    return (deps.runCiImpl || runCi)(options.rest, deps);
  }

  if (options.command === 'coverage') {
    return (deps.runCoverageImpl || runCoverage)(options.rest, deps);
  }

  return (deps.runRepoImpl || runRepo)(options.rest, deps);
}

module.exports = {
  buildBackendCommands,
  buildCiCommands,
  buildCoverageBackendCleanupCommands,
  buildCoverageBackendCommands,
  buildCoverageFrontendCommand,
  buildRepoCommands,
  collectBackendCoverageFailures,
  collectFrontendCoverageFailures,
  ensureCargoLlvmCovInstalled,
  main,
  parseCoverageCliArgs,
  parseVerifyCliArgs,
  runBackend,
  runCi,
  runCoverage,
  runRepo,
};
