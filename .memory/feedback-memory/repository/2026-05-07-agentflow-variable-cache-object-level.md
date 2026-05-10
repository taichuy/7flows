---
created_at: 2026-05-07 20
memory_type: feedback
decision_policy: direct_reference
feedback_category: repository
scope: agent-flow variable cache
---

# AgentFlow Variable Cache Uses Object Level Entries

规则：AgentFlow 变量缓存面板应按节点输出对象展示缓存条目，不默认把对象内所有字段递归平铺成独立变量。

规则补充（2026-05-08 23）：变量缓存、节点详情 Last Run、debug snapshot 恢复等跨视图一致性数据应由 API / read model 给出统一节点输出对象；前端不应在不同组件里各自解包 envelope、按 output selector 投影或过滤 debug payload 来拼出“节点输出”。

规则补充（2026-05-08 23:50）：变量缓存恢复不能只依赖当前页面内存；同一 application + draft 的 `debug_session_id` 必须稳定持久化，页面切换或重新 mount 后继续用该 id 调用 debug variable snapshot API 恢复缓存。只有用户显式重置变量缓存时才生成新的 `debug_session_id`。

原因：变量缓存的目标是帮助用户理解某个节点当前缓存的完整对象；把 `LLM/user_prompt`、`LLM/__attempt_ids[0]` 等字段全部铺出来会制造噪声，也弱化对象整体边界。

原因补充：如果前端多个视图各自处理同一份 `node_run.output_payload`，会出现变量缓存和节点详情输出不一致；一致性属于接口契约，不属于组件展示层职责。

原因补充：后端 snapshot 按 `debug_session_id` 查询历史 run；如果前端每次 mount 都生成新 id，接口会查不到旧 run，表现为切换页面后缓存消失。

适用场景：调试变量缓存面板、durable variable snapshot 恢复后的缓存展示、节点预览运行产生的变量缓存展示。变量选择器或模板绑定需要选择具体输出字段时，仍可保留字段级 selector。
