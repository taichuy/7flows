# 7Flows 前端测试规则

本规则用于指导 7Flows 前端测试，不再默认假设仓库已经具备 Dify 那套完整测试基础设施。

## 当前仓库现实

- `web/package.json` 当前只有 `dev`、`build`、`start`、`lint`
- 还没有 `vitest.config.*`、`test` 脚本、React Testing Library 依赖
- 因此当用户要求补测试时，先判断：
  - 是仅审查测试思路
  - 还是要顺手为当前仓库建立第一套前端测试基础设施

## 测试策略优先级

### 1. 先测稳定逻辑，再测重交互画布

优先级建议：

1. `web/lib/` 下的纯函数、数据转换、协议映射
2. 简单展示组件
3. 配置表单与面板组件
4. 页面级数据获取与状态切换
5. xyflow 节点、画布交互、调试面板等复杂 UI

### 2. 测试用例要覆盖 7Flows 的产品语义

如果测试对象与工作流平台能力相关，优先覆盖：

- 节点类型切换后的字段可见性
- 模型/工具/MCP/沙盒/授权开关是否正确渲染
- 未实现功能是否被正确禁用或标记实验态
- 调试面板是否正确区分 loading / succeeded / failed / empty
- 发布协议配置是否按 `native` / `openai` / `anthropic` 显示不同区块
- 变量引用与 schema 展示是否处理空值、缺失值、错误值

### 3. 不要为当前仓库编造不存在的测试工具

避免引用不存在的内容，例如：

- `pnpm analyze-component`
- `web/docs/test.md`
- `web/test/nuqs-testing.tsx`
- Dify 专用 mock 目录和全局 store 约定

如果任务需要真正落测试，而项目尚未配置测试栈，可以在变更中一并引入最小可用方案：

- `vitest`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `jsdom`

## 推荐测试分层

### 纯函数 / 工具

- 适合直接用 Vitest
- 重点验证 schema 映射、状态映射、派生字段、边界值

### React 组件

- 使用 React Testing Library 做黑盒测试
- 优先断言用户可见结果，而不是内部 state
- 对复杂依赖只 mock 网络、路由、时间和浏览器 API

### 页面与容器组件

- 重点测 loading / error / success / empty / unsupported
- 若页面只是拼装多个子组件，可适度降低分支粒度，避免过度依赖实现细节

## 必测边界

任何与工作流编排相关的前端逻辑，至少覆盖：

- `null` / `undefined`
- 空数组 / 空 schema / 空 capabilities
- 不支持的节点类型
- 后端返回部分字段缺失
- 实验态或未实现能力的禁用展示

## 最小验证

若已接入测试栈：

```bash
pnpm exec vitest run
pnpm lint
pnpm exec tsc --noEmit
```

若尚未接入测试栈且本次未要求搭建测试基础设施：

- 明确说明“当前仓库无前端测试基础设施”
- 提供建议测试点，但不要伪造已运行的测试结果
