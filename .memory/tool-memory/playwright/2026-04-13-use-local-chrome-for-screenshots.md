---
memory_type: tool
topic: Playwright 默认浏览器缺失时应改用本机 Chrome 通道截图
summary: 当前环境下 `playwright screenshot` 默认会找缺失的 Playwright 内置浏览器；改用 `--browser chromium --channel chrome` 并提权后可正常截图。若不提权，系统 Chrome 也可能因 `setsockopt: Operation not permitted` 提前退出；移动端应优先用 `Pixel 5` 这类 Chromium 设备模拟。
keywords:
  - playwright
  - screenshot
  - chrome
  - browser missing
  - pixel 5
match_when:
  - 使用 `playwright screenshot` 报浏览器不存在
  - 需要在当前机器上做本地页面截图
  - 需要验证移动端布局
created_at: 2026-04-13 01
updated_at: 2026-04-13 02
last_verified_at: 2026-04-13 02
decision_policy: reference_on_failure
scope:
  - playwright
  - screenshot
  - /home/taichu/git/AionUi/node_modules/.bin/playwright
---

# Playwright 默认浏览器缺失时应改用本机 Chrome 通道截图

## 时间

`2026-04-13 01`

## 失败现象

直接执行 `playwright screenshot` 会报：

```text
Executable doesn't exist at ~/.cache/ms-playwright/...
Looks like Playwright was just installed or updated.
```

即使本机有 `google-chrome`，默认命令仍优先尝试 Playwright 自带浏览器。

在未提权的沙箱里，即使显式指定 `--browser chromium --channel chrome`，也可能继续报：

```text
Target page, context or browser has been closed
...
setsockopt: Operation not permitted
```

## 触发条件

- 机器上没有对应版本的 Playwright 内置浏览器
- 直接使用 `playwright screenshot` 默认参数

## 根因

Playwright CLI 默认优先使用自己缓存的浏览器版本，而不是系统安装的 Chrome。

## 解法

- 运行截图命令时显式指定：

```bash
playwright screenshot --browser chromium --channel chrome ...
```

- 当前环境里浏览器启动仍需要提权
- 验证移动端布局时，优先用 `--device 'Pixel 5'`
  - 直接只缩小桌面浏览器视口，容易看到桌面语义干扰
  - `iPhone 13` 在当前命令链路下会走 `webkit`，不适合与 `chrome` 通道混用

## 验证方式

- `desktop.png` 成功生成
- `mobile-pixel5.png` 成功生成，且用于验证真实移动端顺序

## 复现记录

- `2026-04-13 01`：`tmp/demo` 截图时默认浏览器缺失，改用本机 Chrome 通道并提权后完成桌面与移动端截图。
- `2026-04-13 02`：`tmp/demo` 新一轮验证时，移动端 `Pixel 5` 截图在提权下继续成功；桌面截图若不提权会因 `setsockopt: Operation not permitted` 导致 Chrome 进程提前退出，因此仍应优先走提权截图链路。
