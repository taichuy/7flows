#!/usr/bin/env node
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const DEFAULT_MINUTES = 60;
const DEFAULT_KEEP = 1;
const DEFAULT_SIGNAL = 'SIGTERM';
const DEFAULT_USER = process.env.USER || os.userInfo().username;

const PROCESS_FAMILIES = [
  {
    name: 'bun-dist-server-acp',
    description: '匹配 bun/bun.exe 拉起的 dist-server/acp.js 进程',
    match: (processInfo) =>
      /(?:^|\s)(?:\S*[/\\])?bun(?:\.exe)?\s+\S*dist-server[/\\]acp\.js(?:\s|$)/.test(processInfo.args),
  },
  {
    name: 'codex-acp',
    description: '匹配 @zed-industries/codex-acp helper 进程',
    match: (processInfo) =>
      /@zed-industries[/\\]codex-acp-linux-x64[/\\]bin[/\\]codex-acp(?:\s|$)/.test(processInfo.args),
  },
];

function usage() {
  process.stdout.write(`用法：node scripts/kill-stale-duplicate-processes.js [选项]

扫描当前用户下常见的重复开发辅助进程，默认仅打印命中的重复实例；
传入 --kill 后，才会对“同一父进程 + 同一命令签名”的旧实例发送信号。

默认白名单：
${PROCESS_FAMILIES.map((family) => `  - ${family.name}: ${family.description}`).join('\n')}

选项：
  --minutes <数字>   只清理运行超过该分钟数的旧实例，默认 ${DEFAULT_MINUTES}
  --keep <数字>      每组保留最新的实例数量，默认 ${DEFAULT_KEEP}
  --signal <信号>    kill 模式下发送的信号，默认 ${DEFAULT_SIGNAL}
  --user <用户名>    仅扫描该用户的进程，默认当前用户 ${DEFAULT_USER}
  --family <名称>    仅处理指定白名单；可重复传入，也可用逗号分隔
  --kill             真正发送信号；未传时仅 dry-run
  --help             显示帮助

说明：
  - “重复进程”按“同一父进程 + 同一完整命令行”分组。
  - 每组默认保留最新 1 个实例，其他超过阈值的旧实例才会被处理。
  - chrome-devtools-mcp 进程树仍建议使用 node scripts/kill-stale-chrome-devtools-mcp.js 单独处理。

示例：
  node scripts/kill-stale-duplicate-processes.js
  node scripts/kill-stale-duplicate-processes.js --minutes 90 --keep 1 --kill
  node scripts/kill-stale-duplicate-processes.js --family codex-acp --kill
  node scripts/kill-stale-duplicate-processes.js --family bun-dist-server-acp,codex-acp --signal SIGKILL --kill
`);
}

function parseFamilyNames(value) {
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    minutes: DEFAULT_MINUTES,
    keep: DEFAULT_KEEP,
    signal: DEFAULT_SIGNAL,
    user: DEFAULT_USER,
    kill: false,
    families: PROCESS_FAMILIES.map((family) => family.name),
  };

  const selectedFamilies = [];

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
      case '--keep': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('--keep 需要一个数字');
        }
        const keep = Number(value);
        if (!Number.isInteger(keep) || keep < 0) {
          throw new Error('--keep 必须是大于等于 0 的整数');
        }
        options.keep = keep;
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
      case '--user': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('--user 需要一个用户名');
        }
        options.user = value;
        index += 1;
        break;
      }
      case '--family': {
        const value = argv[index + 1];
        if (!value) {
          throw new Error('--family 需要一个名称');
        }
        selectedFamilies.push(...parseFamilyNames(value));
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

  if (selectedFamilies.length > 0) {
    options.families = [...new Set(selectedFamilies)];
  }

  return options;
}

function parsePsOutput(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/);
      if (!match) {
        throw new Error(`无法解析 ps 输出：${line}`);
      }
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        user: match[3],
        elapsedSeconds: Number(match[4]),
        args: match[5],
      };
    });
}

