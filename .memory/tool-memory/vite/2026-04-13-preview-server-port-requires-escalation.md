---
memory_type: tool
topic: vite preview 监听 3200 端口在当前沙箱内会报 EPERM
summary: 在当前环境中从 `tmp/demo` 启动 `vite preview` 监听 `127.0.0.1:3200` 或 `0.0.0.0:3200` 时，沙箱内会报 `listen EPERM`；提权后可正常启动。
keywords:
  - vite
  - preview
  - EPERM
  - port 3200
match_when:
  - 需要在本仓库内启动 `vite preview`
  - 监听 `3200` 端口时报 `operation not permitted` 或 `listen EPERM`
created_at: 2026-04-13 01
updated_at: 2026-04-13 01
last_verified_at: 2026-04-13 01
decision_policy: reference_on_failure
scope:
  - vite
  - tmp/demo
  - 3200
---

# vite preview 监听 3200 端口在当前沙箱内会报 EPERM

## 时间

`2026-04-13 01`

## 失败现象

执行：

```bash
vite preview --host 127.0.0.1 --port 3200 --strictPort
```

或：

```bash
vite preview --host 0.0.0.0 --port 3200 --strictPort
```

报：

```text
listen EPERM: operation not permitted
```

## 触发条件

- 在当前 Codex 沙箱内监听本地端口
- 目标命令为 `vite preview`

## 根因

当前沙箱不允许该命令直接绑定本地监听端口。

## 解法

- 使用提权执行 `vite preview`
- 监听地址使用 `127.0.0.1:3200` 即可满足本地 Playwright 验证

## 验证方式

- 提权后命令成功输出 `Local: http://127.0.0.1:3200/`

## 复现记录

- `2026-04-13 01`：在 `tmp/demo` 里启动预览服务失败，提权后成功启动并用于 Playwright 截图。
