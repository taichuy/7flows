# 7Flows 开发文档索引

开始前先读 [docs/AGENTS.md](/E:/code/taichuCode/7flows/docs/AGENTS.md) 与 [团队协作约定](/E:/code/taichuCode/7flows/docs/dev/team-conventions.md)。

## 当前入口

- [team-conventions.md](/E:/code/taichuCode/7flows/docs/dev/team-conventions.md)
  - 团队级共享协作规则、验证基线和提交要求。
- [github-security-drift-triage.md](/E:/code/taichuCode/7flows/docs/dev/github-security-drift-triage.md)
  - 当 GitHub Dependabot 告警与默认分支锁文件事实不一致时的共享排查入口，并说明同名 GitHub workflow 的自动复验、单一 tracking issue 与状态轨迹 handoff 方式。
- [ADR 索引](/E:/code/taichuCode/7flows/docs/adr/README.md)
  - 长期保留“背景 / 决策 / 后果”的事项。
- [技能索引](/E:/code/taichuCode/7flows/.agents/skills/README.md)
  - AI 协作技能、服务分组和使用案例；其中 `browser-automation` 用于本地页面复核、浏览器操作与截图留证，当前默认优先 `Playwright CLI / 系统 Chrome`。

## 维护约定

- `docs/dev/` 只保留共享协作规则与研发入口。
- 当前仓库的一键开发启停入口见根目录 `README.md`；当前推荐使用 `node scripts/dev-up.js`、`node scripts/dev-pause.js`，Web 默认端口为 `3100`。
- 目录级规则优先放到对应目录的 `AGENTS.md`，不要重新堆回根文档。
- 当前开发者自己的目标、过程和稳定偏好继续放在 `docs/.private/`，并保持本地化；如存在 `docs/.private/AGENTS.md`，优先从那里进入本地私有上下文。
