# Playwright CLI 常用配方

本文件只保留常用命令和失败排查，不重复 `SKILL.md` 里的触发条件。

## 0. 当前仓库默认策略

- 在 7Flows 当前本地开发里，默认优先 `Playwright CLI + 系统 Chrome`，不要先走 `chrome-devtools` MCP 一类长驻 DevTools 进程。
- 开始前先检查是否有自己上一轮留下的自动化浏览器残留；结束后也要顺手清理，避免多实例 Chrome 挤占资源。
- 如果 `127.0.0.1` 访问可能受代理变量影响，先补精确 `NO_PROXY/no_proxy`，不要把代理层 `502` 误判成 Web 问题。

示例：

```bash
pgrep -af 'playwright|chrome-devtools-mcp|--remote-debugging-pipe'
NO_PROXY=localhost,127.0.0.1,127.0.0.0/8,::1 no_proxy=localhost,127.0.0.1,127.0.0.0/8,::1 curl -I http://127.0.0.1:3100/login
```

只在确认是自己本轮自动化留下的进程时，才按 PID 精确关闭；不要直接批量杀掉用户正常浏览器。

## 1. 安装与确认版本

```bash
playwright --version || npx playwright --version
```

如果默认无头浏览器不完整，但系统已装 Chrome，可先用：

```bash
playwright screenshot --channel chrome https://example.com /tmp/example.png
```

## 2. 快速打开页面

```bash
playwright open http://127.0.0.1:3100/login
```

适合人工观察页面，不适合批量自动化。

## 3. 生成截图

```bash
playwright screenshot http://127.0.0.1:3100/login /tmp/login.png
playwright screenshot --full-page http://127.0.0.1:3100/workspace /tmp/workspace-full.png
playwright screenshot --channel chrome https://example.com /tmp/example.png
```

建议执行后立刻确认：

```bash
ls -lh /tmp/login.png
file /tmp/login.png
```

## 4. 导出 PDF

```bash
playwright pdf https://example.com /tmp/example.pdf
```

更适合保留整页档案，不适合复杂交互验证。

## 5. 录制交互脚本

```bash
playwright codegen http://127.0.0.1:3100/login
```

用来快速拿 selector 和交互顺序。拿到脚本后应做两件事：

- 删掉与任务无关的冗余步骤
- 不要把真实账号密码硬编码进最终脚本

## 6. 登录态存取

保存临时会话：

```bash
playwright open --save-storage /tmp/7flows-auth.json http://127.0.0.1:3100/login
```

复用临时会话：

```bash
playwright screenshot --load-storage /tmp/7flows-auth.json http://127.0.0.1:3100/workspace /tmp/workspace.png
```

这些文件默认只放 `/tmp`，不要提交到仓库。

## 7. 本地页面最小 smoke

先确认服务在线：

```bash
curl -I http://127.0.0.1:3100/login
```

再截图或打开页面：

```bash
playwright screenshot --channel chrome http://127.0.0.1:3100/login /tmp/7flows-login.png
```

如果页面报 404、502 或空白，不要先怪选择器；先回头检查 dev server、代理、端口和 loopback 差异。

## 8. 常见故障

### 浏览器缺失

- 现象：提示 executable 不存在或找不到 `chromium_headless_shell`
- 处理：先执行 `playwright install`；若系统有 Chrome，可尝试 `--channel chrome`

### HTTPS 证书问题

- 现象：自签名、本地证书导致打开失败
- 处理：按需增加 `--ignore-https-errors`，并在汇报中说明环境前提

### 需要复杂点击/填写

- 现象：CLI 只够截图或录制，不方便稳定表达业务流程
- 处理：退到最小 Node 脚本，不要强行把所有步骤塞进 CLI 参数

### CLI 可用但 `require('playwright')` 失败

- 现象：`playwright --version` 正常，但 Node 脚本里直接 `require('playwright')` 报模块不存在
- 处理：先执行 `node -p "require.resolve('playwright')"` 确认工作区是否真的能解析 JS API；如果不能，优先退回 CLI，只有在确实需要 JS API 时再检查全局模块路径（如 `npm root -g`）或改到已安装依赖的工作区执行

### 证据管理混乱

- 现象：截图随手落进共享目录，或命名不可追踪
- 处理：临时产物默认放 `/tmp`；需要本地长期留证时，再移动到 `docs/.private/images/`
