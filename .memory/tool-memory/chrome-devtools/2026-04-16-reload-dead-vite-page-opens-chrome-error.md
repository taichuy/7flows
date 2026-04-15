---
memory_type: tool
topic: 对已断开的本地 Vite 页面执行 chrome-devtools reload 会落到 chrome-error
summary: 当 `127.0.0.1:3100` 本地 Vite 服务已停止时，`chrome-devtools.navigate_page(type=reload)` 会把现有页切到 `chrome-error://chromewebdata/`；应先确认端口在监听，再决定 reload 还是先起 dev server。
keywords:
  - chrome-devtools
  - vite
  - reload
  - chrome-error
  - 3100
match_when:
  - 本地页面原本指向 `127.0.0.1:3100`
  - reload 后页面变成 `chrome-error://chromewebdata/`
  - 新开页面报 `ERR_CONNECTION_REFUSED`
created_at: 2026-04-16 00
updated_at: 2026-04-16 00
last_verified_at: 2026-04-16 00
decision_policy: reference_on_failure
scope:
  - chrome-devtools
  - vite
  - web/app
---

# 时间

`2026-04-16 00`

## 失败现象

对一个原本打开 `http://127.0.0.1:3100/...` 的页面执行 `reload` 后，标签页直接跳成 `chrome-error://chromewebdata/`；随后新开同地址页面报 `net::ERR_CONNECTION_REFUSED`。

## 触发条件

- 本地 Vite dev server 已经退出或未启动
- 仍对旧的 dev 页面执行 `chrome-devtools.navigate_page(type=reload)`

## 根因

`chrome-devtools` 只会按当前页地址重载，不会帮忙恢复本地服务。服务端口已断开时，reload 只能进入 Chrome 自身的错误页。

## 解法

- 在 reload 本地 Vite 页面前，先确认端口仍在监听
- 如果已断开，先启动 `pnpm --dir web/app dev --host 127.0.0.1 --port 3100`
- 如果只是要看源码级修复，不要把错误页当成前端回归结论

## 验证方式

- 先对失活的 3100 页面执行 reload，观察是否落到 `chrome-error://chromewebdata/`
- 再新开同地址页面，确认是否出现 `ERR_CONNECTION_REFUSED`
- 启动 Vite 后重新访问，确认页面可恢复

## 复现记录

- `2026-04-16 00`：排查编排页 edge reconnect 时，先对旧的 3100 页面执行 reload，页面直接进入 `chrome-error://chromewebdata/`；随后新开同地址页面返回 `ERR_CONNECTION_REFUSED`，启动本地 Vite 后访问恢复。
