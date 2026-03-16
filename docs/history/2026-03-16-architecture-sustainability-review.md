# 2026-03-16 架构可持续推进复核

## 背景

- 用户要求基于 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md` 与 `docs/dev/runtime-foundation.md`，重新评估当前项目是否已经把基础框架设计到可持续推进阶段。
- 本轮重点是给出“能否继续做功能、哪里还能扩、哪里需要解耦、哪些闭环还没完成、后续该按什么顺序推进”的现实判断，并把结论补成可追溯文档，而不是空泛重复长期愿景。

## 评估输入

- 文档基线：`AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md`、`docs/dev/runtime-foundation.md`
- 代码抽查：`api/app/services/runtime.py`、`api/app/services/runtime_node_dispatch_support.py`、`api/app/services/agent_runtime.py`、`api/app/services/run_trace_views.py`、`web/lib/get-workflow-publish.ts`、`web/components/workflow-editor-variable-form.tsx`
- 代码体量复核：对 `api/`、`web/` 全量文件按行数排序，确认当前热点是否仍集中在少数 service / helper / form 聚合点
- 真实验证：`api/.venv/Scripts/uv.exe run pytest -q`、`web/pnpm exec tsc --noEmit`

## 结论

### 1. 基础框架已经写到“可持续开发”阶段

- 当前后端主链 `workflow definition -> compiled blueprint -> runtime -> runs/node_runs/run_events -> published surface -> diagnostics` 已经成立，说明项目不是“骨架未定”的早期状态。
- `RuntimeService` 虽然仍是主入口，但节点准备、节点调度、节点执行、执行进度、生命周期与图支持已拆到独立 mixin，整体方向是收口 orchestration，而不是继续堆 God object。
- `llm_agent`、`tool gateway`、`published protocol`、`sensitive access control`、workspace starter、workflow editor 等主域边界已经存在相对稳定的事实分层，因此后续功能开发不需要回头重搭主框架。

### 2. 架构已经满足功能推进、插件扩展与兼容演进门槛

- 代码与文档都仍然坚持 `7Flows IR`、runtime records 与统一事件流优先，没有让 Dify / OpenAI / Anthropic 任一外部协议反向主导内部模型。
- 兼容方向目前通过 plugin runtime / compat adapter 演进，对外发布则走 native / OpenAI / Anthropic 的 published surface 映射，整体符合“内部统一、外部适配”的设计目标。
- 工作流持久化链路已经补了较多 honest guard，包括 planned node 阻断、tool catalog reference guard、tool execution capability guard、publish version reference guard、node/publish contract validation。这意味着平台已经从“能保存”逐步走向“只允许保存当前真实可运行的定义”。
- 仍未完全兑现的关键边界也很明确：`loop` 还未进入 MVP executor，真正独立的 `SandboxBackendRegistration / SandboxExecution` 还没落地。因此现在的判断应是“主框架够用了，但隔离执行和部分高级控制流仍在兑现中”，而不是“所有底层问题都已经解决”。

### 3. 可靠性、稳定性与安全治理具备继续强化的现实基础

- `SensitiveAccessControlService`、approval ticket、notification dispatch、tool invoke gating、trace export gating、published invocation detail access 已经形成统一事实层，说明安全治理不再只是散落在 UI 或单点路由上的附加逻辑。
- waiting / resume / callback ticket / artifact / trace drilldown 已经有持续推进的主轴，后续可以补 operator experience，而不需要重写状态模型。
- 本轮真实验证结果为：后端 `300 passed in 33.56s`，前端 `pnpm exec tsc --noEmit` 通过。这说明当前仓库已经具备继续演进的基本稳定性，但并不代表业务闭环已经全部完成。

### 4. 当前的主要技术风险是热点再次聚拢

- 后端最值得优先继续解耦的热点包括：`api/app/services/workspace_starter_templates.py`（约 575 行）、`api/app/services/runtime_node_dispatch_support.py`（约 573 行）、`api/app/services/agent_runtime.py`（约 523 行）、`api/app/services/run_trace_views.py`（约 405 行）。
- 前端最值得优先继续解耦的热点包括：`web/lib/get-workflow-publish.ts`（约 457 行）、`web/lib/workflow-tool-execution-validation.ts`（约 399 行）、`web/components/workflow-editor-variable-form.tsx`（约 378 行）。
- 这些文件现在还没有大到必须立即重写，但如果下一步继续往里面堆 waiting policy、provider-specific 分支、publish diagnostics、starter governance、复杂表单状态与结构化校验，复杂度会很快回流。
- 反过来看，`api/app/services/runtime.py` 与 `web/components/workflow-editor-workbench.tsx` 这类壳层文件现在更接近 facade / shell 角色，说明前几轮“壳层减负、状态下沉”的方向是有效的，应该继续沿用。

### 5. 主要业务可以继续闭环推进，但尚未到人工逐项界面设计阶段

- 用户层：workflow editor、publish、run diagnostics、sensitive access inbox 已经具备工作台雏形，但字段级配置完整度、publish binding identity、callback waiting operator 体验仍要继续补齐。
- AI 与人协作层：`llm_agent` phase pipeline、tool execution trace、run evidence / execution view 已经具备继续深化的支点，但 product-level `SkillDoc`、retrieval contract 与更完整的 callback / approval narrative 还没有形成稳定闭环。
- AI 治理层：敏感访问控制是当前完成度最高的一条主线，已经具备继续做审批、通知、解释和审计的事实基础；但组织级 `workspace / member / role / publish governance` 仍主要停留在目标设计。
- 因此当前结论是：项目可以持续推进完整度，并逐步在用户层、协作层、治理层形成闭环；但尚未达到“所有核心能力都已完成，只剩人工逐项界面设计”的阶段，本轮不触发用户指定的通知脚本。

## 优先级建议

1. **P0：补齐 `WAITING_CALLBACK` / approval / resume 的 operator 闭环**
   - 直接影响流程是否能真正跑完，比再做更多外围展示更关键。
2. **P0：把 graded execution 从 contract 推进到真实隔离后端**
   - 当前 execution-aware dispatch 已成立，但真正的 sandbox / microvm backend 仍是可靠性与安全性的关键缺口。
3. **P0：继续扩统一敏感访问控制闭环**
   - 现有事实层已经成型，应继续补 policy explanation、跨入口 drilldown、批量治理与 operator diagnostics。
4. **P1：优先治理真实热点文件，而不是平均用力**
   - 重点盯 `runtime_node_dispatch_support.py`、`agent_runtime.py`、`run_trace_views.py`、`workspace_starter_templates.py`、`get-workflow-publish.ts`、`workflow-editor-variable-form.tsx`。
5. **P1：继续补 editor / publish 的结构化配置完整度**
   - 保持“人可配置、AI 可追溯、保存链路诚实阻断”的方向，不退回大块 JSON 配置。
6. **P1：收敛轻量 Skill Catalog 与 `llm_agent` 注入链**
   - 这是后续 AI 协作层是否真正达到产品设计目标的关键，但仍应坚持 service-hosted 轻量方案。
7. **P2：补最小组织治理模型**
   - 为 Team / Enterprise 留治理位，但不引入第二套执行引擎或重型 IAM 负担。

## 验证

- 后端：`cd api; .\.venv\Scripts\uv.exe run pytest -q` → `300 passed in 33.56s`
- 前端：`cd web; pnpm exec tsc --noEmit` → 通过（零输出）

## 影响

- `docs/dev/runtime-foundation.md` 已同步补充本轮按行数收窄后的热点判断，避免“需要继续解耦”只停留在笼统表述。
- 当前项目仍不触发“人工逐项界面设计验收”通知脚本，后续只有在主业务闭环真正接近完成时才应执行该动作。
