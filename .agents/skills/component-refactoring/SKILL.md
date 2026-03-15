---
name: component-refactoring
description: 用于重构 7Flows `web/` 中复杂、职责混乱或即将承载工作流编辑器能力的 React 组件。适用于页面骨架、节点组件、配置面板、调试面板、发布配置界面的拆分与降复杂度。
---

# 7Flows 前端组件重构

## 何时使用

当用户要求以下任一工作时使用：

- 拆分过大的 React 组件
- 提取 Hook、子组件或表单 section
- 为未来的 xyflow 画布与节点系统建立更清晰的目录和职责边界
- 降低页面或组件中的状态耦合、条件分支复杂度和协议耦合

不要用于：

- 简单展示组件的小修小补
- 纯样式调整
- 只要求补测试而不涉及结构调整的任务

## 当前仓库前提

- 当前 `web/` 还是 Next.js 轻量骨架，没有 Dify 中的 `pnpm analyze-component` / `pnpm refactor-component`。
- 因此不要依赖这些不存在的脚本，也不要强行套用 Dify 的目录结构。
- 当前重构后的最小验证命令优先使用：

```bash
pnpm lint
pnpm exec tsc --noEmit
```

## 重构原则

- 先按职责拆分，不按“看起来差不多”机械拆文件
- 优先把业务推导、schema 转换、权限判断、状态编排从 JSX 中移走
- 保持画布壳层、节点配置、调试面板、发布配置等核心界面职责清晰
- 避免过早抽象；只在明显减少复杂度时提取通用层

## 推荐工作流

1. 通读目标组件和相邻文件，确认它承担了哪些职责。
   如果目标组件涉及调试、发布治理、OpenClaw 场景入口或版本边界，还应先补读 `docs/open-source-commercial-strategy.md`。
2. 判断优先拆分轴：
   - 视觉区块
   - 状态与副作用
   - 节点壳层 vs 配置表单
   - 调试展示 vs 数据订阅
   - 协议映射 vs 通用 UI
3. 先抽出最稳定的一层：
   - Hook
   - 子组件
   - section 组件
   - schema renderer
4. 每次拆分后运行最小验证命令。

## 7Flows 特有重构模式

- 画布节点：参见 [references/sevenflows-editor-patterns.md](references/sevenflows-editor-patterns.md)
- 通用拆分模式：参见 [references/component-splitting.md](references/component-splitting.md)
- Hook 提取：参见 [references/hook-extraction.md](references/hook-extraction.md)
- 复杂度识别：参见 [references/complexity-patterns.md](references/complexity-patterns.md)

### 重点关注

- 节点壳层与配置面板是否分离
- `nodeTypes` / `edgeTypes` 是否保持稳定引用
- 多协议发布配置是否共享同一视图模型
- 调试面板是否拆成 timeline / logs / metrics / payload 等稳定区块
- 是否把 Dify 风格前端基础设施假设硬搬到了 7Flows
- 是否把“黑盒调试主切口”和“后续治理控制面”混在一个难以扩展的单体组件里

## 验证要求

至少运行：

```bash
pnpm lint
pnpm exec tsc --noEmit
```

如果当前区域已经有测试，再运行对应测试；如果没有，不要伪造存在的测试命令。
