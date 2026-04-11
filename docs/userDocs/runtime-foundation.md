# 运行历史摘要

- 2026-04-10 11:56-23:55 CST：P1 收敛为工作流/运行时/发布优先；前端锁定 `React + Vite + TanStack Router + Ant Design + TanStack Query + Zustand`，后端锁定 `Rust 模块化单体 api-server + 独立 plugin-runner`，控制台鉴权为 `Session + HttpOnly Cookie + CSRF`，插件宿主通信为内部 `RPC/HTTP + 固定服务密钥`。
- 2026-04-11 00:01-06:55 CST：统一口径已回写设计文档，并产出 `fullstack-bootstrap` 设计稿与实施计划。
- 2026-04-11 06:33-07:51 CST：完成首轮全栈骨架初始化；前端收敛到 `web/`，后端收敛到 `api/`；`web/app + web/packages/*` 可跑，`api/apps/* + api/crates/*` 可编译；已验证 `web` 与 `api` 的 lint/test/build/check`。
- 2026-04-11 08:26 CST：复核 `docs/dev_READEME.md` 与 `docs/superpowers/specs/1flowse`，结论为无实质冲突，specs 已吸收其核心口径。
- 2026-04-11 08:26 CST：讨论 `Embedded App` 方向，当前收敛为“路由 + 登录态复用 + 上传静态 build zip”；`/home/taichu/git/otherCode/MyBricksCode.zip` 判定为源码片段包，不能直接挂载。
- 2026-04-11 08:26 CST：`Embedded App` 目录规划已确认，并写入独立设计稿；P1 主线固定为静态产物上传、平台挂载路由、复用登录态。
- 2026-04-11 08:26 CST：`docs/dev_READEME.md` 与 `2026-04-10-p1-architecture.md` 已同步对齐到 `Embedded App` 静态产物上传方案。
- 2026-04-11 09:28 CST：`web` 前端已完成最小增量骨架初始化，新增 Embedded App 占位页、占位路由、`embed-sdk` 最小壳与 `embedded-contracts` 包。

# 下一步计划

- 在 `web/app` 继续把 `Embedded App` 从占位路由推进到真实上传与宿主页。
- 在 `api/crates/*` 逐步填充鉴权、运行时与发布链路实现。
- 视需要再补 `Embedded App` 导航入口、上传流程与静态资源回退规则。
