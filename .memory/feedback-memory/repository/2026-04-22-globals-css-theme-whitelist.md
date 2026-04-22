---
memory_type: feedback
feedback_category: repository
topic: globals.css 中当前 Ant Design 全局覆写属于主题白名单
summary: 用户在 `2026-04-22 15` 明确确认，`web/app/src/styles/globals.css` 里当前这组 Ant Design 全局覆写按主题级白名单处理；只要组件或页面仍可在局部修正，不要默认把它们当成需要强检测或优先清理的高风险覆盖。
keywords:
  - globals.css
  - frontend
  - theme
  - whitelist
  - antd
  - style override
match_when:
  - 需要评估 `web/app/src/styles/globals.css` 中当前全局样式是否必须整改
  - 需要判断当前这组 Ant Design 全局覆写是否应按高风险覆盖处理
  - 需要解释前端主题级白名单和强样式检测边界
created_at: 2026-04-22 15
updated_at: 2026-04-22 15
last_verified_at: 2026-04-22 15
decision_policy: direct_reference
scope:
  - web/app/src/styles/globals.css
  - web/app/src/styles
  - .agents/skills/qa-evaluation
---

# 规则

`web/app/src/styles/globals.css` 里当前这组 Ant Design 全局覆写按主题级白名单处理，不默认作为“必须清理的强覆盖风险”进入修复范围。

## 时间

`2026-04-22 15`

## 规则

- 当前 `globals.css` 中的这组全局 Ant Design 覆写属于允许的主题级默认值。
- 只要页面和组件仍可通过局部 wrapper、组件样式或最近 owner 正常修正，就不要默认要求移除这组全局规则。
- 后续评估时，不要把它们直接当成高优先级样式问题；只有出现真实页面误伤、无法局部修正，或继续扩大为更重的布局级全局覆盖时，才升级处理。

## 原因

- 用户已确认当前页面没有明显问题，并接受这组规则作为主题统一的一部分存在。
- 当前覆写主要用于统一视觉默认值，不应在没有真实损害证据时被当成优先整改项。
- 过早把这组规则按高风险处理，会制造不必要的前端治理噪声。

## 适用场景

- 审查 `web/app/src/styles/globals.css` 的当前全局覆写
- 讨论前端主题统一、全局样式白名单或样式治理优先级
- 判断是否需要把当前这组规则纳入强检测、强整改或高优先级重构
