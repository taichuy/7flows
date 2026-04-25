const fs = require('node:fs');
const path = require('node:path');

const PROFILE_NAMES = new Set(['status', 'light', 'backend-cache', 'all', 'deep']);

const LIGHT_TARGETS = [
  path.join('web', 'app', 'dist'),
  path.join('web', 'app', '.turbo'),
  path.join('tmp', 'dev-up'),
  path.join('tmp', 'logs'),
  path.join('tmp', 'page-debug'),
];

const BACKEND_CACHE_TARGETS = [
  path.join('api', 'target', 'debug', 'incremental'),
  path.join('api', 'target', 'llvm-cov-target'),
  path.join('api', 'target', 'tmp'),
];

const PROFILE_TARGETS = {
  light: LIGHT_TARGETS,
  'backend-cache': BACKEND_CACHE_TARGETS,
  all: [...LIGHT_TARGETS, ...BACKEND_CACHE_TARGETS],
  deep: [...LIGHT_TARGETS, path.join('api', 'target')],
};

const STATUS_TARGETS = [
  path.join('api', 'target'),
  path.join('api', 'target', 'debug', 'deps'),
  path.join('api', 'target', 'debug', 'incremental'),
  path.join('api', 'target', 'llvm-cov-target'),
  path.join('web', 'app', 'dist'),
  path.join('web', 'app', '.turbo'),
  path.join('tmp', 'test-governance'),
  path.join('tmp', 'dev-up'),
  path.join('tmp', 'logs'),
  path.join('tmp', 'page-debug'),
];

function getRepoRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

function usage(writeStdout = (text) => process.stdout.write(text)) {
  writeStdout(`用法：node scripts/node/clean-artifacts.js [profile] [--apply]

默认 profile：status，仅打印关键临时产物体积，不删除文件。

profile：
  status         查看 api/target、coverage、前端构建和 tmp 目录体积
  light          清理前端构建缓存和运行态 tmp 目录
  backend-cache  清理 Cargo incremental、llvm-cov target 和 target/tmp，保留 debug/deps
  all            执行 light + backend-cache
  deep           清理 light + 整个 api/target，下一次后端编译会明显变慢

选项：
  --apply        真正删除；不带该选项时只 dry-run
  --dry-run      显式 dry-run
  --profile <p>  指定 profile，等价于位置参数
  -h, --help     查看帮助
`);
}

function parseCliArgs(argv) {
  const options = {
    apply: false,
    help: false,
    profile: 'status',
  };
  let profileSpecified = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.apply = false;
      continue;
    }

    if (arg === '--profile') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('--profile 缺少值');
      }
      if (profileSpecified) {
        throw new Error(`只能指定一个 profile，收到多余值：${value}`);
      }
      options.profile = value;
      profileSpecified = true;
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`未知选项：${arg}`);
    }

    if (profileSpecified) {
      throw new Error(`只能指定一个 profile，收到多余参数：${arg}`);
    }

    options.profile = arg;
    profileSpecified = true;
  }

  if (!PROFILE_NAMES.has(options.profile)) {
    throw new Error(`未知 profile：${options.profile}`);
  }

  return options;
}

function assertInsideRepo(repoRoot, absolutePath) {
  const relativePath = path.relative(repoRoot, absolutePath);
  if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`拒绝处理仓库外路径：${absolutePath}`);
  }
}

function resolveTarget(repoRoot, relativePath) {
  const normalizedRelativePath = path.normalize(relativePath);
  const absolutePath = path.resolve(repoRoot, normalizedRelativePath);
  assertInsideRepo(repoRoot, absolutePath);
  return {
    absolutePath,
    relativePath: normalizedRelativePath,
  };
}

