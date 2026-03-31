#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const DEFAULT_MINUTES = 10;
const DEFAULT_SIGNAL = 'SIGTERM';

function usage() {
  process.stdout.write(`用法：node scripts/kill-stale-chrome-devtools-mcp.js [选项]

扫描运行超过指定分钟数的 chrome-devtools-mcp 会话，并递归处理它们拉起的子孙进程。
默认只打印命中的进程树；传入 --kill 后才会真正发送信号。

选项：
  --minutes <数字>  只处理运行超过该分钟数的会话，默认 ${DEFAULT_MINUTES}
  --signal <信号>   kill 模式下发送的信号，默认 ${DEFAULT_SIGNAL}
  --kill            真正发送信号；未传时仅 dry-run
  --help            显示帮助

示例：
  node scripts/kill-stale-chrome-devtools-mcp.js
  node scripts/kill-stale-chrome-devtools-mcp.js --minutes 15 --kill
  node scripts/kill-stale-chrome-devtools-mcp.js --minutes 30 --kill --signal SIGKILL
`);
}

function parseArgs(argv) {
  const options = {
    minutes: DEFAULT_MINUTES,
    signal: DEFAULT_SIGNAL,
    kill: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--minutes': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('--minutes 需要一个数字');
        }
        const minutes = Number(value);
        if (!Number.isFinite(minutes) || minutes < 0) {
          throw new Error('--minutes 必须是大于等于 0 的数字');
        }
        options.minutes = minutes;
        index += 1;
        break;
      }
      case '--signal': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('--signal 需要一个信号名');
        }
        options.signal = value;
        index += 1;
        break;
      }
      case '--kill':
        options.kill = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`未知参数：${argument}`);
    }
  }

  return options;
}

function parsePsOutput(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) {
        throw new Error(`无法解析 ps 输出：${line}`);
      }
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        elapsedSeconds: Number(match[3]),
        args: match[4],
      };
    });
}

function buildChildrenMap(processes) {
  const children = new Map();
  for (const processInfo of processes) {
    if (!children.has(processInfo.ppid)) {
      children.set(processInfo.ppid, []);
    }
    children.get(processInfo.ppid).push(processInfo.pid);
  }
  return children;
}

function isChromeDevtoolsMcpProcess(args) {
  return /(^|[\/\s])chrome-devtools-mcp(?:@latest)?(?:[\/\s]|$)/.test(args);
}

function collectDescendants(rootPid, childrenMap) {
  const descendants = [];
  const stack = [...(childrenMap.get(rootPid) || [])];
  while (stack.length > 0) {
    const pid = stack.pop();
    descendants.push(pid);
    for (const childPid of childrenMap.get(pid) || []) {
      stack.push(childPid);
    }
  }
  return descendants;
}

function collectTargetSessions(processes, thresholdSeconds) {
  const processMap = new Map(processes.map((processInfo) => [processInfo.pid, processInfo]));
  const childrenMap = buildChildrenMap(processes);
  const matchedProcesses = processes.filter((processInfo) => isChromeDevtoolsMcpProcess(processInfo.args));
  const matchedPidSet = new Set(matchedProcesses.map((processInfo) => processInfo.pid));
  const sessionRoots = matchedProcesses.filter(
    (processInfo) => !matchedPidSet.has(processInfo.ppid) && processInfo.elapsedSeconds >= thresholdSeconds,
  );

  return sessionRoots.map((root) => {
    const targetPids = new Set([root.pid, ...collectDescendants(root.pid, childrenMap)]);
    const targetedProcesses = [...targetPids]
      .map((pid) => processMap.get(pid))
      .filter(Boolean)
      .sort((left, right) => right.elapsedSeconds - left.elapsedSeconds || left.pid - right.pid);

    return {
      root,
      processes: targetedProcesses,
    };
  });
}

