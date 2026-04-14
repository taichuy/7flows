---
memory_type: tool
topic: bash -lc 中嵌套 curl JSON 时错误转义会把请求体打坏
summary: 在 `bash -lc` 字符串里再拼 `curl --data '{\"...\"}'` 时，如果单双引号层级写错，后端会收到非法 JSON 并报 `Failed to parse the request body as JSON`；已验证应让最外层使用一套稳定引号并显式转义 JSON 内部双引号。
keywords:
  - bash
  - curl
  - json
  - quoting
  - request body
match_when:
  - 在 `bash -lc` 里拼接 `curl --data` JSON 请求
  - 后端报 `Failed to parse the request body as JSON`
  - 看起来像接口 400/401，但实际是 shell 转义问题
created_at: 2026-04-14 09
updated_at: 2026-04-14 09
last_verified_at: 2026-04-14 09
decision_policy: reference_on_failure
scope:
  - bash
  - curl
---

# bash -lc 中嵌套 curl JSON 时错误转义会把请求体打坏

## 时间

`2026-04-14 09`

## 失败现象

- 想在一条 `bash -lc` 命令里完成“登录并带 cookie 访问 session”。
- 第一次执行时，后端返回：

```text
Failed to parse the request body as JSON: expected value at line 1 column 1
```

## 为什么当时要这么做

- 需要快速验证 `root / change-me` 登录成功后，`/api/console/session` 是否也能拿到会话数据。

## 为什么失败

- 最外层 shell 字符串和 `curl --data` 内层 JSON 的引号层级处理错了。
- 结果是 shell 先把 JSON 片段拆坏，`curl` 发出的请求体已经不是合法 JSON。

## 已验证解法

- 保持最外层 `bash -lc` 使用双引号，并对 JSON 内部双引号做显式转义，例如：

```bash
bash -lc "curl -s -X POST http://127.0.0.1:7800/api/public/auth/providers/password-local/sign-in -H 'content-type: application/json' --data '{\\\"identifier\\\":\\\"root\\\",\\\"password\\\":\\\"change-me\\\"}'"
```

## 后续避免建议

- 只要是 `bash -lc` 里嵌套 JSON，请先确认“shell 字符串”和“JSON 字符串”各自的引号边界。
- 一旦接口返回“请求体不是合法 JSON”，先检查 shell 转义，不要先怀疑业务鉴权。
