---
name: frontend-testing
description: 为 7Flows `web/` 目录补充或审查前端测试。适用于组件、页面、Hook、前端工具函数，以及未来工作流编辑器相关 UI 的测试设计与实现。
---

# 7Flows 前端测试

## 何时使用

当用户要求以下内容时使用：

- 为 `web/` 下的组件、页面、Hook、工具函数编写测试
- 审查现有前端测试是否充分
- 提升前端覆盖率
- 为工作流编辑器、节点配置、调试面板、发布配置补测试

不要用于：

- Python/pytest 后端测试
- Playwright/Cypress 级别的端到端测试

## 先确认仓库现状

当前仓库尚未提供完整前端测试基础设施：

- `web/package.json` 还没有 `test` 脚本
- 还没有 `vitest.config.*`
- 还没有 React Testing Library 依赖

因此使用此技能时，要先判断：

1. 本次只是评审测试思路
2. 还是要顺手把第一套测试基础设施搭起来

如果本次测试涉及调试、发布治理、OpenClaw 场景入口或产品主叙事相关界面，还应先补读 `docs/open-source-commercial-strategy.md`，确保测试优先覆盖 adoption-critical 的黑盒透明能力，而不是把尚未落地的治理能力当成既有事实。

如果用户要求真正落测试，而仓库又没有测试基础设施，可以在变更中一并引入最小可用方案，但需要明确说明这是新增能力而不是已有约定。

## 测试原则

- 先测稳定逻辑，再测复杂画布交互
- 优先黑盒测试，断言用户可见行为
- 不伪造不存在的脚本、目录、全局 mock 体系
- 覆盖 7Flows 的产品语义，而不是只测“渲染成功”

## 推荐顺序

1. `web/lib/` 下的纯函数与数据转换
2. 简单展示组件
3. 配置面板和表单组件
4. 页面级容器
5. 未来的 xyflow 节点、画布、调试面板

## 7Flows 重点测试场景

- 节点类型切换后的字段显隐
- 模型、工具、MCP、沙盒、授权开关的展示与禁用状态
- 未实现能力的占位、禁用或实验态提示
- sandbox backend capability 缺失、backend 健康降级，以及“需要强隔离但当前 unavailable / blocked”的提示是否能被用户明确感知
- OpenClaw / 本地 AI 助手场景下的执行透明、trace / replay、失败定位与调试入口
- 调试视图的 loading / success / failed / empty 分支
- 发布协议配置在 `native` / `openai` / `anthropic` 间的分支展示
- 变量引用、schema 预览、空数据和缺失字段处理

详细规则参见 [references/sevenflows-frontend-testing.md](references/sevenflows-frontend-testing.md)

## 验证要求

如果本次已经引入测试基础设施：

```bash
pnpm exec vitest run
pnpm lint
pnpm exec tsc --noEmit
```

如果本次没有引入测试基础设施：

- 明确说明当前仓库无前端测试基础设施
- 给出建议测试点，但不要声称已运行前端测试
