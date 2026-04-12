# RustFS 启动修复

## 时间

`2026-04-12 16`

## 谁在做什么

- 用户反馈 `docker-rustfs-1` 无法启动。
- AI 排查 Docker 中间件并修复 RustFS 启动配置与本地权限问题。

## 为什么这样做

- RustFS 容器持续重启，阻塞本地对象存储中间件可用性。
- 当前仓库需要一个稳定的本地开发对象存储基础环境。

## 为什么要做

- 后续后端对象存储适配和本地联调依赖 RustFS。
- 如果不收敛根因，`dev-up` 或手动 compose 都会反复踩坑。

## 截止日期

- 未指定

## 决策背后动机

- 本次根因有两部分：
  - 绑定目录 `docker/volumes/rustfs/{data,logs}` 权限过紧，RustFS 非 root 进程无法写入。
  - `rustfs` 镜像实际使用 `/logs`，因此 compose 日志挂载路径改为 `/logs`。
- 用户在 `2026-04-12 16` 明确要求本地 `docker/` 整体应由普通用户可操作，本机当前已修正为 `taichu` 拥有。
- 统一开发脚本会在启动 Docker 中间件前自动修正 RustFS 绑定目录权限。
- 运行产物目录 `docker/volumes/` 应忽略版本控制。

## 关联文档

- `docker/docker-compose.middleware.yaml`
- `docker/README.md`
- `scripts/node/dev-up/core.js`
