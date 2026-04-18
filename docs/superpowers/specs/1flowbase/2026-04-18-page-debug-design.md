# 1Flowbase 页面调试脚本设计稿

日期：2026-04-18
状态：已确认设计，待用户审阅

关联文档：
- [2026-04-12-dev-runtime-entry.md](../../../../.memory/project-memory/2026-04-12-dev-runtime-entry.md)
- [2026-04-14-dev-up-resets-api-root-password-in-development.md](../../../../.memory/project-memory/2026-04-14-dev-up-resets-api-root-password-in-development.md)
- [dev-up.js](/home/taichu/git/1flowbase/scripts/node/dev-up.js)
- [dev-up/core.js](/home/taichu/git/1flowbase/scripts/node/dev-up/core.js)

## 1. 文档目标

本文档用于收口一个新的本地开发 Node 脚本设计，目标是让前端页面调试具备以下能力：

- 开发者只给一个路由时，AI 即可走标准化调试流程
- 自动读取本地默认 root 凭据并完成登录
- 复用认证态，通过 Playwright 直接打开受保护页面
- 在需要时抓取目标页面当前渲染链路使用到的 `html/css/js`
- 自动产出页面截图与控制台日志，作为前端问题排查证据
- 将抓取结果按目录拆分保存，便于离线阅读页面结构、对比当前实现并定位渲染问题

## 2. 背景与问题

当前本地前端调试存在两个重复劳动：

- 每次要手工找到本地 root 账号密码，再走一次登录
- 想分析某个页面的真实渲染结果时，只能在浏览器开发者工具里零散查看 `DOM / stylesheet / script`

当前主要使用者不只是开发者本人，也包括协助排查页面问题的 AI。理想输入应尽量压缩为：

- 一个路由
- 可选的等待条件

然后让脚本标准化产出：

- 可复用的认证态
- 可检索的目录化页面快照
- 页面截图与控制台日志证据
- 可被 AI 稳定消费的机器输出

项目已经具备可复用前提：

- 标准本地开发入口固定为 `node scripts/node/dev-up.js`
- 前端默认地址固定为 `3100`
- 后端默认地址固定为 `7800`
- 开发态下，`dev-up` 会把 root 密码同步回 `api/apps/api-server/.env` 中的 `BOOTSTRAP_ROOT_PASSWORD`
- 登录接口、session cookie 和 `csrf_token` 合同已经稳定

因此本次不需要再造一套数据库级凭据发现逻辑，也不应要求用户在脚本外先完成手工登录。

## 3. 范围与非目标

### 3.1 本稿范围

本稿覆盖一个新的脚本入口：

- `scripts/node/page-debug.js`

本稿同时覆盖：

- CLI 入口与参数设计
- root 凭据读取与登录流程
- Playwright browser context 认证态复用
- `open` 与 `snapshot` 两类模式
- 页面就绪判断与等待契约
- `snapshot` 的输出目录结构、资源分类和 HTML 引用重写
- 页面截图与控制台日志采集
- AI 可稳定消费的进程输出协议
- 脚本级单元测试范围

### 3.2 非目标

本稿不覆盖：

- 图片、字体、视频等静态资源的本地落盘
- 登录页面选择器驱动的 UI 自动化登录
- 独立的 storage state-only 子命令
- 多页面批量抓取、整站镜像或递归爬取
- 页面接口 mock、网络录制与回放
- 生产环境凭据管理

## 4. 方案选择

本次候选方向有三种：

### 4.1 方案 A：HTTP 登录后复用认证态，再由 Playwright 打开或抓页

做法：

- 从本地 `.env` 读取 root 账号密码
- 直接调用现有密码登录接口
- 取回 session cookie 并注入 Playwright context
- 再访问目标页面

优点：

- 直接复用当前后端合同
- 对登录页 UI 不敏感
- 能把“登录”“打开页面”“抓取页面”统一到一条链路

缺点：

- 需要自己维护 cookie 注入和资源整理逻辑

### 4.2 方案 B：Playwright 模拟登录页交互

做法：

- 先进入 `/sign-in`
- 自动填写 root 账号密码并点击提交
- 登录后再打开目标页

优点：

- 完整贴近真实用户操作路径

缺点：

- 容易受登录页表单结构变化影响
- 执行更慢
- 作为开发工具稳定性较差

### 4.3 方案 C：先生成认证态文件，再由其他命令消费

