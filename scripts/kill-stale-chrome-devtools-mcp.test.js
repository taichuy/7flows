const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildKillPlan,
  collectTargetSessions,
  formatDuration,
  parseArgs,
  parsePsOutput,
} = require('./kill-stale-chrome-devtools-mcp.js');

test('parseArgs keeps dry-run defaults and parses kill options', () => {
  assert.deepEqual(parseArgs([]), {
    minutes: 10,
    signal: 'SIGTERM',
    kill: false,
  });

  assert.deepEqual(parseArgs(['--minutes', '15', '--signal', 'SIGKILL', '--kill']), {
    minutes: 15,
    signal: 'SIGKILL',
    kill: true,
  });
});

test('collectTargetSessions only selects stale chrome-devtools-mcp roots and their subtree', () => {
  const processes = parsePsOutput(`
  100  1  1200 npm exec chrome-devtools-mcp@latest
  101 100 1198 node /home/user/.npm/_npx/node_modules/.bin/chrome-devtools-mcp
  102 101 1197 /opt/google/chrome/chrome --remote-debugging-pipe
  103 102 1196 /opt/google/chrome/chrome --type=renderer
  200  1   180 npm exec chrome-devtools-mcp@latest
  201 200   179 node /home/user/.npm/_npx/node_modules/.bin/chrome-devtools-mcp
  202 201   178 /opt/google/chrome/chrome --remote-debugging-pipe
  300  1  4000 /opt/google/chrome/chrome --profile-directory=Default
  `);

  const sessions = collectTargetSessions(processes, 600);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].root.pid, 100);
  assert.deepEqual(
    sessions[0].processes.map((item) => item.pid),
    [100, 101, 102, 103],
  );
});

test('buildKillPlan kills descendants before ancestors', () => {
  const sessions = [
    {
      root: { pid: 100, ppid: 1, elapsedSeconds: 1200, args: 'npm exec chrome-devtools-mcp@latest' },
      processes: [
        { pid: 100, ppid: 1, elapsedSeconds: 1200, args: 'npm exec chrome-devtools-mcp@latest' },
        { pid: 101, ppid: 100, elapsedSeconds: 1199, args: 'node chrome-devtools-mcp' },
        { pid: 102, ppid: 101, elapsedSeconds: 1198, args: 'chrome --remote-debugging-pipe' },
        { pid: 103, ppid: 102, elapsedSeconds: 1197, args: 'chrome --type=renderer' },
      ],
    },
  ];

  assert.deepEqual(
    buildKillPlan(sessions).map((item) => item.pid),
    [103, 102, 101, 100],
  );
});

test('formatDuration renders minute and second buckets', () => {
  assert.equal(formatDuration(0), '0m00s');
  assert.equal(formatDuration(605), '10m05s');
});
