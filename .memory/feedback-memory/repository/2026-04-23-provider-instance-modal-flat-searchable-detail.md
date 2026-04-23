---
memory_type: feedback
feedback_category: repository
topic: provider 实例弹窗展开区应保持扁平详情并优先使用可检索摘要控件
summary: 在 provider 实例弹窗这类折叠详情里，展开区应保持扁平化，不再嵌套卡片或多余分割线；像候选缓存这类只读摘要值，优先使用默认显示当前摘要、支持输入检索的轻量下拉展示，而不是标签墙或可编辑表单。
keywords:
  - frontend
  - settings
  - provider modal
  - collapse detail
  - flat layout
  - searchable select
  - summary display
match_when:
  - 调整 provider 实例弹窗或类似折叠详情区的前端展示
  - 需要决定候选缓存、摘要值、多值列表该用标签墙还是下拉展示
  - 用户连续基于截图要求去卡片感、去分割线、改成更轻的展示控件
created_at: 2026-04-23 08
updated_at: 2026-04-23 08
last_verified_at: 2026-04-23 08
decision_policy: direct_reference
scope:
  - web/app/src/features/settings/components/model-providers
  - web/app/src/features/settings/_tests/model-providers-page.test.tsx
  - .agents/skills/frontend-development
  - web/AGENTS.md
---

# provider 实例弹窗展开区应保持扁平详情并优先使用可检索摘要控件

## 时间

`2026-04-23 08`

## 规则

- 在 provider 实例弹窗这类折叠详情区，展开内容应保持扁平，不再额外嵌套白底卡片、卡片 footer 或字段间横向分割线。
- 信息层级优先通过折叠本身、字段标签、留白和少量区隔来组织，不要把“折叠里再套一层面板”做重。
- 像候选缓存这类只读、多值、主要用于浏览和快速定位的摘要字段，优先使用轻量下拉展示。
- 下拉默认显示第一个缓存值，支持输入检索，但不承担保存或修改数据语义。
- 这类前端微调应沿现有组件做最小改动，按截图快速连续迭代，并只跑目标测试做回归。

## 原因

- 这次连续微调里，用户明确在压“卡片感”，希望详情区看起来像折叠内容本体，而不是展开后又出现第二层容器。
- 候选缓存本质是摘要浏览，不是批量编辑；标签墙在值很多时会把视觉重量抬高，也不利于快速定位。
- 可检索下拉既保留了“只读摘要”的轻量感，又能在长列表里快速查找，比标签堆叠更稳。
- 对这类细节调整，沿现有结构做最小替换、只跑目标测试，能更快让用户看效果并继续打断修正。

## 适用场景

- 设置页、管理台、详情弹窗中的折叠详情区扁平化改造。
- 多值摘要字段需要从标签墙、chip 列表改成更轻的浏览控件。
- 用户以截图为主连续给出前端微调意见，希望快速来回迭代。