function readProcessTable(runCommand = defaultRunCommand) {
  const stdout = runCommand('ps', ['-eo', 'pid=,ppid=,user=,etimes=,args=']);
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

function resolveFamilies(selectedFamilyNames) {
  const familyMap = new Map(PROCESS_FAMILIES.map((family) => [family.name, family]));
  return selectedFamilyNames.map((familyName) => {
    const family = familyMap.get(familyName);
    if (!family) {
      throw new Error(`未知 family：${familyName}；可选值：${PROCESS_FAMILIES.map((item) => item.name).join(', ')}`);
    }
    return family;
  });
}

function matchFamily(processInfo, families) {
  return families.find((family) => family.match(processInfo)) || null;
}

function groupProcesses(processes, options) {
  const families = resolveFamilies(options.families);
  const groups = new Map();

  for (const processInfo of processes) {
    if (processInfo.user !== options.user) {
      continue;
    }

    const family = matchFamily(processInfo, families);
    if (!family) {
      continue;
    }

    const groupKey = `${family.name}\u0000${processInfo.ppid}\u0000${processInfo.args}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        family,
        ppid: processInfo.ppid,
        args: processInfo.args,
        processes: [],
      });
    }
    groups.get(groupKey).processes.push(processInfo);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    processes: [...group.processes].sort(
      (left, right) => left.elapsedSeconds - right.elapsedSeconds || right.pid - left.pid,
    ),
  }));
}

function collectDuplicateTargets(processes, options) {
  const thresholdSeconds = Math.floor(options.minutes * 60);
  const groups = groupProcesses(processes, options);
  const matchedGroups = [];

  for (const group of groups) {
    if (group.processes.length <= options.keep) {
      continue;
    }

    const kept = group.processes.slice(0, options.keep);
    const duplicates = group.processes.slice(options.keep);
    const staleDuplicates = duplicates.filter((processInfo) => processInfo.elapsedSeconds >= thresholdSeconds);

    if (staleDuplicates.length === 0) {
      continue;
    }

    matchedGroups.push({
      ...group,
      kept,
      duplicates,
      staleDuplicates,
      youngDuplicates: duplicates.filter((processInfo) => processInfo.elapsedSeconds < thresholdSeconds),
    });
  }

  return matchedGroups.sort((left, right) => right.staleDuplicates.length - left.staleDuplicates.length || left.family.name.localeCompare(right.family.name));
}

function buildKillPlan(groups) {
  return groups
    .flatMap((group) => group.staleDuplicates)
    .sort((left, right) => right.elapsedSeconds - left.elapsedSeconds || right.pid - left.pid);
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainSeconds = seconds % 60;
  return `${hours}h${String(minutes).padStart(2, '0')}m${String(remainSeconds).padStart(2, '0')}s`;
}

function formatProcess(processInfo) {
  return `pid=${processInfo.pid} ppid=${processInfo.ppid} age=${formatDuration(processInfo.elapsedSeconds)} cmd=${processInfo.args}`;
}

function formatGroup(group) {
  const lines = [
    `- family=${group.family.name} ppid=${group.ppid} matched=${group.processes.length} keep=${group.kept.length} stale=${group.staleDuplicates.length}`,
    `  signature=${group.args}`,
  ];

  for (const processInfo of group.kept) {
    lines.push(`  keep ${formatProcess(processInfo)}`);
  }
  for (const processInfo of group.staleDuplicates) {
    lines.push(`  kill ${formatProcess(processInfo)}`);
  }
  for (const processInfo of group.youngDuplicates) {
    lines.push(`  skip-young ${formatProcess(processInfo)}`);
  }

  return lines.join('\n');
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

  const processes = readProcessTable();
  const groups = collectDuplicateTargets(processes, options);

  if (groups.length === 0) {
    process.stdout.write(
      `没有找到用户 ${options.user} 下运行超过 ${options.minutes} 分钟的重复白名单进程。\n`,
    );
    return 0;
  }

  process.stdout.write(
    `找到 ${groups.length} 组重复进程（用户 ${options.user}，超过 ${options.minutes} 分钟，每组保留最新 ${options.keep} 个）：\n`,
  );
  process.stdout.write(`${groups.map((group) => formatGroup(group)).join('\n')}\n`);

  const killPlan = buildKillPlan(groups);
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
  PROCESS_FAMILIES,
  buildKillPlan,
  collectDuplicateTargets,
  defaultRunCommand,
  formatDuration,
  formatGroup,
  groupProcesses,
  killProcesses,
  main,
  matchFamily,
  parseArgs,
  parseFamilyNames,
  parsePsOutput,
  readProcessTable,
  resolveFamilies,
};
