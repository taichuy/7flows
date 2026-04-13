# 1Flowse 控制台壳层、认证接入与设置区设计稿

日期：2026-04-13
状态：已完成设计确认，待用户审阅
关联输入：
- [DESIGN.md](../../../../DESIGN.md)
- [web/AGENTS.md](../../../../web/AGENTS.md)
- [.agents/skills/frontend-development/SKILL.md](../../../../.agents/skills/frontend-development/SKILL.md)
- [.agents/skills/frontend-logic-design/SKILL.md](../../../../.agents/skills/frontend-logic-design/SKILL.md)
- [.agents/skills/backend-development/SKILL.md](../../../../.agents/skills/backend-development/SKILL.md)
- [web/app/src/routes/route-config.ts](../../../../web/app/src/routes/route-config.ts)
- [web/app/src/app/router.tsx](../../../../web/app/src/app/router.tsx)
- [api/apps/api-server/src/routes/auth.rs](../../../../api/apps/api-server/src/routes/auth.rs)
- [api/apps/api-server/src/routes/me.rs](../../../../api/apps/api-server/src/routes/me.rs)
- [api/apps/api-server/src/routes/session.rs](../../../../api/apps/api-server/src/routes/session.rs)
- [api/apps/api-server/src/routes/members.rs](../../../../api/apps/api-server/src/routes/members.rs)
- [api/apps/api-server/src/routes/roles.rs](../../../../api/apps/api-server/src/routes/roles.rs)
- [api/apps/api-server/src/routes/permissions.rs](../../../../api/apps/api-server/src/routes/permissions.rs)
- [api/apps/api-server/src/routes/team.rs](../../../../api/apps/api-server/src/routes/team.rs)

## 1. 文档目标

本文档用于冻结 1Flowse 当前控制台前端从 bootstrap 壳层过渡到正式控制台壳层的方案，并把前端与现有认证、会话、成员、角色权限后端接口收口到一套可执行设计。

本轮设计聚焦：

- 顶部壳层与路由真值层重构
- 登录、当前用户、退出登录、个人资料和修改密码接入
- 设置页的信息架构与页面边界
- `embedded-apps` 作为“子系统”页面继续保留
- 补齐后端 `PATCH /api/console/me` 和已登录态下可读取的 `csrf token`

本轮设计不覆盖：

- 样式边界全量收紧
- 路由级拆包与主 bundle 优化
- 多团队空间
- `embedded-runtime` 宿主挂载页和子系统详情页

## 2. 当前现状

### 2.1 当前前端仍保留 bootstrap 语义

已验证现状：

- 顶部标题仍是 `1Flowse Bootstrap`
- 首页仍展示 `Workspace Bootstrap / API Health`
- 顶部导航当前是 `工作台 / 团队 / 前台`
- 路由中仍保留 `agent-flow`、`embedded-runtime`、详情页和挂载页
- 右上角用户区仍是硬编码用户名和演示菜单项

这导致当前前端虽然可运行，但仍像内部演示页，而不是正式控制台。

### 2.2 当前前端没有正式鉴权闭环

已识别事实：

- 前端还没有登录页
- 没有登录态存储
- 没有 `401` 自动跳转
- 没有 `csrf token` 的前端持久化策略
- `web/packages/api-client` 目前只有健康检查 client

如果直接把右上角“用户 / 退出”接后端，而不补这层基础设施，前端会停在半接入状态。

### 2.3 当前后端可复用能力与缺口

当前后端已存在：

- 登录：`POST /api/public/auth/providers/password-local/sign-in`
- 当前用户：`GET /api/console/me`
- 当前设备退出：`DELETE /api/console/session`
- 当前用户改密码：`POST /api/console/me/actions/change-password`
- 用户管理：`GET/POST /api/console/members`、禁用、重置密码、角色替换
- 角色与权限管理：`/api/console/roles`、`/api/console/roles/{id}/permissions`、`/api/console/permissions`
- 团队设置：`GET/PATCH /api/console/team`
- 后端 Swagger：`/docs`

当前后端缺口：

- 没有 `PATCH /api/console/me`
- 没有已登录后重新读取 `csrf token` 的正式接口字段

## 3. 信息架构结论

### 3.1 顶部导航采用稳定的 L2 页面入口

