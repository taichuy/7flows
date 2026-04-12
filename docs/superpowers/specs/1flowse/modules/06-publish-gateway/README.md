# 06 发布网关与 API 文档

日期：2026-04-10
状态：已确认

## 讨论进度

- 状态：`completed`
- 完成情况：已完成发布协议、鉴权方式、文档基线、入口形态与回滚表现定稿，并获用户确认。
- 最后更新：2026-04-10 18:45 CST

## 已整理来源文档

- [2026-04-10-product-design.md](../../2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](../../2026-04-10-product-requirements.md)
- [2026-04-10-p1-architecture.md](../../2026-04-10-p1-architecture.md)
- [2026-04-10-orchestration-design-draft.md](../../2026-04-10-orchestration-design-draft.md)

## 本模块范围

- Flow 发布配置
- 对外 API 适配与鉴权
- API 文档页
- callback 协议暴露

## 已确认

- `Publish Endpoint` 是 Flow 的对外交付物。
- `标准 Agent 兼容发布` 是产品主目标，`Publish Endpoint` 是核心交付物。
- P1 推荐采用统一内部运行协议 + 多个对外适配层。
- 发布能力优先于平台内聊天体验，Flow 只有稳定对外暴露后才算完成。
- API 文档是一等页面，至少应展示接口形态、鉴权方式、请求格式、响应格式、callback 行为。
- 发布网关与运行时共享统一内部协议，不把内部执行模型拆碎为各协议专属逻辑。
- 外部调用方目标明确包含 Codex、Claude Code、本地 Agent 等客户端。
- `Published Contract` 与 `Authoring Document`、`Compiled Plan` 分层独立，不混存。
- `Publish Endpoint` 内部持有当前生效的 `publishedFlowVersionId`。
- 发布动作应是原子过程：冻结当前 `Draft` 为新 `FlowVersion` 后，再切换发布指针。
- 发布失败时不允许出现半成功状态。
- 历史版本 `Restore` 只恢复到 `Draft`，不直接切换线上流量；线上生效必须再次 `Publish`。
- P1 首批仅支持 `原生协议`、`OpenAI 兼容协议`、`Claude 兼容协议` 三类发布形态。
- 当前仅考虑 `agentFlow` 应用级调用鉴权，采用 `API Key / Token` 方式；暂不处理整个 `1Flowse` 空间级对外调用鉴权。
- API 文档页最小字段集合与呈现基线参考 `../dify`。
- 发布流量统一先进入控制面入口，再通过一个很薄的转发代理接入运行时；开发环境采用转发方式，生产环境由 `Nginx` 反向代理承接。
- 线上回滚表现采用“回退草稿、不自动上线”规则；需要用户自行再次点击 `Publish` 才更新线上版本。

## 当前结论摘要

- P1 发布网关优先做三类对外契约：原生、OpenAI 兼容、Claude 兼容。
- 对外鉴权先收敛为应用级 `API Key / Token`，不扩展到空间级外部访问模型。
- 文档页先参考 `../dify` 的字段与展示组织，避免 P1 自定义过度。
- 入口架构采用“控制面统一入口 + 薄代理转发”；开发走应用转发，生产走 `Nginx` 反向代理。
- 回滚只改变 `Draft`，不直接切线上；线上更新始终显式通过 `Publish` 完成。
