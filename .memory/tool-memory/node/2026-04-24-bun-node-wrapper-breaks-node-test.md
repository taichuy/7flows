---
memory_type: tool
topic: Bun node wrapper breaks node:test runner
summary: AionUI 环境中 `node` 可能解析到 `/tmp/bun-node-*/node`，执行仓库脚本测试时会用 Bun 跑 `node --test`，导致 `Cannot use test outside of the test runner`；改用真实 NVM Node 路径可通过。
keywords:
  - node
  - bun
  - node:test
  - test-scripts
  - process.execPath
match_when:
  - `node scripts/node/test-scripts.js` 报 Bun 的 `Cannot use test outside of the test runner`
  - `which node` 指向 `/tmp/bun-node-*`
  - 需要运行依赖 `node --test` 的脚本测试
created_at: 2026-04-24 10
updated_at: 2026-04-24 10
last_verified_at: 2026-04-24 10
decision_policy: reference_on_failure
scope:
  - scripts/node/test-scripts.js
  - scripts/node/test/index.js
---

# Bun node wrapper breaks node:test runner

## 失败现象

`node scripts/node/test-scripts.js claude-skill-sync` 在当前 AionUI 会话中失败：

```text
error: Cannot use test outside of the test runner. Run "bun test" to run tests.
Bun v1.3.10
```

同时 `which node` 指向 `/tmp/bun-node-*/node`，`node --version` 也不能正常输出版本。

## 已验证解法

直接使用真实 NVM Node 路径运行测试：

```bash
/home/taichu/.nvm/versions/node/v24.15.0/bin/node scripts/node/test-scripts.js claude-skill-sync
```

`2026-04-24 10` 验证结果：3 个 `claude-skill-sync` 脚本测试全部通过。
