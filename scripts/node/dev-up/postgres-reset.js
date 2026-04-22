const { log } = require('./cli.js');
const {
  buildServiceEnv,
  getServicePrestartCommands,
  parseApiEnvironment,
} = require('./env.js');
const {
  ensureCommandSuccess,
  getMiddlewarePostgresPort,
  runCommand,
  runMiddlewareCompose,
  writeCommandOutput,
} = require('./middleware.js');

const LOCAL_POSTGRES_HOSTS = new Set(['127.0.0.1', 'localhost']);

function getCommandOutput(result) {
  return [result?.stdout, result?.stderr, result?.error?.message].filter(Boolean).join('\n');
}

function isRecoverableMigrationDrift(result) {
  const output = getCommandOutput(result);
  return (
    output.includes('was previously applied but has been modified') ||
    output.includes('was previously applied but is missing in the resolved migrations')
  );
}

function quotePostgresIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function parsePostgresDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    return null;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (_error) {
    return null;
  }

  if (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') {
    return null;
  }

  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  if (!databaseName) {
    return null;
  }

  return {
    host: parsedUrl.hostname.trim().toLowerCase(),
    port: parsedUrl.port || '5432',
    user: decodeURIComponent(parsedUrl.username || 'postgres'),
    databaseName,
  };
}

function buildLocalPostgresResetPlan(service, databaseUrl) {
  if (!service?.repoRoot) {
    return null;
  }

  const database = parsePostgresDatabaseUrl(databaseUrl);
  if (!database || !LOCAL_POSTGRES_HOSTS.has(database.host)) {
    return null;
  }

  const expectedPort = getMiddlewarePostgresPort(service.repoRoot);
  if (database.port !== expectedPort) {
    return null;
  }

  const quotedDatabaseName = quotePostgresIdentifier(database.databaseName);
  return {
    databaseName: database.databaseName,
    commands: [
      {
        description: `重建开发数据库 ${database.databaseName}`,
        args: [
          'exec',
          '-T',
          'db',
          'psql',
          '-U',
          database.user,
          '-d',
          'postgres',
          '-c',
          `DROP DATABASE IF EXISTS ${quotedDatabaseName} WITH (FORCE);`,
        ],
      },
      {
        description: `创建开发数据库 ${database.databaseName}`,
        args: [
          'exec',
          '-T',
          'db',
          'psql',
          '-U',
          database.user,
          '-d',
          'postgres',
          '-c',
          `CREATE DATABASE ${quotedDatabaseName};`,
        ],
      },
    ],
  };
}

function tryRecoverApiServerPrestartFailure(
  service,
  prestartCommand,
  result,
  { runMiddlewareComposeImpl = runMiddlewareCompose, logImpl = log } = {}
) {
  if (!service || service.key !== 'api-server' || !prestartCommand?.env) {
    return false;
  }

  if (parseApiEnvironment(prestartCommand.env.API_ENV) === 'production') {
    return false;
  }

  if (!isRecoverableMigrationDrift(result)) {
    return false;
  }

  const resetPlan = buildLocalPostgresResetPlan(service, prestartCommand.env.API_DATABASE_URL);
  if (!resetPlan) {
    return false;
  }

  logImpl(
    `${service.label} 检测到本地开发数据库 migration 记录与当前仓库不一致，准备重建数据库 ${resetPlan.databaseName}`
  );

  for (const command of resetPlan.commands) {
    const resetResult = runMiddlewareComposeImpl(service.repoRoot, command.args, {
      captureOutput: true,
      allowFailure: true,
    });
    ensureCommandSuccess(command.description, resetResult);
  }

  logImpl(`${service.label} 已重建数据库 ${resetPlan.databaseName}，重试预启动步骤`);
  return true;
}

function runServicePrestartCommands(
  service,
  {
    sourceEnv = process.env,
    runCommandImpl = runCommand,
    runMiddlewareComposeImpl = runMiddlewareCompose,
    logImpl = log,
  } = {}
) {
  for (const prestartCommand of getServicePrestartCommands(service, sourceEnv)) {
    logImpl(`${service.label} 执行预启动步骤：${prestartCommand.description}`);
    let recovered = false;

    while (true) {
      const result = runCommandImpl(prestartCommand.command, prestartCommand.args, {
        cwd: prestartCommand.cwd,
        env: prestartCommand.env,
        captureOutput: true,
      });

      if (!result.error && result.status === 0) {
        writeCommandOutput(result);
        break;
      }

      writeCommandOutput(result);

      if (
        !recovered &&
        tryRecoverApiServerPrestartFailure(service, prestartCommand, result, {
          runMiddlewareComposeImpl,
          logImpl,
        })
      ) {
        recovered = true;
        continue;
      }

      ensureCommandSuccess(prestartCommand.description, result);
    }
  }
}

module.exports = {
  runServicePrestartCommands,
};
