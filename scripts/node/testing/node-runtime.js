const fs = require('node:fs');
const path = require('node:path');

function listPathEntries(env = process.env) {
  return (env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolvePnpmExecutableNames() {
  if (process.platform === 'win32') {
    return ['pnpm.cmd', 'pnpm.exe', 'pnpm'];
  }

  return ['pnpm'];
}

function resolveNodeExecutableName() {
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

function isExecutableFile(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveExplicitNodeBinary(env = process.env) {
  const explicitNode = env.ONEFLOWBASE_NODE;

  if (!explicitNode) {
    return null;
  }

  if (!isExecutableFile(explicitNode)) {
    throw new Error(`ONEFLOWBASE_NODE is not executable: ${explicitNode}`);
  }

  return fs.realpathSync(explicitNode);
}

function resolvePnpmBinaryFromPath(env = process.env) {
  for (const entry of listPathEntries(env)) {
    for (const pnpmFileName of resolvePnpmExecutableNames()) {
      const pnpmPath = path.join(entry, pnpmFileName);
      if (!fs.existsSync(pnpmPath)) {
        continue;
      }

      return fs.realpathSync(pnpmPath);
    }
  }

  return null;
}

function resolveNodeBinaryNearPnpm(pnpmBinary) {
  if (!pnpmBinary) {
    return null;
  }

  const nodeFileName = resolveNodeExecutableName();
  const sameDirNodePath = path.join(path.dirname(pnpmBinary), nodeFileName);

  if (isExecutableFile(sameDirNodePath)) {
    return fs.realpathSync(sameDirNodePath);
  }

  let currentDir = path.dirname(pnpmBinary);
  while (true) {
    const versionRootNodePath = path.join(currentDir, 'bin', nodeFileName);

    if (isExecutableFile(versionRootNodePath)) {
      return fs.realpathSync(versionRootNodePath);
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function resolveNodeBinaryFromPath(env = process.env) {
  const explicitNode = resolveExplicitNodeBinary(env);
  if (explicitNode) {
    return explicitNode;
  }

  const pnpmBinary = resolvePnpmBinaryFromPath(env);
  const pnpmNode = resolveNodeBinaryNearPnpm(pnpmBinary);

  if (pnpmNode) {
    return pnpmNode;
  }

  return process.execPath;
}

function buildNodePreferredEnv(env = process.env) {
  const nodeBinary = resolveNodeBinaryFromPath(env);
  const pnpmBinary = resolvePnpmBinaryFromPath(env);
  const nodeDir = path.dirname(nodeBinary);
  const nextPathEntries = [
    nodeDir,
    ...listPathEntries(env).filter((entry) => entry !== nodeDir),
  ];

  return {
    nodeBinary,
    env: {
      ...env,
      PATH: nextPathEntries.join(path.delimiter),
      ...(pnpmBinary ? { npm_execpath: pnpmBinary } : {}),
      npm_node_execpath: nodeBinary,
      NODE: nodeBinary,
    },
  };
}

module.exports = {
  resolvePnpmBinaryFromPath,
  resolveNodeBinaryFromPath,
  buildNodePreferredEnv,
};
