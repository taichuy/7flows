---
name: frontend-code-review
description: 面向 7Flows `web/` 目录的前端代码审查技能。适用于 Next.js 页面、组件、未来 xyflow 画布、节点配置、调试面板、发布配置等实现的质量、架构和交互风险审查。
---

# 7Flows 前端代码审查

## 何时使用

当用户要求审查、分析或改进 `web/` 下的前端代码时使用，尤其包括：

- `web/app/` 下的页面和布局
- `web/components/` 下的组件
- `web/lib/` 下的数据获取或前端辅助逻辑
- 未来的工作流画布、节点组件、配置面板、调试面板、发布配置页

不要用于：

- `api/` 下的 Python 代码
- 纯后端接口设计讨论

## 使用流程

1. 先识别改动属于页面骨架、组件、数据获取，还是工作流编辑器相关实现。
2. 如果涉及画布、节点、调试、发布、插件 UI、安全或变量传递，优先阅读：
   - `docs/product-design.md`
   - `docs/technical-design-supplement.md`
   - `docs/dev/runtime-foundation.md`
3. 使用通用前端审查规则和 7Flows 专项规则共同审查。
4. 输出时优先指出行为错误、架构偏离、交互误导和性能风险。

## 审查清单

- 代码质量：参见 [references/code-quality.md](references/code-quality.md)
- 性能：参见 [references/performance.md](references/performance.md)
- 7Flows 工作流 UI 约束：参见 [references/sevenflows-workflow-ui-rule.md](references/sevenflows-workflow-ui-rule.md)

## 7Flows 审查重点

### 1. 是否体现“多 Agent 工作流平台”而不是“聊天壳”

- 节点与配置界面不应退化为只有 prompt 和提交按钮。
- 要关注模型、工具、MCP、沙盒、上下文授权、输入输出 schema、调试、发布这些一级能力是否有可见性。

### 2. 是否遵守 xyflow/画布集成边界

- `nodeTypes` / `edgeTypes` 是否稳定
- 节点内部交互是否防止拖拽冲突
- 节点视觉壳层、配置表单、调试视图是否合理拆层

### 3. 是否假设了当前仓库并不存在的 Dify 基础设施

- 当前项目没有 Dify 的 `workflowStore`、前端 service hooks 体系、分析脚本和测试脚手架。
- 如果实现建立在这些不存在的前提上，应直接指出不适配。

### 4. 是否对 MVP 边界保持诚实

- 当前 runtime 仍未完整实现 loop、插件代理、MCP、发布协议映射。
- 前端不应把这些能力假装成已可用；占位、禁用和实验态表达都属于设计质量的一部分。

## 输出要求

- findings 优先，按严重度排序。
- 尽量附文件路径和行号。
- 先讲实际风险，再讲风格建议。
- 若无问题，明确说明并补充剩余风险或测试缺口。
