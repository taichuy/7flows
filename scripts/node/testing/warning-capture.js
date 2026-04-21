const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  loadVerifyRuntimeConfig,
  withHeavyVerifyLock,
} = require('./verify-runtime.js');

const RUN_COMMAND_SEQUENCE_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

function getRepoRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

function getAvailableParallelism() {
  if (typeof os.availableParallelism === 'function') {
    return os.availableParallelism();
  }

  return os.cpus().length;
}

function getCargoParallelism() {
  return Math.max(1, Math.floor(getAvailableParallelism() / 2));
}

function buildCargoCommandEnv({ cargoParallelism, disableIncremental = false }) {
  const env = {
    CARGO_BUILD_JOBS: String(cargoParallelism),
  };

  if (disableIncremental) {
    env.CARGO_INCREMENTAL = '0';
  }

  return env;
}

function resolveOutputDir(repoRoot, env = process.env) {
  const override = env.ONEFLOWBASE_WARNING_OUTPUT_DIR;

  if (!override) {
    return path.join(repoRoot, 'tmp', 'test-governance');
  }

  return path.isAbsolute(override) ? override : path.resolve(repoRoot, override);
}

function ensureOutputDir(repoRoot, env = process.env) {
  const outputDir = resolveOutputDir(repoRoot, env);
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function writeWarningCapture({
  repoRoot,
  env = process.env,
  scope,
  step,
  stderr = '',
}) {
  if (!stderr) {
    return null;
  }

  const outputDir = ensureOutputDir(repoRoot, env);
  const logPath = path.join(outputDir, `${scope}.warnings.log`);
  const sections = [`step=${step}`, '[stderr]', stderr.trimEnd()];

  fs.appendFileSync(logPath, `${sections.join('\n')}\n\n`, 'utf8');
  return logPath;
}

function resolveCwd(repoRoot, cwd) {
  if (!cwd) {
    return repoRoot;
  }

  return path.isAbsolute(cwd) ? cwd : path.resolve(repoRoot, cwd);
}

function runCommandSequence({
  repoRoot = getRepoRoot(),
  env = process.env,
  scope,
  commands,
  spawnSyncImpl = spawnSync,
  writeStdout = (text) => process.stdout.write(text),
  writeStderr = (text) => process.stderr.write(text),
}) {
  const resetWarningLogs = new Set();

  for (const command of commands) {
    const result = spawnSyncImpl(command.command, command.args, {
      cwd: resolveCwd(repoRoot, command.cwd),
      env: {
        ...env,
        ...(command.env ?? {}),
      },
      encoding: 'utf8',
      maxBuffer: RUN_COMMAND_SEQUENCE_MAX_BUFFER_BYTES,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    if (result.error) {
      throw result.error;
    }

    if (result.stdout) {
      writeStdout(result.stdout);
    }

    if (result.stderr) {
      writeStderr(result.stderr);
    }

    if (result.stderr) {
      const outputDir = ensureOutputDir(repoRoot, env);
      const logPath = path.join(outputDir, `${scope}.warnings.log`);

      if (!resetWarningLogs.has(logPath)) {
        fs.writeFileSync(logPath, '', 'utf8');
        resetWarningLogs.add(logPath);
      }

      writeWarningCapture({
        repoRoot,
        env,
        scope,
        step: command.label,
        stderr: result.stderr,
      });
    }

    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

async function runManagedCommandSequence({
  repoRoot = getRepoRoot(),
  env = process.env,
  scope,
  commandDisplay = scope,
  commands,
  lockMode = 'none',
  runtimeConfig,
  spawnSyncImpl = spawnSync,
  writeStdout = (text) => process.stdout.write(text),
  writeStderr = (text) => process.stderr.write(text),
  withHeavyVerifyLockImpl = withHeavyVerifyLock,
  runCommandSequenceImpl = runCommandSequence,
} = {}) {
  const execute = (sequenceEnv) => runCommandSequenceImpl({
    repoRoot,
    env: sequenceEnv,
    scope,
    commands,
    spawnSyncImpl,
    writeStdout,
    writeStderr,
  });

  if (lockMode !== 'heavy') {
    return execute(env);
  }

  const resolvedRuntimeConfig = runtimeConfig
    ?? loadVerifyRuntimeConfig({ repoRoot, env });

  return withHeavyVerifyLockImpl(
    {
      repoRoot,
      env,
      scope,
      command: commandDisplay,
      runtimeConfig: resolvedRuntimeConfig,
      writeStdout,
    },
    execute
  );
}

module.exports = {
  buildCargoCommandEnv,
  getRepoRoot,
  getAvailableParallelism,
  getCargoParallelism,
  resolveOutputDir,
  writeWarningCapture,
  runCommandSequence,
  runManagedCommandSequence,
};
