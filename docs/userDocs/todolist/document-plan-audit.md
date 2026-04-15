# 文档计划审计待讨论

更新时间：`2026-04-16 04:00 CST`

说明：本文件承接同主题滚动讨论，但本轮只保留最值得拍板的新问题，不重复上一轮已经确认的“文档真值漂移、统一门禁未全绿、authoring 强于 publish/run”。

## 1. 现状

- 最近 `24` 小时（`2026-04-15 04:00:53 CST` 到 `2026-04-16 04:00:53 CST`）有 `42` 次提交。
- 当前推进重心非常集中：
  - `web/app/src/features/agent-flow` 命中 `86` 条路径
  - `web/app/src/features/applications` 命中 `13` 条路径
  - `api/` 命中 `49` 条路径
- 当前真实主线已经是：
  - `工作台 -> Application -> orchestration -> agentFlow editor`
- 当前新增确认的问题有五个：
  1. `flow.edit.*` 没有真正接到编排写入口，`save_draft / restore_version` 还是靠 `application.view.*` 放行
  2. 应用创建与进入应用仍有整页刷新，主路径没有完全切到前端 router 真值
  3. UI 开始泄露内部模块编号，并出现“可点但没动作”的 `发布配置`
  4. 产品与需求文档仍在描述广口径 P1 平台，但最近 `24` 小时几乎没有把 `publish/run/logs` 做成真实链路
  5. `工具`、`子系统` 仍在一级导航，但当前都不是成熟主路径

## 2. 可能方向

### 方向 A：继续 editor-first

- 继续堆 `agentFlow` 节点、面板、交互和发布配置 UI

### 方向 B：先收口真值

- 先统一权限、路由、文案、模块状态和当前阶段表达

### 方向 C：先补最小 publish/run proof

- 暂停继续扩 editor，优先补应用级 API Key、对外调用契约、最小 run/logs

## 3. 不同方向的风险和收益

### 方向 A：继续 editor-first

- 收益：演示速度最快，短期最容易看到“新东西”
- 风险：权限错误、假可用入口和产品口径漂移会被继续固化

### 方向 B：先收口真值

- 收益：后续 AI 协作、评估和实现都会稳很多
- 风险：短期看起来新增功能不多

### 方向 C：先补最小 publish/run proof

- 收益：最快验证 `publish-first` 是不是当前正确主线
- 风险：如果权限和路由真值没先收好，会把旧问题带进新链路

## 4. 对此你建议是什么？

建议顺序固定为：`先 B，再 C，最后再回到 A`。

### 先做的事

1. 把编排写权限切到 `flow.edit.*`
2. 把应用创建和进入应用全部改成 router 跳转
3. 收掉假可用 `发布配置`，去掉 UI 里的 `03 / 04 / 05 / 06B / planned`
4. 把当前阶段正式改口径为：
   - `Application-hosted agentFlow authoring baseline 已建立`
   - `下一步补最小 publish/run proof`

### 再做的事

1. 补最小应用级 API Key 与调用契约
2. 补最小 `Application Run List`
3. 给 `publish-gateway` 做出真实接口边界

### 暂时不建议优先做的事

1. 继续只加 editor 细节
2. 继续保留一级导航里的“建设中”入口
3. 继续让产品文档保持“大平台已经在实现”的表述
