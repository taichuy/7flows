const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { log } = require('./cli.js');
const { buildServiceEnv, ensureServiceEnvFile, requireCommand } = require('./env.js');
const { runServicePrestartCommands } = require('./postgres-reset.js');
const { DEFAULT_STARTUP_TIMEOUT_MS } = require('./services.js');

function readPidRecord(pidFile) {
  if (!fs.existsSync(pidFile)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(pidFile, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function getProbeHost(service) {
  return service.probeHost || service.host;
}

function getBindHost(service) {
  return service.bindHost || service.host;
}

function getStartupTimeoutMs(service) {
  if (!service || !Number.isFinite(service.startupTimeoutMs) || service.startupTimeoutMs <= 0) {
    return DEFAULT_STARTUP_TIMEOUT_MS;
  }

  return service.startupTimeoutMs;
}

function writePidRecord(service, pid) {
  fs.writeFileSync(
    service.pidFile,
    JSON.stringify(
      {
        pid,
        command: service.command,
        args: service.args,
        port: service.port,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

function removePidRecord(pidFile) {
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') {
      return false;
    }

    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPortOpen(host, port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(value);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

async function waitForPort(host, port, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(host, port)) {
      return true;
    }

    await sleep(250);
  }

  return false;
}

function waitForServicePort(service, waitForPortImpl = waitForPort) {
  return waitForPortImpl(getProbeHost(service), service.port, getStartupTimeoutMs(service));
}

function signalProcess(pid, signal) {
  try {
    if (process.platform !== 'win32') {
      process.kill(-pid, signal);
      return;
    }
  } catch (error) {
    if (error.code !== 'ESRCH') {
      try {
        process.kill(pid, signal);
        return;
      } catch (innerError) {
        if (innerError.code !== 'ESRCH') {
          throw innerError;
        }
      }
    } else {
      return;
    }
  }

  try {
    process.kill(pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') {
      throw error;
    }
  }
}

async function waitForProcessExit(pid, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return true;
    }

    await sleep(200);
  }

  return !isProcessAlive(pid);
}

async function startService(service) {
  ensureServiceEnvFile(service);
  requireCommand(service.command);
  runServicePrestartCommands(service);

  const pidRecord = readPidRecord(service.pidFile);
  if (pidRecord && isProcessAlive(pidRecord.pid) && (await isPortOpen(getProbeHost(service), service.port))) {
    log(`${service.label} 已在运行，跳过启动`);
    return;
  }

  if (pidRecord && isProcessAlive(pidRecord.pid)) {
    await stopService(service);
  }

  const outputFd = fs.openSync(service.logFile, 'a');
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: buildServiceEnv(service),
    detached: process.platform !== 'win32',
    stdio: ['ignore', outputFd, outputFd],
  });

  fs.closeSync(outputFd);
  child.unref();
  writePidRecord(service, child.pid);

  const ready = await waitForServicePort(service);
  if (!ready) {
    await stopService(service);
    throw new Error(`${service.label} 启动超时，请查看日志：${service.logFile}`);
  }

  log(`${service.label} 已启动，监听 ${getBindHost(service)}:${service.port}`);
}

async function stopService(service) {
  const pidRecord = readPidRecord(service.pidFile);
  if (!pidRecord) {
    log(`${service.label} 未发现 pid 记录，跳过停止`);
    return;
  }

  if (!isProcessAlive(pidRecord.pid)) {
    removePidRecord(service.pidFile);
    log(`${service.label} 进程记录已失效，已清理`);
    return;
  }

  signalProcess(pidRecord.pid, 'SIGTERM');
  const exited = await waitForProcessExit(pidRecord.pid);
  if (!exited) {
    signalProcess(pidRecord.pid, 'SIGKILL');
    await waitForProcessExit(pidRecord.pid, 2000);
  }

  removePidRecord(service.pidFile);
  log(`${service.label} 已停止`);
}

async function statusService(service) {
  const pidRecord = readPidRecord(service.pidFile);
  const alive = pidRecord ? isProcessAlive(pidRecord.pid) : false;
  const portOpen = await isPortOpen(getProbeHost(service), service.port);
  const status = alive && portOpen ? 'running' : alive ? 'starting' : portOpen ? 'orphaned' : 'stopped';

  log(
    `${service.label}: ${status} | listen=${getBindHost(service)}:${service.port} | probe=${getProbeHost(service)}:${service.port} | pid=${pidRecord ? pidRecord.pid : 'none'} | log=${path.relative(
      service.repoRoot || process.cwd(),
      service.logFile
    )}`
  );
}

async function manageServices(action, services) {
  if (action === 'stop') {
    for (const service of [...services].reverse()) {
      await stopService(service);
    }
    return;
  }

  if (action === 'status') {
    for (const service of services) {
      await statusService(service);
    }
    return;
  }

  if (action === 'restart') {
    for (const service of [...services].reverse()) {
      await stopService(service);
    }
  }

  for (const service of services) {
    await startService(service);
  }
}

module.exports = {
  manageServices,
  waitForServicePort,
};
