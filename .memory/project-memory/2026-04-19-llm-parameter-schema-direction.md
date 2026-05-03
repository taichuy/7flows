---
memory_type: project
topic: LLM 节点参数改为 model-aware 动态 schema 方向
summary: 自 `2026-04-19 00` 起，用户进一步明确“LLM 参数 schema 应主要由插件返回；宿主只负责渲染通用 schema ui、保存节点里的 provider 对象与 llm 参数对象，并在运行时把对象一起传给模型供应商插件”。当前已继续确认：模型选中时一并返回参数 schema 并由宿主缓存；切换模型后参数清空并按新 schema 重建；`json_schema` 作为重要能力进入一期，但继续保持节点级独立对象，不回落为普通参数字段；默认生成 outputs 是节点级只读运行契约，LLM 默认暴露 `text/reasoning_content/usage`，后续结构化输出变量只在启用结构化输出后通过专门配置产生；禁止插件自定义控件；provider/code/label 仅作缓存且后台应用页需支持刷新更新。
keywords:
  - llm
  - schema-ui
  - model-parameters
  - provider
  - agentflow
match_when:
  - 需要继续细化 LLM 节点动态参数 schema
  - 需要决定 schema ui 是否增加新类型
  - 需要讨论 provider/model 参数 schema 与 node config 结构
created_at: 2026-04-19 00
updated_at: 2026-05-03 17
last_verified_at: 2026-05-03 17
decision_policy: verify_before_decision
scope:
  - web/app/src/shared/schema-ui
  - web/app/src/features/agent-flow/components/detail/fields/LlmModelField.tsx
  - web/app/src/features/agent-flow/schema
  - api/crates/plugin-framework/src/provider_contract.rs
  - api/crates/control-plane/src/orchestration_runtime.rs
---

# LLM 节点参数改为 model-aware 动态 schema 方向

## 时间

`2026-04-19 00`

## 谁在做什么

- 用户进一步明确：LLM 参数 schema 应交给插件自己定义并返回，宿主不应内建太多参数字段语义。
- AI 已据此收敛边界：宿主只负责 schema ui 通用渲染、节点对象保存与运行时透传；参数真值与差异主要归插件返回的 schema 和参数对象。
- 用户已补充确认五项具体策略：
  - 选中模型时一并返回参数 schema，宿主直接记录
  - 切换模型后清空旧参数并按新 schema 重建
  - `json_schema` 进入一期，并作为节点级独立能力处理
  - 默认生成 outputs 属于节点级只读运行契约，不在 Inspector 暴露为可编辑输出契约
  - LLM 默认暴露 `text/reasoning_content/usage`；结构化输出变量只在启用结构化输出后通过专门配置产生
  - 不允许插件自定义控件，固定为数字/文本/开关/选择等通用表单控件
  - `provider_code / protocol / label` 只作缓存，后台应用页需要提供刷新按钮更新缓存

## 为什么这样做

- 当前 `LlmModelField` 同时承担模型选择与参数设置，且参数项已经写死在宿主里，这和“插件负责模型差异”的方向不一致。
- 如果继续在宿主内置 canonical 参数集合，会让 provider 差异重新回流到宿主协议与前端组件。

## 为什么要做

- 让 LLM 节点参数真正由 provider / model schema 决定，宿主不再维护一份越来越大的参数白名单。
- 让后续不同模型的 reasoning、tool calling、response format 与私有参数都能通过统一对象透传。
- 尽早把 `json_schema` 纳入一期，避免后续再做第二轮节点结构与运行时返工。

## 截止日期

- 无

## 决策背后动机

- `schema ui` 仍不应直接等同于插件内部 schema，但可以作为通用渲染 contract 接收插件返回的字段描述。
- 参数真值主要放在 provider / model 返回的 schema 与参数对象中，而不是宿主内置固定字段枚举。
- 节点配置结构后续应收敛为“模型供应商对象 + LLM 参数对象”，宿主负责保存、校验基础形状并透传给插件。
- 参数 schema 的刷新时机优先贴近模型选择动作，而不是再拆一条额外接口，降低交互复杂度。
- “是否开启某参数”后续应优先收敛为节点侧的传值规则，而不是插件 schema 额外维护一套启用状态真值。
- `json_schema` 虽然提前进入一期，但仍应作为节点级独立对象处理；它用于约束返回格式，结构化输出变量只在开启结构化输出后由专门路径产生，不回落为通用 `config.output_contract` 编辑。
