---
memory_type: project
topic: 设置区 API 文档方向确认为权限化按接口按需文档
summary: 用户于 `2026-04-14` 明确确认设置区 `API 文档` 保留在后台设置二级导航内，但实现方向改为前端接管、后端继续注册 canonical OpenAPI、前端先拿目录再按接口按需加载详情，并新增独立文档权限。
keywords:
  - settings
  - api docs
  - scalar
  - openapi
  - catalog
  - operation spec
match_when:
  - 需要继续设计或实现设置区 API 文档
  - 需要判断文档是否仍应使用 iframe 或 Swagger UI
  - 需要决定是按领域大 spec 分片还是按接口按需加载
created_at: 2026-04-14 00
updated_at: 2026-04-14 00
last_verified_at: 2026-04-14 00
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-04-14-settings-api-docs-on-demand-design.md
  - web/app/src/features/settings
  - api/apps/api-server/src/openapi.rs
  - api/apps/api-server/src/lib.rs
---

# 设置区 API 文档方向确认为权限化按接口按需文档

## 时间

`2026-04-14 00`

## 谁在做什么

- 用户确认 `API 文档` 继续保留在设置区二级导航，不迁到工具区或独立一级导航。
- AI 负责把文档体验从后端 Swagger iframe 改为前端接管，并把加载策略改为“目录 + 单接口小文档”的按需模式。

## 为什么这样做

- 用户明确指出“按领域拆几个大 spec”只能缓解，不会真正解决未来接口总量持续增长后的臃肿问题。
- 当前平台接口来自后端 `utoipa` 注册，因此更合理的方案是以后端 canonical OpenAPI 为真值，向前端派生轻量目录和单接口闭合小文档，而不是让前端维护一份静态目录。

## 为什么要做

- 当前 `/settings/docs` 只是 `iframe` 到后端 `/docs`，既没有独立权限，也没有按需加载能力。
- 用户希望后续平台接口继续增长时，前端仍然只在点击接口时才拉取详情，并保留 URL 关键字搜索的使用习惯。

## 决策背后动机

- 文档入口属于后台管理域，因此继续放在设置区是合理的。
- 真正需要优化的是文档数据链路，而不是只换渲染器皮肤。
- 动态建模的字段级文档暂不纳入本轮，先把平台接口级按需文档做好，后续再沿用同一注册链路扩展。

## 关联文档

- `docs/superpowers/specs/1flowbase/2026-04-14-settings-api-docs-on-demand-design.md`
- `docs/superpowers/specs/1flowbase/2026-04-13-console-shell-auth-settings-design.md`
