---
memory_type: reference
topic: 源码参考
summary: 记录可作为平台、插件、画布、前端边界和集成实现参考的相邻源码目录与项目内架构文档入口。
keywords:
  - source
  - official-plugins
  - dify
  - xyflow
  - architecture
match_when:
  - 需要找外部源码参考
  - 需要修改或排查官方插件源码
  - 需要查找上层相邻项目源码
  - 需要确认前端技术边界参考文档
created_at: 2026-04-12 19
updated_at: 2026-05-03 21
last_verified_at: 2026-05-03 21
decision_policy: index_only
scope:
  - ../1flowbase-official-plugins
  - /home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible
  - ../1flowbase-project-maintenance
  - ../1flowtap
  - ../AionUi
  - ../Aniu
  - ../agent-search
  - ../aionrs
  - ../ant-design
  - ../awesome-design-md
  - ../bird
  - ../cc-switch
  - ../codex
  - ../css-modules
  - ../dify-official-plugins
  - ../dify-plugin-daemon
  - ../dify
  - ../ds2api
  - ../hermes-agent
  - ../mantine
  - ../moka
  - ../n8n
  - ../new-api
  - ../nocobase
  - ../openclaw
  - ../openai-agents-js
  - ../scalar
  - ../sub2api
  - ../supabase
  - ../xyflow
  - docs/superpowers/specs/1flowbase/2026-04-10-p1-architecture.md
---

# 源码参考

## 外部或相邻源码参考

- `../1flowbase-official-plugins`
  - 本项目官方插件源仓库，绝对路径是 `/home/taichu/git/1flowbase-official-plugins`。修改、排查、重建官方插件时优先看这里，不以 `api/plugins/installed/` 的安装态产物作为源码入口。
  - OpenAI-compatible 官方模型供应商插件源码入口：`/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible`。
- `../1flowbase-project-maintenance`
  - 本项目维护、治理、项目管理相关源码或脚本入口。
- `../1flowtap`
  - 1flow 相关相邻项目源码入口。
- `../AionUi`
  - AionUI 客户端/产品实现相关源码入口。
- `../aionrs`
  - Aion/Rust 相关实现参考入口。
- `../dify`
  - 可作为插件、运行时、平台边界等方向的源码参考；画布/xyflow 交互可看 `../dify/web/app/components/workflow/index.tsx` 与 `../dify/web/app/components/workflow/hooks/use-nodes-interactions.ts`。
- `../dify-official-plugins`
  - Dify 官方插件源码参考入口。
- `../dify-plugin-daemon`
  - Dify 插件运行时/daemon 参考入口。
- `../n8n`
  - 工作流编排产品参考入口。
- `../nocobase`
  - 低代码/数据建模产品参考入口。
- `../openclaw`
  - 相邻平台源码参考入口。
- `../openai-agents-js`
  - OpenAI Agents JavaScript SDK 参考入口。
- `../scalar`
  - API 文档和接口浏览体验参考入口。
- `../supabase`
  - 后端平台、权限、数据产品参考入口。
- `../xyflow`
  - 可作为流程编排、节点画布、交互组织方式的源码参考。

## 其他上层相邻源码仓库

以下仓库作为上层 `../` 相关源码入口索引；只有当前任务明确命中对应主题时再展开读取。

- `../Aniu`
- `../agent-search`
- `../ant-design`
- `../awesome-design-md`
- `../bird`
- `../cc-switch`
- `../codex`
- `../css-modules`
- `../ds2api`
- `../hermes-agent`
- `../mantine`
- `../moka`
- `../new-api`
- `../sub2api`

## 项目内参考文档

- `docs/superpowers/specs/1flowbase/2026-04-10-p1-architecture.md`
  - 可作为前端技术边界参考，特别是 `Ant Design + xyflow + Editor UI` 的分层约束。

## 使用说明

- 这里只记录“参考什么”，不记录结论本身。
- 真正沉淀后的结论应写回正式设计文档或本目录其他记忆文件。
