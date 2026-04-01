const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildKillPlan,
  collectDuplicateTargets,
  formatDuration,
  parseArgs,
  parsePsOutput,
} = require('./kill-stale-duplicate-processes.js');

test('parseArgs keeps dry-run defaults and parses families', () => {
  assert.deepEqual(parseArgs([]), {
    minutes: 120,
    keep: 1,
    signal: 'SIGTERM',
    user: process.env.USER || require('node:os').userInfo().username,
    kill: false,
    families: ['bun-dist-server-acp', 'codex-acp'],
  });

  assert.deepEqual(
    parseArgs(['--minutes', '90', '--keep', '2', '--family', 'codex-acp,bun-dist-server-acp', '--kill']),
    {
      minutes: 90,
      keep: 2,
      signal: 'SIGTERM',
      user: process.env.USER || require('node:os').userInfo().username,
      kill: true,
      families: ['codex-acp', 'bun-dist-server-acp'],
    },
  );
});

test('collectDuplicateTargets keeps newest instance per parent and only targets stale duplicates', () => {
  const processes = parsePsOutput(`
  100  10 taichu 7200 /home/taichu/.nvm/versions/node/v22.12.0/lib/node_modules/bun/bin/bun.exe /home/taichu/git/AionUi/dist-server/acp.js
  101  10 taichu 1800 /home/taichu/.nvm/versions/node/v22.12.0/lib/node_modules/bun/bin/bun.exe /home/taichu/git/AionUi/dist-server/acp.js
  102  10 taichu 900 /home/taichu/.nvm/versions/node/v22.12.0/lib/node_modules/bun/bin/bun.exe /home/taichu/git/AionUi/dist-server/acp.js
  110  11 taichu 7100 /home/taichu/.npm-cache/_npx/2571/node_modules/@zed-industries/codex-acp-linux-x64/bin/codex-acp
  111  11 taichu 1200 /home/taichu/.npm-cache/_npx/2571/node_modules/@zed-industries/codex-acp-linux-x64/bin/codex-acp
  120  12 other 7200 /home/taichu/.npm-cache/_npx/2571/node_modules/@zed-industries/codex-acp-linux-x64/bin/codex-acp
  `);

  const groups = collectDuplicateTargets(processes, {
    minutes: 60,
    keep: 1,
    user: 'taichu',
    families: ['bun-dist-server-acp', 'codex-acp'],
  });

  const stricterGroups = collectDuplicateTargets(processes, {
    minutes: 120,
    keep: 1,
    user: 'taichu',
    families: ['bun-dist-server-acp', 'codex-acp'],
  });

  assert.equal(groups.length, 2);

  const bunGroup = groups.find((group) => group.family.name === 'bun-dist-server-acp');
  assert.deepEqual(bunGroup.kept.map((item) => item.pid), [102]);
  assert.deepEqual(bunGroup.staleDuplicates.map((item) => item.pid), [100]);
  assert.deepEqual(bunGroup.youngDuplicates.map((item) => item.pid), [101]);

  const codexGroup = groups.find((group) => group.family.name === 'codex-acp');
  assert.deepEqual(codexGroup.kept.map((item) => item.pid), [111]);
  assert.deepEqual(codexGroup.staleDuplicates.map((item) => item.pid), [110]);

  const stricterBunGroup = stricterGroups.find((group) => group.family.name === 'bun-dist-server-acp');
  assert.deepEqual(stricterBunGroup.staleDuplicates.map((item) => item.pid), [100]);
  assert.deepEqual(stricterBunGroup.youngDuplicates.map((item) => item.pid), [101]);

  const stricterCodexGroup = stricterGroups.find((group) => group.family.name === 'codex-acp');
  assert.equal(stricterCodexGroup, undefined);
});

test('buildKillPlan orders oldest processes first', () => {
  const groups = [
    {
      staleDuplicates: [
        { pid: 100, ppid: 10, elapsedSeconds: 7200, args: 'bun dist-server/acp.js' },
        { pid: 110, ppid: 11, elapsedSeconds: 7500, args: 'codex-acp' },
      ],
    },
  ];

  assert.deepEqual(
    buildKillPlan(groups).map((item) => item.pid),
    [110, 100],
  );
});

test('formatDuration renders hour, minute and second buckets', () => {
  assert.equal(formatDuration(0), '0h00m00s');
  assert.equal(formatDuration(3665), '1h01m05s');
});
