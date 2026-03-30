# 7Flows 文档索引

`docs/` 只保留共享基线、索引与长期决策，不承载个人偏好、机器路径或按日期开发流水。

开始前先读 [docs/AGENTS.md](/E:/code/taichuCode/7flows/docs/AGENTS.md)。

## 共享入口

- [开源项目定位](/E:/code/taichuCode/7flows/docs/open-source-positioning.md)
- [产品设计方案](/E:/code/taichuCode/7flows/docs/product-design.md)
- [技术设计补充](/E:/code/taichuCode/7flows/docs/technical-design-supplement.md)
- [开发文档索引](/E:/code/taichuCode/7flows/docs/dev/README.md)
- [ADR 索引](/E:/code/taichuCode/7flows/docs/adr/README.md)

## 目录说明

- `docs/dev/`
  - 当前共享协作规则与研发入口。
- `docs/adr/`
  - 长期保留“背景 / 决策 / 后果”的架构与协作决策。
- `docs/expired/`
  - 已废弃但仍保留历史价值的文档。
- `docs/.private/`
  - 当前开发者自己的本地私有记忆，默认不进共享仓库；如存在 `AGENTS.md`，先从它进入本地私有上下文。
- `docs/.taichuy/`
  - 本地讨论草稿和推导素材，默认不作为事实入口。

## 使用提醒

- 共享文档优先链式说明，避免跨文件重复搬运同一规则。
- 本地开发一键启停入口以根目录 `README.md` 为准；当前 Node 入口是 `scripts/dev-up.js` / `scripts/dev-pause.js`，Web 默认端口为 `3100`。
- 如果任务涉及 AI 协作流程、技能治理、高风险改动，或需要浏览器自动化 / 截图留证，再继续阅读 `.agents/`、`docs/dev/team-conventions.md` 与相关 ADR；当前浏览器自动化默认优先 `Playwright CLI / 系统 Chrome`，避免重型 DevTools 常驻会话。
