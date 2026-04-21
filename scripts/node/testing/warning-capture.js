const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
  stdout = '',
  stderr = '',
}) {
  if (!stdout && !stderr) {
    return null;
  }

  const outputDir = ensureOutputDir(repoRoot, env);
  const logPath = path.join(outputDir, `${scope}.warnings.log`);
  const sections = [`step=${step}`];

  if (stdout) {
    sections.push('[stdout]', stdout.trimEnd());
  }

  if (stderr) {
    sections.push('[stderr]', stderr.trimEnd());
  }

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
  for (const command of commands) {
    const result = spawnSyncImpl(command.command, command.args, {
      cwd: resolveCwd(repoRoot, command.cwd),
      env: {
        ...env,
        ...(command.env ?? {}),
      },
      encoding: 'utf8',
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

    writeWarningCapture({
      repoRoot,
      env,
      scope,
      step: command.label,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    });

    if (result.status !== 0) {
      return result.status ?? 1;
    }
  }

  return 0;
}

module.exports = {
  buildCargoCommandEnv,
  getRepoRoot,
  getAvailableParallelism,
  getCargoParallelism,
  resolveOutputDir,
  writeWarningCapture,
  runCommandSequence,
};
