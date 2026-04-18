---
memory_type: tool
topic: shell 直接按旧路径读取前端文件会误判失败
summary: 在 `1flowbase` 里直接按旧印象读取 `web/app/src/App.tsx`、`web/app/src/app-shell/ConsoleShell.tsx`、`web/app/vitest.config.ts`、`web/app/test/setup.ts` 或 `web/packages/api-client/vitest.config.ts` 会失败；应先用 `rg --files` 或 `find` 校验真实路径，再执行 `sed/cat`。
keywords:
  - shell
  - sed
  - path
  - rg
  - web
match_when:
  - 需要直接读取前端文件，但目录层级刚发生调整
  - 准备对 `web/app` 或 `web/packages` 下文件执行 `sed -n`
created_at: 2026-04-14 08
updated_at: 2026-04-18 08
last_verified_at: 2026-04-18 08
decision_policy: reference_on_failure
scope:
  - shell
  - web/app
  - web/packages/api-client
---

# shell 直接按旧路径读取前端文件会误判失败

## 时间

`2026-04-14 08`

## 失败现象

- 试图读取 `web/app/src/App.tsx`、`web/app/src/app-shell/ConsoleShell.tsx`、`web/app/vitest.config.ts`、`web/app/test/setup.ts`、`web/packages/api-client/vitest.config.ts` 时命令直接报文件不存在。

## 触发条件

- 为了快速确认当前实现或测试配置，直接凭路径印象执行 `sed -n`。

## 根因

- 当前仓库的真实路径分别是 `web/app/src/app/App.tsx`、`web/app/src/app-shell/AppShellFrame.tsx`、`web/app/vite.config.ts` 与 `web/app/src/test/setup.ts`，而 `web/packages/api-client` 没有单独的 vite/vitest 配置文件。
- 前端目录在此前迁移过 `app/` 分层，旧路径假设已经失效。

## 解法

- 在第一次读取该区域文件前，先执行 `rg --files web/app web/packages/api-client | rg 'App\\.tsx|vite\\.config|vitest'` 或 `find` 做路径确认。
- 只有在确认存在后再使用 `sed -n`、`cat`、`nl`。

## 验证方式

- 使用 `sed -n` 读取真实路径 `web/app/src/app/App.tsx`、`web/app/vite.config.ts` 成功。

## 复现记录

- `2026-04-14 08`：为了快速查看 app 入口和测试配置，直接按旧目录结构读取文件，失败后通过 `rg --files` 确认了真实路径并恢复后续操作。
- `2026-04-14 19`：为了对照控制台壳层设计稿，直接读取旧文件名 `web/app/src/app-shell/ConsoleShell.tsx` 失败；随后改用 `rg --files web/app/src/app-shell` 确认当前已经拆成 `AppShellFrame.tsx`、`Navigation.tsx`、`AccountMenu.tsx`。
- `2026-04-14 18`：为了快速读取设置页和个人资料页的 section 定义，直接按 `.ts` 后缀猜测 `web/app/src/features/settings/lib/settings-sections.ts` 与 `web/app/src/features/me/lib/me-sections.ts`，命令报“没有那个文件或目录”；随后改用 `rg --files web/app/src/features/settings web/app/src/features/me | rg 'settings-sections|me-sections'`，确认真实文件为 `.tsx` 后恢复读取。
- `2026-04-15 08`：为了横向读取模块文档，直接按旧路径 `docs/superpowers/specs/1flowbase/modules/01-user-login-and-team-access/README.md` 执行 `sed -n`，命令报“没有那个文件或目录”；随后先用 `find docs/superpowers/specs/1flowbase/modules -maxdepth 2 -name README.md` 校验真实目录，确认模块已改名为 `01-user-auth-and-team`。
- `2026-04-17 08`：为了查看 Vitest setup，直接按习惯读取 `web/app/test/setup.ts`，命令报“没有那个文件或目录”；随后改用 `rg -n 'ResizeObserver' web/app/src web/app -S` 与 `sed -n web/app/src/test/setup.ts`，确认真实路径在 `web/app/src/test/setup.ts`。
- `2026-04-18 08`：为了快速读取设置页和应用 section 定义，直接按 `.ts` 后缀猜测 `web/app/src/features/settings/lib/settings-sections.ts` 与 `web/app/src/features/applications/lib/application-sections.ts`，命令报“没有那个文件或目录”；随后先用 `find web/app/src/features/settings web/app/src/features/applications -maxdepth 3 -type f | sort` 校验真实文件，确认两者实际为 `.tsx` 后恢复读取。