function dedupeNestedTargets(targets) {
  const sortedTargets = [...targets].sort((left, right) => (
    left.absolutePath.length - right.absolutePath.length
  ));
  const selected = [];

  for (const target of sortedTargets) {
    const isNested = selected.some((selectedTarget) => {
      const relativePath = path.relative(selectedTarget.absolutePath, target.absolutePath);
      return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
    });

    if (!isNested) {
      selected.push(target);
    }
  }

  return selected.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function buildCleanupPlan({ repoRoot = getRepoRoot(), profile }) {
  if (profile === 'status') {
    return { profile, targets: [] };
  }

  const relativeTargets = PROFILE_TARGETS[profile];
  if (!relativeTargets) {
    throw new Error(`未知清理 profile：${profile}`);
  }

  return {
    profile,
    targets: dedupeNestedTargets(relativeTargets.map((target) => resolveTarget(repoRoot, target))),
  };
}

function getPathSizeBytes(absolutePath) {
  let stats;
  try {
    stats = fs.lstatSync(absolutePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    return stats.size;
  }

  return fs.readdirSync(absolutePath).reduce((total, entryName) => {
    return total + getPathSizeBytes(path.join(absolutePath, entryName));
  }, stats.size);
}

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${bytes} ${units[unitIndex]}`;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function collectTargetStates(targets) {
  return targets.map((target) => {
    const exists = fs.existsSync(target.absolutePath);
    return {
      ...target,
      exists,
      sizeBytes: exists ? getPathSizeBytes(target.absolutePath) : 0,
    };
  });
}

function sumTargetBytes(targets) {
  return dedupeNestedTargets(targets).reduce((total, target) => {
    return total + target.sizeBytes;
  }, 0);
}

function logTargetList({ action, targets, writeStdout }) {
  const totalBytes = sumTargetBytes(targets);
  writeStdout(`[1flowbase-clean-artifacts] ${action}: ${formatBytes(totalBytes)}\n`);

  for (const target of targets) {
    writeStdout(`- ${target.relativePath}: ${formatBytes(target.sizeBytes)}\n`);
  }
}

function printStatus({ repoRoot, writeStdout }) {
  const statusTargets = STATUS_TARGETS.map((target) => resolveTarget(repoRoot, target));
  const states = collectTargetStates(statusTargets);
  const existingStates = states.filter((target) => target.exists);

  if (existingStates.length === 0) {
    writeStdout('[1flowbase-clean-artifacts] 没有发现已存在的临时产物。\n');
    return 0;
  }

  logTargetList({
    action: 'status',
    targets: existingStates,
    writeStdout,
  });
  return 0;
}

function runArtifactCleanup({
  repoRoot = getRepoRoot(),
  options = parseCliArgs([]),
  writeStdout = (text) => process.stdout.write(text),
} = {}) {
  if (options.help) {
    usage(writeStdout);
    return 0;
  }

  if (options.profile === 'status') {
    return printStatus({ repoRoot, writeStdout });
  }

  const plan = buildCleanupPlan({ repoRoot, profile: options.profile });
  const existingTargets = collectTargetStates(plan.targets).filter((target) => target.exists);

  if (existingTargets.length === 0) {
    writeStdout(`[1flowbase-clean-artifacts] ${options.profile} 没有可清理的临时产物。\n`);
    return 0;
  }

  if (!options.apply) {
    logTargetList({
      action: `dry-run ${options.profile} would remove`,
      targets: existingTargets,
      writeStdout,
    });
    return 0;
  }

  for (const target of existingTargets) {
    fs.rmSync(target.absolutePath, { recursive: true, force: true });
  }

  logTargetList({
    action: `removed ${options.profile}`,
    targets: existingTargets,
    writeStdout,
  });
  return 0;
}

module.exports = {
  BACKEND_CACHE_TARGETS,
  LIGHT_TARGETS,
  PROFILE_TARGETS,
  STATUS_TARGETS,
  buildCleanupPlan,
  formatBytes,
  getRepoRoot,
  parseCliArgs,
  runArtifactCleanup,
  sumTargetBytes,
  usage,
};
