const ACTIONS = new Set(['start', 'ensure', 'stop', 'status', 'restart']);
const SCOPES = new Set(['all', 'frontend', 'backend']);

function usage() {
  process.stdout.write(`用法：node scripts/node/dev-up.js [选项] [start|ensure|stop|status|restart]

默认动作：start

选项：
  --frontend-only  仅管理前端进程
  --backend-only   仅管理后端进程（api-server + plugin-runner）
  --skip-docker    跳过 Docker 中间件管理
  -h, --help       查看帮助

示例：
  node scripts/node/dev-up.js
  node scripts/node/dev-up.js --skip-docker
  node scripts/node/dev-up.js restart --frontend-only
  node scripts/node/dev-up.js restart --backend-only
  node scripts/node/dev-up.js status
`);
}

function log(message) {
  process.stdout.write(`[1flowbase-dev-up] ${message}\n`);
}

function parseCliArgs(argv) {
  let action = 'start';
  let actionSpecified = false;
  let scope = 'all';
  let skipDocker = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    if (arg === '--frontend-only') {
      if (scope !== 'all') {
        throw new Error('不能同时指定 --frontend-only 和 --backend-only');
      }
      scope = 'frontend';
      continue;
    }

    if (arg === '--backend-only') {
      if (scope !== 'all') {
        throw new Error('不能同时指定 --frontend-only 和 --backend-only');
      }
      scope = 'backend';
      continue;
    }

    if (arg === '--skip-docker') {
      skipDocker = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`未知选项：${arg}`);
    }

    if (actionSpecified) {
      throw new Error(`只能指定一个动作，收到多余参数：${arg}`);
    }

    if (!ACTIONS.has(arg)) {
      throw new Error(`未知动作：${arg}`);
    }

    action = arg;
    actionSpecified = true;
  }

  if (!SCOPES.has(scope)) {
    throw new Error(`未知范围：${scope}`);
  }

  return {
    action,
    scope,
    skipDocker,
    help,
  };
}

function shouldManageDocker(options) {
  return !options.skipDocker && options.scope === 'all';
}

function selectServiceKeys(scope) {
  switch (scope) {
    case 'frontend':
      return ['web'];
    case 'backend':
      return ['api-server', 'plugin-runner'];
    default:
      return ['web', 'api-server', 'plugin-runner'];
  }
}

module.exports = {
  log,
  parseCliArgs,
  selectServiceKeys,
  shouldManageDocker,
  usage,
};
