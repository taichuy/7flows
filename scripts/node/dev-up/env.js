const fs = require('node:fs');
const path = require('node:path');

const { log } = require('./cli.js');

const LOOPBACK_NO_PROXY_ENTRIES = ['localhost', '127.0.0.1', '127.0.0.0/8', '::1'];

function commandExists(commandName) {
  const pathValue = process.env.PATH || '';
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat', '.ps1'] : [''];

  for (const directory of directories) {
    for (const extension of extensions) {
      const fullPath = path.join(directory, `${commandName}${extension}`);
      if (fs.existsSync(fullPath)) {
        return true;
      }
    }
  }

  return false;
}

function requireCommand(commandName) {
  if (!commandExists(commandName)) {
    throw new Error(`缺少命令：${commandName}`);
  }
}

function parseNoProxyEntries(envValue) {
  return String(envValue || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildLocalLoopbackEnv(sourceEnv) {
  const noProxyEntries = new Set([
    ...parseNoProxyEntries(sourceEnv.NO_PROXY),
    ...parseNoProxyEntries(sourceEnv.no_proxy),
    ...LOOPBACK_NO_PROXY_ENTRIES,
  ]);
  const noProxyValue = [...noProxyEntries].join(',');

  return {
    ...sourceEnv,
    NO_PROXY: noProxyValue,
    no_proxy: noProxyValue,
  };
}

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function ensureServiceEnvFile(service, { logImpl = log } = {}) {
  if (!service.envFile || !service.envExampleFile) {
    return false;
  }

  if (fs.existsSync(service.envFile) || !fs.existsSync(service.envExampleFile)) {
    return false;
  }

  fs.mkdirSync(path.dirname(service.envFile), { recursive: true });
  fs.copyFileSync(service.envExampleFile, service.envFile);
  logImpl(`已创建 ${path.relative(service.repoRoot || process.cwd(), service.envFile)}`);
  return true;
}

function buildServiceEnv(service, sourceEnv = process.env) {
  const fileEnv = parseEnvFile(service.envFile);
  return buildLocalLoopbackEnv({
    ...fileEnv,
    ...sourceEnv,
  });
}

function parseApiEnvironment(value) {
  const normalized = String(value || 'development')
    .trim()
    .toLowerCase();

  if (normalized === 'development' || normalized === 'dev' || normalized === 'local') {
    return 'development';
  }

  if (normalized === 'production' || normalized === 'prod') {
    return 'production';
  }

  throw new Error(`无效的 API_ENV：${value}`);
}

function getServicePrestartCommands(service, sourceEnv = process.env) {
  if (!service || service.key !== 'api-server') {
    return [];
  }

  const env = buildServiceEnv(service, sourceEnv);
  if (parseApiEnvironment(env.API_ENV) === 'production') {
    return [];
  }

  return [
    {
      description: 'api-server 开发态重置 root 密码',
      command: service.command,
      args: ['run', '-p', 'api-server', '--bin', 'reset_root_password'],
      cwd: service.cwd,
      env,
    },
  ];
}

module.exports = {
  buildLocalLoopbackEnv,
  buildServiceEnv,
  ensureServiceEnvFile,
  getServicePrestartCommands,
  parseApiEnvironment,
  parseEnvFile,
  requireCommand,
};
