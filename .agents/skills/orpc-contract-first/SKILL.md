---
name: orpc-contract-first
description: 当 7Flows 明确决定引入 oRPC 合同优先 API 层时使用。仅适用于新增 `web/contract`、客户端 contract router、或将现有调用迁移到合同优先模式的任务。
---

# oRPC 合同优先开发

## 先判断是否真的该用

7Flows 当前仓库还没有：

- `web/contract/`
- oRPC client
- contract-first 的既有组织方式

因此此技能**不是当前默认前端模式**。只有在以下场景才使用：

- 用户明确要求为 7Flows 引入 oRPC
- 仓库已经开始建立 `web/contract/*`
- 当前任务就是设计“合同优先”的 API 层

如果只是一般的页面开发、简单数据获取或当前骨架迭代，不要强行引入 oRPC。

## 使用目标

- 将 contract 作为单一事实来源
- 保持输入输出类型稳定
- 避免调用点手写散落的请求细节

## 最小结构

```text
web/contract/
  base.ts
  router.ts
  ...
web/service/client.ts
```

## 工作流

1. 先确认本次任务确实需要合同优先层，而不是普通数据获取。
2. 在 `web/contract/` 中定义 contract。
3. 在 `router.ts` 聚合 contract。
4. 通过统一 client 在 UI 中消费 contract。

## 7Flows 额外约束

- 合同层表达的是 7Flows 自己的领域对象，不要把外部协议对象直接当内部主模型。
- 如果未来接发布接口，contract 也应围绕 workflow / run / published endpoint 这些实体展开。
- 不要为了“看起来高级”在当前还很早期的仓库里过度引入 oRPC 抽象。