做法：

- 将登录和页面操作拆成两步
- 第一步只生成 storage state
- 第二步再打开或抓取页面

优点：

- 适合后续扩成更完整的测试基建

缺点：

- 第一版使用成本偏高
- 当前需求没有要求把流程拆成两段

### 4.4 结论

采用方案 A。

理由：

- 它最短地覆盖了“自动登录 + 直接打开 + 直接抓取”三个用户目标
- 它和现有 `dev-up`、后端登录合同、cookie session 机制天然对齐
- 它避免把脚本稳定性绑定到登录页 UI 细节

## 5. CLI 设计

### 5.1 入口与默认行为

脚本入口固定为：

- `node scripts/node/page-debug.js`

默认行为固定为：

- 未显式指定子命令时，按 `snapshot` 执行

### 5.2 子命令

- `snapshot <url>`
  - 登录后打开目标页面
  - 抓取当前页面最终 `html` 以及页面加载到的 `css/js`
  - 将结果输出到一次运行对应的目录
- `open <url>`
  - 登录后打开目标页面
  - 默认保持浏览器窗口，便于人工继续查看
  - 同时输出本次运行目录，供后续 Playwright 或其他脚本复用认证态
- `login`
  - 只验证凭据读取和登录链路
  - 输出当前使用的账号、API 地址和 Web 地址
  - 不打开目标页面

### 5.3 参数

第一版支持以下参数：

- `--web-base-url`
  - 默认 `http://127.0.0.1:3100`
- `--api-base-url`
  - 默认 `http://127.0.0.1:7800`
- `--out-dir`
  - `snapshot` 与 `open` 模式可覆盖默认输出目录
- `--headless`
  - 显式控制浏览器是否无头运行
- `--timeout`
  - 控制登录、打开页面和抓取等待时间
- `--account`
  - 覆盖默认 root 账号
- `--password`
  - 覆盖默认 root 密码
- `--wait-for-selector`
  - 页面达到基础稳定态后，继续等待指定选择器出现
- `--wait-for-url`
  - 用于处理会发生规范化跳转的路由，要求最终 URL 匹配指定值

规则：

- `snapshot` 默认无头运行
- `open` 默认有头运行
- `login` 不启动浏览器
- 若传入的是相对路径，例如 `/settings`，脚本会基于 `--web-base-url` 组装完整 URL

### 5.4 进程输出协议

脚本的主要消费方包含 AI，因此输出协议必须稳定。

规则：

- 成功时，`stdout` 只输出一个 JSON 对象
- 失败时，进程退出码非 `0`，并输出可解析的错误 JSON
- 过程日志写入 `stderr`，不能污染 `stdout` 的结构化结果

成功输出至少包含：

- `mode`
- `requestedUrl`
- `finalUrl`
- `authenticated`
- `readyState`
- `outputDir`
- `metaPath`
- `storageStatePath`
- `htmlPath`
- `screenshotPath`
- `consoleLogPath`
- `warnings`

其中：

- `snapshot` 成功时 `htmlPath` 必须指向本地 `index.html`
- `snapshot` 与 `open` 成功时 `screenshotPath` 必须指向本地产出的截图文件
- `snapshot` 与 `open` 成功时 `consoleLogPath` 必须指向本地控制台日志文件
- `open` 成功时 `htmlPath` 允许为 `null`
- `login` 成功时 `outputDir`、`storageStatePath`、`htmlPath`、`screenshotPath`、`consoleLogPath` 允许为 `null`

## 6. 认证设计

### 6.1 凭据来源

默认从：

- `api/apps/api-server/.env`

读取以下字段：

- `BOOTSTRAP_ROOT_ACCOUNT`
- `BOOTSTRAP_ROOT_PASSWORD`

账号缺失时，回退为：

- `root`

密码缺失时直接报错，不回退伪默认值。

### 6.2 登录接口

登录固定调用现有接口：

- `POST /api/public/auth/providers/password-local/sign-in`

请求体使用：

```json
{
  "identifier": "root",
  "password": "change-me"
}
```

脚本不直接访问数据库，不调用 Rust 的密码重置工具，也不依赖前端登录页。

### 6.3 认证态注入

登录成功后，脚本从响应头中提取 session cookie，并将其注入 Playwright context。

注入后的页面访问仍走真实前端逻辑：

- 前端页面自行请求 `GET /api/console/session`
- 前端页面自行恢复当前 actor、workspace 和 `csrf_token`

