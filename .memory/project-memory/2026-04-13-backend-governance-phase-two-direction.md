---
memory_type: project
topic: 第二阶段后端优先做治理收口并预留插件化多空间多租户扩展
summary: 用户明确第二阶段优先选择后端稳定化治理路线，而不是继续扩功能或提前做重抽象；scope 收敛为 system 与 workspace 两层，session 持有当前 workspace；tenant 能力在表结构上长期预留，但接口与功能只在多租户插件开启后开放。
keywords:
  - backend
  - governance
  - scope
  - workspace
  - tenant
  - plugin
  - system
  - current-workspace
  - hidden-default-tenant
match_when:
  - 需要讨论第二阶段后端架构与约定
  - 需要决定 scope 模型、租户预留和插件扩展边界
  - 需要收敛 api 目录本地 AGENTS 规则
created_at: 2026-04-13 21
updated_at: 2026-04-13 21
last_verified_at: 2026-04-13 21
decision_policy: verify_before_decision
scope:
  - api
  - docs/superpowers/specs/1flowse/2026-04-12-backend-interface-kernel-design.md
  - docs/superpowers/specs/1flowse/2026-04-12-backend-engineering-quality-design.md
  - AGENTS.md
---

# 第二阶段后端优先做治理收口并预留插件化多空间多租户扩展

## 时间

`2026-04-13 21`

## 谁在做什么

用户已明确第二阶段后端路线选择“稳定化优先”，当前重点不是继续扩新功能，而是把现有三平面、分层、scope、审计和 runtime 一致性等约定真正收口到实现边界。

## 为什么这样做

第一阶段已经完成主骨架与首轮实现，但当前实现里仍有 scope 推断、审计不完整、bootstrap 逻辑混入请求链、runtime registry 一致性未正式定义等问题；如果继续扩大功能面，后续返工成本会快速上升。

## 这轮已确认的方向

1. 默认产品形态仍是单团队空间。
2. `root/system` 与默认 workspace 严格分离；`root` 作为 system 级身份存在，不与第一个业务 workspace 混用。
3. 当前 scope 不再保留 `app` 层，正式范围收敛为 `system + workspace(team)`，未来如启用多租户，则在其外层增加可选 `tenant`。
4. 多空间能力不默认开启，需要通过插件解锁，并由 system/root 管理多个 workspace。
5. 多租户能力也不默认开启，需要通过插件解锁；在未开启前，不能让 repository 用“第一条 team”之类的隐式推断代替正式 scope 传递。
6. 用户身份全局唯一：`root` 默认固定主身份，其他用户主键统一使用 `Uuid`。
7. 系统插件只允许 host 安装；tenant/workspace 后续最多允许配置或绑定，不允许直接安装宿主插件。
8. session 登录后必须持有一个“当前 workspace”，语义类似当前角色；用户可拥有多个 workspace，但请求上下文里只有一个当前 workspace。
9. runtime registry 不需要复杂版本体系；用户接受更直接的失效/自愈策略：如果建表或加字段失败，或检测到数据库中物理对象缺失，则把对应模型/字段元数据标记为不可用或清理掉，并刷新缓存。
10. `api/AGENTS.md` 只保留稳定、高频、不过时的本地硬规则与模板；像“当前代码事实”“当前阶段 scope 现状”这类会随着实现收口消失的内容，不要强行写进 AGENTS。
11. 多租户开启后，workspace 可以要求隶属于 tenant；用户接受“表结构上始终存在 tenant”，但在多租户插件未开启前，不开放 tenant 相关接口与产品功能。

## 后续使用约束

后续凡是讨论或实现后端 scope、runtime registry、一致性、插件边界、workspace/tenant 扩展时，都应默认以“system 与 workspace 分离、单 workspace 默认、tenant 表结构长期存在但接口默认关闭、插件开启扩展、session 持有当前 workspace、显式 scope 传递”为基础假设，不应再把“第一空间兼任全局 root 空间”或“repository 自行猜当前空间”当成默认前提，除非用户再次明确改口。