本轮按 `frontend-logic-design` 的 L0/L1/L2/L3 模型收口：

- 顶部导航只放稳定的 L2 页面入口
- 不在顶部放临时演示路由
- 不再让某些入口跳详情页、某些入口停留在占位页，避免深度不一致

调整后的顶部结构：

- 左侧：`工作台 / 子系统 / 工具`
- 右侧：`设置` 独立入口，`用户` 保持为个人动作下拉

结论：

- `设置` 属于明确管理域，使用独立页面承载
- `用户` 属于个人动作集合，保留为下拉
- 不再保留 `agent-flow` 和 `embedded-runtime` 这种当前无正式信息架构归属的入口

### 3.2 一致性矩阵

#### 当前状态

| 入口 | 容器 | 深度层 | 问题 |
| --- | --- | --- | --- |
| 工作台 | 顶部导航 | L2 | 内容仍是 bootstrap 概览 |
| 团队 | 顶部导航 | L2 | 实际指向 `embedded-apps`，文案与语义错位 |
| 前台 | 顶部导航 | L2 | 业务含义不稳定 |
| 用户菜单 | 顶部下拉 | L3 混 L2 | 混入演示菜单项 |
| embedded-runtime | 直接路由 | 孤岛页 | 无上层入口语义 |
| 详情页 | 直接路由 | 孤岛页 | 当前不需要保留 |

#### 修正后

| 入口 | 容器 | 深度层 | 说明 |
| --- | --- | --- | --- |
| 工作台 | 顶部导航 | L2 | 正式首页 |
| 子系统 | 顶部导航 | L2 | 继续复用 `/embedded-apps` |
| 工具 | 顶部导航 | L2 | 正式建设中页 |
| 设置 | 顶部导航 | L2 | 独立设置页，内部再用侧边栏做二级管理 |
| 用户 | 顶部下拉 | L3 动作入口 | 指向个人资料页和退出登录 |

## 4. 路由与页面设计

### 4.1 最终保留的主路由

本轮前端主路由收口为：

- `/`
  - 页面名：工作台
- `/embedded-apps`
  - 页面名：子系统
- `/tools`
  - 页面名：工具
- `/settings`
  - 页面名：设置
- `/me`
  - 页面名：个人资料
- `/sign-in`
  - 页面名：登录

删除的路由：

- `/agent-flow`
- `/embedded/$embeddedAppId`
- `/embedded-apps/$embeddedAppId`

### 4.2 顶部壳层文案

壳层标题统一改为：

- `1Flowse`

首页移除：

- `Workspace Bootstrap`
- `API Health`

右上角菜单移除硬编码演示语义：

- 移除 `Taichu`
- 移除 `Profile / Settings / Sign out` 的演示英文文案

### 4.3 工作台页面

工作台页不再展示 bootstrap 演示卡片。

本轮目标不是补齐业务看板，而是把页面从“内部演示”改为“正式空态控制台首页”。因此首页应至少具备：

- 正式标题与说明
- 已登录用户欢迎信息
- 当前账户角色或身份信息
- 必要的系统状态摘要

健康检查仍保留为首页完全加载后的后台状态探针，但不再以单独 `API Health` 卡片暴露 bootstrap 文案。

### 4.4 子系统页面

`embedded-apps` 页面继续保留，但对外统一命名为“子系统”。

路径保持不变：

- `/embedded-apps`

原因：

- 当前后端和前端已有 `embedded-apps` 边界
- 本轮不扩大 blast radius 去同步修改路径映射
- 用户已明确确认“嵌入系统就是子系统意思”

本轮不再保留详情页和挂载页，因此子系统页是当前唯一正式入口页。

### 4.5 工具页面

工具页本轮保留菜单，但内容采用正式“建设中”页，而不是演示或临时文案。

页面要求：

- 正式标题：`工具`
- 一段正式说明，明确该区域会承载后续工具能力
- 不出现调试、bootstrap 或其他演示性质文案

### 4.6 设置页面

设置页作为独立主页面，结构固定为：

- 左侧：设置导航 sidebar
- 右侧：对应设置内容

本轮设置页包含三个分区：

- `API 文档`
- `用户管理`
- `权限管理`

不单独做团队设置页，当前团队空间只有一个，团队相关配置本轮不进入设置导航。

### 4.7 设置页内部结构

#### API 文档