这意味着：

- 脚本只负责建立登录态
- 页面自己的鉴权 bootstrap 仍然是真值来源

### 6.4 认证态复用产物

为了让 AI 在首次登录后继续复用浏览器认证态，`open` 与 `snapshot` 模式都必须输出：

- `storage-state.json`

该文件来自 Playwright context 的标准 `storageState` 导出结果。

用途：

- 后续 Playwright 脚本可直接复用
- AI 不必重复执行登录流程
- 页面问题定位可以拆成“先拿认证态，再做交互或抓取”两段

第一版不要求把 `login` 单独做成 storage state 生成器，但 `open` 与 `snapshot` 必须默认生成该产物。

## 7. 页面就绪判断

脚本不能只以 `page.goto()` 成功作为“页面已可抓取”的标准。页面就绪必须包含最小判定链路。

### 7.1 基础稳定态

默认基础稳定态需要同时满足：

- 浏览器已完成目标页面导航
- 文档 `readyState` 为 `complete`
- 最终 URL 没有落回 `/sign-in`
- 认证 bootstrap 已经结束，不再停留在会话恢复加载态

在当前前端实现下，基础稳定态至少要避开：

- `RouteGuard` 的“正在恢复会话...”中间态
- session cookie 已写入，但前端还未完成 `GET /api/console/session` 与 `GET /api/console/me` 的恢复阶段

### 7.2 路由稳定态

若输入的是相对路由，例如 `/settings`，脚本默认要求最终 pathname 至少仍属于该路由意图，不允许出现：

- 回跳 `/sign-in`
- 因无权限或规范化跳转落到完全不相关页面

如果页面本身会做合法跳转，例如 `/settings` 最终落到 `/settings/members`，允许使用：

- `--wait-for-url`

来明确声明期望的最终 URL。

### 7.3 页面级补充等待

仅靠基础稳定态不保证业务数据已经回填完成，因此脚本必须支持：

- `--wait-for-selector`

规则：

- 先等待基础稳定态
- 再等待指定选择器出现
- 若选择器未在 `--timeout` 内出现，则视为失败

这使 AI 在只提供路由仍可拿到基础可用结果；若某个页面需要等特定列表、表单或标题出现，再额外补 selector 即可。

## 8. `snapshot` 输出设计

### 8.1 输出目录

默认输出路径固定为：

- `tmp/page-debug/<时间戳>/`

时间戳格式要求：

- 文件系统安全
- 可排序
- 绝对时间可读

示例：

```text
tmp/page-debug/2026-04-18T11-20-35/
```

### 8.2 目录结构

```text
tmp/page-debug/2026-04-18T11-20-35/
  meta.json
  storage-state.json
  index.html
  page.png
  console.ndjson
  css/
    001-main.css
    002-inline.css
  js/
    001-entry.js
    002-chunk.js
    003-inline.js
```

### 8.3 `meta.json`

`meta.json` 至少包含：

- 原始输入 URL
- 最终访问 URL
- 抓取时间
- `web-base-url`
- `api-base-url`
- 使用的登录账号
- `readyState`
- `storageStatePath`
- `screenshotPath`
- `consoleLogPath`
- 控制台日志条目数
- `pageerror` 条目数
- 抓取成功的资源清单
- 未保存资源清单与原因

### 8.4 调试证据产物

除了 `html/css/js` 目录化快照外，第一版还必须产出两类直接排查证据：

- `page.png`
- `console.ndjson`

`page.png` 规则：

- 在页面达到最终抓取时机后截取
- `snapshot` 模式必须生成
- `open` 模式至少在初次达到页面稳定态后生成一张初始截图

`console.ndjson` 规则：

- 使用结构化逐行 JSON 存储，而不是纯文本拼接
- 至少记录浏览器 `console` 事件与 `pageerror` 事件
- 每条记录至少包含：
  - `timestamp`
  - `eventType`
  - `level`
  - `text`
  - `url`
  - `lineNumber`
  - `columnNumber`

这样 AI 在不重新打开浏览器的情况下，也能直接检索报错、告警和页面首屏状态。

## 9. 资源抓取规则

### 9.1 HTML

HTML 输出使用页面稳定后获取的最终 DOM：

- 保存为 `index.html`

脚本需要重写其中已抓取的 `link/script/style` 引用，使其指向本地输出目录中的 `css/` 和 `js/` 文件。