function buildKillPlan(sessions) {
  const depthByPid = new Map();
  const queue = sessions.map((session) => ({ pid: session.root.pid, depth: 0 }));
  const childrenMap = buildChildrenMap(sessions.flatMap((session) => session.processes));

  while (queue.length > 0) {
    const current = queue.shift();
    const previousDepth = depthByPid.get(current.pid);
    if (previousDepth !== undefined && previousDepth >= current.depth) {
      continue;
    }
    depthByPid.set(current.pid, current.depth);
    for (const childPid of childrenMap.get(current.pid) || []) {
      queue.push({ pid: childPid, depth: current.depth + 1 });
    }
  }

  const uniqueProcesses = new Map();
  for (const session of sessions) {
    for (const processInfo of session.processes) {
      uniqueProcesses.set(processInfo.pid, processInfo);
    }
  }

  return [...uniqueProcesses.values()].sort((left, right) => {
    const depthDelta = (depthByPid.get(right.pid) || 0) - (depthByPid.get(left.pid) || 0);
    if (depthDelta !== 0) {
      return depthDelta;
    }
    return right.elapsedSeconds - left.elapsedSeconds || right.pid - left.pid;
  });
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}m${String(remainSeconds).padStart(2, '0')}s`;
}

function formatSession(session) {
  const lines = [
    `- root pid=${session.root.pid} age=${formatDuration(session.root.elapsedSeconds)} cmd=${session.root.args}`,
  ];
  for (const processInfo of session.processes) {
    if (processInfo.pid === session.root.pid) {
      continue;
    }
    lines.push(`  pid=${processInfo.pid} ppid=${processInfo.ppid} age=${formatDuration(processInfo.elapsedSeconds)} cmd=${processInfo.args}`);
  }
  return lines.join('\n');
}

function readProcessTable(runCommand = defaultRunCommand) {
  const stdout = runCommand('ps', ['-eo', 'pid=,ppid=,etimes=,args=']);
  return parsePsOutput(stdout);
}

function defaultRunCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 失败，退出码 ${result.status}\n${result.stderr || ''}`.trim());
  }
  return result.stdout;
}

function killProcesses(processes, signal, killFn = process.kill) {
  const killed = [];
  const skipped = [];

  for (const processInfo of processes) {
    try {
      killFn(processInfo.pid, signal);
      killed.push(processInfo);
    } catch (error) {
      if (error && error.code === 'ESRCH') {
        skipped.push({ processInfo, reason: 'not_found' });
        continue;
      }
      throw error;
    }
  }

  return { killed, skipped };
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    usage();
    return 0;
  }

  const thresholdSeconds = Math.floor(options.minutes * 60);
  const processes = readProcessTable();
  const sessions = collectTargetSessions(processes, thresholdSeconds);

  if (sessions.length === 0) {
    process.stdout.write(
      `没有找到运行超过 ${options.minutes} 分钟的 chrome-devtools-mcp 会话。\n`,
    );
    return 0;
  }

  process.stdout.write(
    `找到 ${sessions.length} 个运行超过 ${options.minutes} 分钟的 chrome-devtools-mcp 会话：\n`,
  );
  process.stdout.write(`${sessions.map((session) => formatSession(session)).join('\n')}\n`);

  const killPlan = buildKillPlan(sessions);
  process.stdout.write(`计划处理 ${killPlan.length} 个进程，信号：${options.signal}\n`);

  if (!options.kill) {
    process.stdout.write('当前为 dry-run；如需真正清理，请追加 --kill。\n');
    return 0;
  }

  const result = killProcesses(killPlan, options.signal);
  process.stdout.write(`已发送 ${options.signal} 给 ${result.killed.length} 个进程。\n`);
  if (result.skipped.length > 0) {
    process.stdout.write(`有 ${result.skipped.length} 个进程在发送前已退出，已跳过。\n`);
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildChildrenMap,
  buildKillPlan,
  collectDescendants,
  collectTargetSessions,
  formatDuration,
  isChromeDevtoolsMcpProcess,
  killProcesses,
  main,
  parseArgs,
  parsePsOutput,
  readProcessTable,
};