`API 文档` 分区直接在设置页右侧内容区内嵌后端 `/docs`，采用 `iframe`。

原因：

- 符合“左边侧边栏，右边对应设置内容”的页面结构
- 不再额外复制一套文档前端
- 保持控制台内一致的导航体验

#### 用户管理

`用户管理` 分区使用独立管理面板展示：

- 用户列表
- 新增用户
- 禁用用户
- 重置密码
- 替换角色

这些能力直接消费现有 `/api/console/members` 系列接口。

#### 权限管理

页面标题对外统一叫：

- `权限管理`

页面内部结构采用：

- 左侧或上部角色列表
- 右侧角色权限绑定

实际对应后端能力是：

- 角色列表与角色 CRUD
- 当前角色权限查看
- 当前角色权限替换
- 权限目录查询

也就是说，对外文案叫“权限管理”，内部实现语义仍是“角色列表 / 权限绑定”。

### 4.8 个人资料页

个人资料页统一放在：

- `/me`

页面内部固定为两个区块：

- `基本资料`
- `安全设置`

#### 基本资料

允许当前用户编辑的字段：

- `name`
- `nickname`
- `email`
- `phone`
- `avatar_url`
- `introduction`

不允许当前用户自行编辑的字段：

- `account`
- 角色
- 权限
- 状态

#### 安全设置

本轮安全设置仅包含：

- 修改密码

“退出全部设备”不作为单独用户动作暴露。根据已确认约束，会话全失效只由以下情况触发：

- 用户自己改密码
- 管理员重置密码

### 4.9 用户下拉菜单

右上角 `用户` 下拉只保留个人动作：

- `个人资料`
- `退出登录`

不在这里放：

- `设置`
- `用户管理`
- `权限管理`
- `退出全部设备`

原因：

- 这些都属于管理域，应该进入 `设置`
- 个人动作和系统管理动作不混放

## 5. 认证与会话设计

### 5.1 登录页

本轮新增正式登录页：

- `/sign-in`

登录页职责：

- 录入账号和密码
- 调用 `POST /api/public/auth/providers/password-local/sign-in`
- 获取 `HttpOnly Cookie`
- 保存登录响应中的 `csrf token`
- 登录成功后跳转到 `/`

### 5.2 会话恢复

前端应用启动时，先通过已登录态接口恢复会话，而不是盲猜本地状态。

推荐流程：

1. 应用启动
2. 请求 `GET /api/console/session`
3. 若返回 `200`，恢复当前 actor、`csrf token` 和基本登录态
4. 若返回 `401`，跳转 `/sign-in`

### 5.3 CSRF 设计

本轮不新增独立 `csrf` 路由，直接扩展现有：

- `GET /api/console/session`

返回字段，补充：

- `csrf_token`

这样登录后和刷新后都可通过同一会话接口恢复写操作所需 token。

### 5.4 退出登录

右上角“退出登录”调用：

- `DELETE /api/console/session`

约束：

- 必须带 `x-csrf-token`
- 成功后清理前端登录态缓存
- 跳转 `/sign-in`

### 5.5 未登录与未授权

前端统一约束：

- 接口返回 `401`：视为未登录，清理登录态并跳 `/sign-in`
- 接口返回 `403`：保留当前登录态，在页面内展示“无权限”

## 6. 后端增量接口设计

### 6.1 扩展 `GET /api/console/session`

现有返回体中增加：

- `csrf_token`

推荐返回结构：

```json
{
  "data": {
    "actor": {
      "id": "uuid",
      "account": "root",
      "effective_display_role": "root"
    },
    "csrf_token": "..."
  },
  "meta": null
}
```

目的：

- 前端刷新后恢复写操作 token
- 避免额外新增一个只拿 token 的接口

### 6.2 新增 `PATCH /api/console/me`

新增接口：

- `PATCH /api/console/me`

请求体：

```json
{
  "name": "string",
  "nickname": "string",
  "email": "string",
  "phone": "string | null",
  "avatar_url": "string | null",
  "introduction": "string"
}
```

返回：

- `200`
- body 仍返回 `ApiSuccess<MeResponse>`

约束：

- 必须登录
- 必须通过 `x-csrf-token`
- 只允许修改当前用户自己的资料字段
- 不允许通过该接口修改 `account`、角色、权限或状态