### 9.2 外链 CSS / JS

脚本在浏览器加载阶段监听资源响应，只保存以下资源类型：

- `document`
- `stylesheet`
- `script`

保存规则：

- `document` 只保留主文档，不为每个跳转生成多个 HTML 文件
- `stylesheet` 落到 `css/`
- `script` 落到 `js/`
- 文件名按捕获顺序编号，并补充可读后缀

### 9.3 内联 CSS / JS

页面稳定后，脚本从 DOM 中抽取：

- `<style>`
- 无 `src` 的 `<script>`

处理规则：

- 每段内容单独落盘
- HTML 中对应节点改写为本地文件引用
- 空内容或纯注释块不落盘

### 9.4 非抓取资源的处理

第一版不把图片、字体等资源下载到本地。

为尽量保留本地查看效果：

- HTML 中未抓取但仍需访问的相对资源链接，应改写为原页面上的绝对 URL
- CSS 中相对 `url(...)` 资源引用，应按源 CSS URL 改写为绝对 URL

这样做的边界是：

- 本地快照只保存 `html/css/js`
- 若开发服务器仍在运行，页面仍有机会加载图片和字体
- 若开发服务器不可用，本地快照仍可用于结构和主要样式脚本分析，但视觉可能不完整

### 9.5 不处理项

第一版明确不处理：

- iframe 内独立文档快照
- 懒加载后二次路由跳转形成的多页面资产
- Service Worker 缓存内容
- WebSocket 和接口返回 JSON 的录制

## 10. `open` 模式设计

`open` 模式只做三件事：

- 读取凭据并登录
- 打开目标页
- 保持浏览器实例，交给用户继续手工检查

它不做 `html/css/js` 资源落盘，但仍然需要生成一次运行目录，至少包含：

- `meta.json`
- `storage-state.json`
- `page.png`
- `console.ndjson`

这样 AI 可以在本次人工打开后，继续复用认证态做下一步浏览器自动化操作。

## 11. 错误处理

脚本必须显式区分以下错误：

- `.env` 不存在
- root 账号或密码缺失
- 登录接口不可达
- 登录失败，返回 `401`
- 页面打开超时
- 页面重定向回登录页，说明认证态没有真正生效
- 页面未达到基础稳定态
- 指定的 `--wait-for-selector` 未出现
- 截图生成失败
- 控制台日志文件写入失败
- 输出目录写入失败
- 资源抓取部分失败，但页面本身已打开

错误输出应包含可执行建议，例如：

- 应检查 `dev-up` 是否已启动
- 应检查 `api/apps/api-server/.env`
- 应检查 root 密码是否已被本地开发入口同步

## 12. 测试与验证

### 12.1 单元测试

脚本应沿用现有 `scripts/node/*` 结构：

- `scripts/node/page-debug.js`
- `scripts/node/page-debug/core.js`
- `scripts/node/page-debug/_tests/*.test.js`

第一版单测覆盖：

- CLI 参数解析
- 相对路径 URL 组装
- `.env` 凭据读取与回退规则
- 成功/失败 JSON 输出结构
- 页面就绪状态判定
- 截图与控制台日志输出路径生成
- 控制台事件序列化
- 输出目录和文件名生成
- HTML 引用重写
- CSS `url(...)` 绝对化
- 资源分类与去重

### 12.2 手工验证

实现后至少验证：

- `login` 能正确读取 root 凭据并登录
- `open /sign-in` 以外的受保护页面能直接打开
- `open /settings` 能生成 `storage-state.json`
- `open /settings` 能生成初始 `page.png` 与 `console.ndjson`
- `snapshot /settings` 能生成本地目录，并可用本地 `index.html` 复核页面结构
- `snapshot /settings` 能生成 `page.png` 与 `console.ndjson`
- `snapshot` 的 `stdout` 能被机器稳定解析并定位到 `outputDir` 与 `htmlPath`

## 13. 实现约束

实现时遵守以下约束：

- 复用 Node 标准库和仓库内已存在的 Playwright 依赖，不额外引入新抓取库
- 结构对齐现有脚本模式，避免把所有逻辑堆进单个 CLI 文件
- 不直接修改 `dev-up` 现有行为
- 不引入数据库级读写或旁路认证逻辑

## 14. 后续扩展位

若第一版稳定，可在后续迭代增加：

- 图片与字体本地化
- 多页面批量抓取
