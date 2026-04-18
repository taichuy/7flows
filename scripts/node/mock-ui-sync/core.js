const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SOURCE = 'web';
const DEFAULT_TARGET = path.join('tmp', 'mock-ui');
const DEFAULT_PORT = 3210;
const EXCLUDED_DIRECTORY_NAMES = new Set(['node_modules', 'dist', 'coverage', '.turbo', '.vite']);

function getRepoRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

function usage() {
  process.stdout.write(`用法：node scripts/node/mock-ui-sync.js [选项]

默认行为：
  从 web/ 重建 tmp/mock-ui/，并把 mock-ui 的前端端口改成 3210

选项：
  --source <dir>  源目录，默认 web
  --target <dir>  目标目录，默认 tmp/mock-ui
  --port <port>   mock-ui 前端端口，默认 3210
  -h, --help      查看帮助
`);
}

function log(message) {
  process.stdout.write(`[1flowbase-mock-ui-sync] ${message}\n`);
}

function parseCliArgs(argv) {
  const options = {
    help: false,
    source: DEFAULT_SOURCE,
    target: DEFAULT_TARGET,
    port: DEFAULT_PORT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--source' || arg === '--target' || arg === '--port') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`${arg} 缺少值`);
      }

      if (arg === '--source') {
        options.source = value;
      } else if (arg === '--target') {
        options.target = value;
      } else {
        const parsedPort = Number.parseInt(value, 10);
        if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
          throw new Error(`无效端口：${value}`);
        }
        options.port = parsedPort;
      }

      index += 1;
      continue;
    }

    throw new Error(`未知参数：${arg}`);
  }

  return options;
}

function resolveWorkspacePaths(repoRoot, options) {
  return {
    sourceDir: path.resolve(repoRoot, options.source),
    targetDir: path.resolve(repoRoot, options.target),
  };
}

function shouldExcludeSourcePath(sourceRoot, sourcePath) {
  const relativePath = path.relative(sourceRoot, sourcePath);
  if (!relativePath) {
    return false;
  }

  return relativePath
    .split(path.sep)
    .filter(Boolean)
    .some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment));
}

function resetTargetDirectory(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function copyWorkspaceContents(sourceDir, targetDir) {
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    filter: (sourcePath) => !shouldExcludeSourcePath(sourceDir, sourcePath),
  });
}

function rewriteMockUiPort(targetDir, port) {
  const viteConfigPath = path.join(targetDir, 'app', 'vite.config.ts');
  if (!fs.existsSync(viteConfigPath)) {
    throw new Error(`缺少 vite 配置文件：${path.relative(getRepoRoot(), viteConfigPath)}`);
  }

  const source = fs.readFileSync(viteConfigPath, 'utf8');
  const nextSource = source.replace(/port:\s*\d+/u, `port: ${port}`);
  if (nextSource === source) {
    throw new Error(`未找到可改写的端口配置：${path.relative(getRepoRoot(), viteConfigPath)}`);
  }

  fs.writeFileSync(viteConfigPath, nextSource, 'utf8');
}

function syncMockUiWorkspace({
  repoRoot = getRepoRoot(),
  source = DEFAULT_SOURCE,
  target = DEFAULT_TARGET,
  port = DEFAULT_PORT,
} = {}) {
  const { sourceDir, targetDir } = resolveWorkspacePaths(repoRoot, { source, target });
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`源目录不存在：${path.relative(repoRoot, sourceDir)}`);
  }

  resetTargetDirectory(targetDir);
  copyWorkspaceContents(sourceDir, targetDir);
  rewriteMockUiPort(targetDir, port);

  return {
    sourceDir,
    targetDir,
    port,
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  if (options.help) {
    usage();
    return 0;
  }

  const repoRoot = getRepoRoot();
  const result = syncMockUiWorkspace({
    repoRoot,
    source: options.source,
    target: options.target,
    port: options.port,
  });

  log(
    `已重建 ${path.relative(repoRoot, result.targetDir)} <- ${path.relative(
      repoRoot,
      result.sourceDir
    )}，前端端口 ${result.port}`
  );
  return 0;
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_SOURCE,
  DEFAULT_TARGET,
  EXCLUDED_DIRECTORY_NAMES,
  getRepoRoot,
  parseCliArgs,
  resolveWorkspacePaths,
  shouldExcludeSourcePath,
  rewriteMockUiPort,
  syncMockUiWorkspace,
  main,
};