### 6.3 个人资料更新的后端边界

推荐新增一个 profile/update 的正式写入口，由控制面服务统一收口，而不是在 route 层直接更新用户表。

边界原则：

- route 层只做 HTTP 参数解析和响应映射
- profile service 负责校验和更新
- repository 只做持久化

## 7. 前端数据流设计

### 7.1 新增认证状态层

前端新增一层轻量认证状态，至少维护：

- `sessionStatus`
- `csrfToken`
- `actor summary`
- `me profile`

状态来源：

- 登录成功响应
- `GET /api/console/session`
- `GET /api/console/me`

### 7.2 API client 分层

`web/packages/api-client` 从只承载健康检查，扩展为正式控制台请求 client：

- 登录
- 当前会话
- 当前用户
- 更新个人资料
- 修改密码
- 退出登录
- 用户管理
- 角色与权限管理

但页面不直接调用 transport。各页面仍通过 `features/*/api` 消费。

### 7.3 权限显隐

前端权限显隐来源统一以：

- `GET /api/console/me` 返回的 `permissions`

为单一事实源。

本轮至少用于：

- 设置页 sidebar 项显示/隐藏
- 用户管理页动作显隐
- 权限管理页动作显隐

## 8. 组件与目录边界

### 8.1 壳层与路由真值层

本轮应继续强化以下边界：

- `app-shell/` 负责顶部壳层、用户菜单、壳层样式
- `routes/` 负责 `route id / path / selected state / permission key / guard`
- `features/*` 负责各页面容器与各自 API 消费

### 8.2 新增 feature 归属

新增或重组后的 feature 建议为：

- `features/home`
- `features/embedded-apps`
- `features/tools`
- `features/settings`
- `features/me`
- `features/auth`

### 8.3 删除的前端落点

本轮应删除或下线：

- `features/agent-flow`
- `features/embedded-runtime`
- 子系统详情页组件
- 挂载页相关 style-boundary 场景

## 9. 错误处理

### 9.1 登录错误

登录失败时：

- 保持在 `/sign-in`
- 表单内展示后端错误
- 不进入顶部壳层

### 9.2 个人资料更新错误

更新基本资料失败时：

- 保留当前表单内容
- 显示字段级或表单级错误
- 不静默回滚为旧值

### 9.3 管理页权限错误

当用户没有管理权限时：

- `设置` 页面仍可进入
- 无权限的 sidebar 项隐藏
- 若直接命中无权限内容，页面内展示正式无权限状态

## 10. 测试与验证

前端至少补以下验证：

- 路由真值层测试
- 顶部导航与选中态测试
- 登录页成功/失败测试
- 会话恢复与 `401` 跳转测试
- 用户下拉菜单动作测试
- `/me` 页资料查看、编辑、改密测试
- 设置页 sidebar 切换测试
- 用户管理、权限管理页面基础加载测试
- 删除路由后的回归测试
- `style-boundary` 场景更新与运行时回归

后端至少补以下验证：

- `PATCH /api/console/me` 成功与字段约束测试
- `GET /api/console/session` 返回 `csrf_token`
- 前端使用该字段后，`DELETE /api/console/session`、`PATCH /api/console/me`、`POST /api/console/me/actions/change-password` 能正常通过 `csrf` 校验

统一验证门禁：

- `pnpm --dir web lint`
- `pnpm --dir web test -- --testTimeout=15000`
- `pnpm --dir web/app build`
- `node scripts/node/check-style-boundary.js all-pages`
- 后端对应路由测试与统一验证脚本

## 11. 设计结论

本轮不再把当前前端当作 bootstrap 演示壳层继续累积，而是正式切到“可登录、可恢复会话、可管理用户与权限”的控制台壳层。

最终结论如下：

- 顶部壳层收口为 `工作台 / 子系统 / 工具 / 设置 / 用户`
- `设置` 是独立 L2 页面，不混在右上角个人菜单里
- `用户` 下拉只保留个人资料和退出登录
- `embedded-runtime`、子系统详情页和挂载页全部移除
- 个人资料页统一承载资料编辑和密码修改
- 后端补 `PATCH /api/console/me`
- 后端在 `GET /api/console/session` 中补 `csrf_token`
- 前端登录态、`csrf`、`401/403` 行为本轮一并正式接入
