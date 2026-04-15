---
memory_type: tool
topic: parallel 中同时生成目录和读取目录会出现时序竞争
summary: 在同一批 `multi_tool_use.parallel` 调用中，同时执行“生成目标目录”的命令和“读取该目录”的命令时，读取侧可能先运行并报 `没有那个文件或目录`；已验证应把有依赖关系的生成和校验改为串行执行。
keywords:
  - multi_tool_use
  - parallel
  - race
  - no such file or directory
  - generated directory
match_when:
  - 需要一边生成文件或目录，一边立即校验同一路径
  - parallel 返回 `没有那个文件或目录`
  - 两个并行命令存在先后依赖
created_at: 2026-04-15 21
updated_at: 2026-04-15 22
last_verified_at: 2026-04-15 22
decision_policy: reference_on_failure
scope:
  - multi_tool_use.parallel
  - shell
  - generated directories
---

# parallel 中同时生成目录和读取目录会出现时序竞争

## 时间

`2026-04-15 21`

## 失败现象

同一批并行调用里同时执行：

- `node scripts/node/claude-skill-sync.js`
- `find .claude/skills -maxdepth 2 -type f | sort`

读取侧会报：

```text
find: ‘.claude/skills’: 没有那个文件或目录
```

## 触发条件

- 使用 `multi_tool_use.parallel` 同时跑两个 shell 命令
- 其中一个命令负责生成目录或文件
- 另一个命令立即读取同一路径

## 根因

并行调用不保证执行顺序。读取命令可能先于生成命令完成或甚至先启动，因此在目标目录尚未落盘时就报路径不存在。

## 解法

- 只对真正独立、无先后依赖的命令使用 `multi_tool_use.parallel`
- 对“先生成、后校验”的链路，必须改成串行执行
- 如果只是想节省一次调用，也要把生成和校验放在同一个顺序 shell 流程里，而不是拆成并行任务

## 验证方式

- 先单独执行生成命令，再执行读取命令
- 第二次顺序执行 `find .claude/skills -maxdepth 2 -type f | sort` 能正确列出生成结果

## 复现记录

- `2026-04-15 21`：在为 `.agents/skills` 生成 `.claude/skills` 时，把 `node scripts/node/claude-skill-sync.js` 和 `find .claude/skills ...` 放进同一批 `parallel`，读取侧先执行导致报目录不存在；改为串行复查后确认脚本输出正常。
- `2026-04-15 22`：在修复 `references/` 同步后，又把 `node scripts/node/claude-skill-sync.js` 与 `find .claude/skills/backend-development ...`、`sed .claude/skills/backend-development/references/api-design.md` 并行执行；读取侧拿到生成前的旧目录状态，表现为只看到旧的 `SKILL.md` 或直接报引用文件不存在。后续凡是“重新生成后立刻验结果”的命令都必须串行。
