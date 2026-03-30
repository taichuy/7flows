---
name: browser-automation
description: 用于用浏览器自动化完成本地页面复核、登录/点击/表单填写、DOM 文本检查、截图或 PDF 留证，以及最小 smoke 验证。适用于用户要求“操作浏览器”“打开页面点一点”“生成截图”“复看前端真实行为”“用 Playwright 跑一段页面流程”这类任务；在 7Flows 当前本地开发里默认优先 Playwright CLI / 系统 Chrome，不默认启用重型 DevTools MCP。
---

# 7Flows 浏览器操作

## 何时使用

当任务涉及以下任一场景时使用：

- 打开本地或外部页面并观察真实渲染结果
- 点击、填写表单、切换标签、等待元素出现或读取页面文本
- 生成页面截图、PDF 或其他可复核证据
- 需要用 Playwright 录制、复现或最小化重放一个浏览器流程

不要用于：

- 只靠静态代码阅读就能回答的问题
- 把 agent 侧浏览器操作误写成 7Flows runtime 已具备的产品能力
- 未经确认就把凭据、storage state 或截图证据提交进共享仓库

## 先确认边界

- 遵守 local-first、loopback-first；验证 7Flows 页面时，优先访问本机 loopback 地址。
- 如果目标是 `web/` 下的作者界面，先补读 `web/AGENTS.md`，必要时再看 `README.md` 与相关产品文档。
- 在 7Flows 当前本地开发里，默认不要使用 `chrome-devtools` MCP 或其他长驻 DevTools browser server；它容易残留守护进程、多开 Chrome、额外占资源，并与当前仓库的浏览器操作约束冲突。除非用户明确指定且没有更轻替代，否则优先 `Playwright CLI + 系统 Chrome` 或最小脚本。
- 开始前先检查是否已有上轮自动化残留的浏览器 / DevTools 进程；只清理当前 automation 会话派生的进程，不要误杀用户自己正在使用的浏览器。
- 默认把临时截图、storage state、录制文件放到 `/tmp`；只有用户明确要求保留本地证据时，才考虑放到 `docs/.private/images/`。
- 如果页面依赖登录态或私密数据，优先使用临时会话或环境变量，不要把真实凭据写进共享文件。
- 如果需要验证 `127.0.0.1`，且当前 shell 可能带代理变量，先显式补 `NO_PROXY/no_proxy=localhost,127.0.0.1,127.0.0.0/8,::1`，避免把代理层 `502` 误判成页面故障。

## 工具选择顺序

### 1. Playwright CLI

当任务是快速打开页面、截图、导出 PDF、保存/复用登录态，或用最小成本跑一段 smoke 时，优先使用 Playwright CLI。

建议先确认可用性：

```bash
playwright --version || npx playwright --version
```

常用场景：

- `playwright open http://127.0.0.1:3100/login`
- `playwright screenshot --channel chrome http://127.0.0.1:3100/login /tmp/login.png`
- `playwright pdf https://example.com /tmp/example.pdf`
- `playwright codegen http://127.0.0.1:3100/login`

### 2. 最小 Node 脚本

当任务需要稳定复现多步流程、批量跑多个页面，或 CLI 无法直接表达点击/填写逻辑时，写一个最小 Playwright 脚本完成自动化。

- 脚本默认放到 `/tmp` 或当前临时目录，除非用户明确要求沉淀为仓库资产。
- 只保留完成任务所需的最小步骤，不要顺手膨胀成新的测试框架。
- 如果脚本要长期复用，再考虑把它收成 `scripts/`、测试或 skill 资产，并补 `safe-change-review`。
- 先确认 JS API 真的可导入：`node -p "require.resolve('playwright')"`；如果当前环境只有 CLI 而没有工作区可解析的 JS 包，优先退回 CLI，不要在 `/tmp` 脚本里盲写 `require('playwright')`。

### 3. 当前环境已有浏览器控制工具（仅在确有需要时）

当用户明确要求使用现成浏览器控制工具，或 Playwright CLI / 最小脚本确实无法完成目标时，再考虑使用当前环境已有的浏览器控制工具。默认只在下面场景使用：

- 点击、输入、拖拽、等待元素、抓 DOM 文本
- 看 console / network / 性能 / 可访问性
- 需要在一次会话里交互多步并即时观察结果

如果工具对应的是 `chrome-devtools` MCP 一类长驻进程，在 7Flows 当前仓库里默认不选它作为第一方案。

## 推荐执行顺序

1. 先确认目标 URL、期望动作和最终产物（截图、文本、证据、问题复现）。
2. 检查是否有自动化残留浏览器会话；如确认为自己上一轮留下的 Playwright / DevTools 进程，先清理，再开始新的验证。
3. 如果是本地页面，先确认服务真的在监听，并视需要检查 `localhost / 127.0.0.1` host parity，例如 `curl -I http://127.0.0.1:3100/login`；如 shell 带代理变量，先补精确 `NO_PROXY`。
4. 选择合适工具：默认优先 Playwright CLI；多步复现再写最小脚本；只有确有必要时才进入现成浏览器控制工具。
5. 执行后立即核对结果：页面文本、元素状态、命令输出、截图文件大小与格式。
6. 结束后关闭本轮自动化打开的浏览器，并清理临时 storage state / trace / 脚本；在最终汇报中写清访问页面、操作步骤、证据路径和环境前置条件。

## Playwright 使用提醒

- 某些环境里 `playwright screenshot` 默认会找 `chromium_headless_shell`；若当前已装系统 Chrome，可优先尝试 `--channel chrome`。
- 某些环境里 Playwright CLI 可用，但工作区 `Node.js` 进程并不能直接 `require('playwright')`；写最小脚本前先确认模块解析，不要把“CLI 可用”误当成“JS API 一定可直接导入”。
- 页面有自签名证书时，可按需加 `--ignore-https-errors`，但要在汇报里说明。
- 需要登录态时，优先短生命周期的 `--save-storage` / `--load-storage` 文件，并放在 `/tmp`。
- 如果只为了拿一张证据截图，先用 CLI，不要一上来就搭整套 e2e。
- 需要长期保留本地证据时，优先按 `YYYY-MM-DD-主题-页面.png` 命名后再移动到 `docs/.private/images/` 或 `docs/.private/images/evals/`，避免后续无法追踪来源。

详细命令与故障排查见 [references/playwright-recipes.md](references/playwright-recipes.md)。

## 验证要求

- 至少确认浏览器命令成功执行，且产物文件真实存在。
- 对截图类任务，至少再跑一次 `ls -lh` 或 `file` 确认文件不是空壳。
- 对本地页面 smoke，至少说明页面是否成功打开、关键交互是否成立、是否受本地服务状态影响。
- 如果本轮启动过自动化浏览器或额外 DevTools 会话，结束前至少确认它们没有继续残留占资源。
