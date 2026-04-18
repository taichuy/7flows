# 1Flowse 页面调试脚本设计稿

日期：2026-04-18
状态：已确认设计，待用户审阅

关联文档：
- [2026-04-12-dev-runtime-entry.md](../../../../.memory/project-memory/2026-04-12-dev-runtime-entry.md)
- [2026-04-14-dev-up-resets-api-root-password-in-development.md](../../../../.memory/project-memory/2026-04-14-dev-up-resets-api-root-password-in-development.md)
- [dev-up.js](/home/taichu/git/1flowse/scripts/node/dev-up.js)
- [dev-up/core.js](/home/taichu/git/1flowse/scripts/node/dev-up/core.js)

## 1. 文档目标

本文档用于收口一个新的本地开发 Node 脚本设计，目标是让前端页面调试具备以下能力：

- 自动读取本地默认 root 凭据并完成登录
- 复用认证态，通过 Playwright 直接打开受保护页面
- 在需要时抓取目标页面当前渲染链路使用到的 `html/css/js`
- 将抓取结果按目录拆分保存，便于离线阅读页面结构和定位渲染问题

## 2. 背景与问题

当前本地前端调试存在两个重复劳动：

- 每次要手工找到本地 root 账号密码，再走一次登录
- 想分析某个页面的真实渲染结果时，只能在浏览器开发者工具里零散查看 `DOM / stylesheet / script`

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
- `snapshot` 的输出目录结构、资源分类和 HTML 引用重写
- 脚本级单元测试范围

### 3.2 非目标

本稿不覆盖：

- 图片、字体、视频等静态资源的本地落盘
- 登录页面选择器驱动的 UI 自动化登录
- 持久化 `storageState` 文件作为第一版标准输出
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
  - 将结果输出到 `tmp/page-debug/<时间戳>/`
- `open <url>`
  - 登录后打开目标页面
  - 默认保持浏览器窗口，便于人工继续查看
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
  - `snapshot` 模式可覆盖默认输出目录
- `--headless`
  - 显式控制浏览器是否无头运行
- `--timeout`
  - 控制登录、打开页面和抓取等待时间
- `--account`
  - 覆盖默认 root 账号
- `--password`
  - 覆盖默认 root 密码

规则：

- `snapshot` 默认无头运行
- `open` 默认有头运行
- `login` 不启动浏览器
- 若传入的是相对路径，例如 `/settings`，脚本会基于 `--web-base-url` 组装完整 URL

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

## 7. `snapshot` 输出设计

### 7.1 输出目录

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

### 7.2 目录结构

```text
tmp/page-debug/2026-04-18T11-20-35/
  meta.json
  index.html
  css/
    001-main.css
    002-inline.css
  js/
    001-entry.js
    002-chunk.js
    003-inline.js
```

### 7.3 `meta.json`

`meta.json` 至少包含：

- 原始输入 URL
- 最终访问 URL
- 抓取时间
- `web-base-url`
- `api-base-url`
- 使用的登录账号
- 抓取成功的资源清单
- 未保存资源清单与原因

## 8. 资源抓取规则

### 8.1 HTML

HTML 输出使用页面稳定后获取的最终 DOM：

- 保存为 `index.html`

脚本需要重写其中已抓取的 `link/script/style` 引用，使其指向本地输出目录中的 `css/` 和 `js/` 文件。

### 8.2 外链 CSS / JS

脚本在浏览器加载阶段监听资源响应，只保存以下资源类型：

- `document`
- `stylesheet`
- `script`

保存规则：

- `document` 只保留主文档，不为每个跳转生成多个 HTML 文件
- `stylesheet` 落到 `css/`
- `script` 落到 `js/`
- 文件名按捕获顺序编号，并补充可读后缀

### 8.3 内联 CSS / JS

页面稳定后，脚本从 DOM 中抽取：

- `<style>`
- 无 `src` 的 `<script>`

处理规则：

- 每段内容单独落盘
- HTML 中对应节点改写为本地文件引用
- 空内容或纯注释块不落盘

### 8.4 非抓取资源的处理

第一版不把图片、字体等资源下载到本地。

为尽量保留本地查看效果：

- HTML 中未抓取但仍需访问的相对资源链接，应改写为原页面上的绝对 URL
- CSS 中相对 `url(...)` 资源引用，应按源 CSS URL 改写为绝对 URL

这样做的边界是：

- 本地快照只保存 `html/css/js`
- 若开发服务器仍在运行，页面仍有机会加载图片和字体
- 若开发服务器不可用，本地快照仍可用于结构和主要样式脚本分析，但视觉可能不完整

### 8.5 不处理项

第一版明确不处理：

- iframe 内独立文档快照
- 懒加载后二次路由跳转形成的多页面资产
- Service Worker 缓存内容
- WebSocket 和接口返回 JSON 的录制

## 9. `open` 模式设计

`open` 模式只做三件事：

- 读取凭据并登录
- 打开目标页
- 保持浏览器实例，交给用户继续手工检查

它不做资源落盘，不输出 HTML 重写结果。

## 10. 错误处理

脚本必须显式区分以下错误：

- `.env` 不存在
- root 账号或密码缺失
- 登录接口不可达
- 登录失败，返回 `401`
- 页面打开超时
- 页面重定向回登录页，说明认证态没有真正生效
- 输出目录写入失败
- 资源抓取部分失败，但页面本身已打开

错误输出应包含可执行建议，例如：

- 应检查 `dev-up` 是否已启动
- 应检查 `api/apps/api-server/.env`
- 应检查 root 密码是否已被本地开发入口同步

## 11. 测试与验证

### 11.1 单元测试

脚本应沿用现有 `scripts/node/*` 结构：

- `scripts/node/page-debug.js`
- `scripts/node/page-debug/core.js`
- `scripts/node/page-debug/_tests/*.test.js`

第一版单测覆盖：

- CLI 参数解析
- 相对路径 URL 组装
- `.env` 凭据读取与回退规则
- 输出目录和文件名生成
- HTML 引用重写
- CSS `url(...)` 绝对化
- 资源分类与去重

### 11.2 手工验证

实现后至少验证：

- `login` 能正确读取 root 凭据并登录
- `open /sign-in` 以外的受保护页面能直接打开
- `snapshot /settings` 能生成本地目录，并可用本地 `index.html` 复核页面结构

## 12. 实现约束

实现时遵守以下约束：

- 复用 Node 标准库和仓库内已存在的 Playwright 依赖，不额外引入新抓取库
- 结构对齐现有脚本模式，避免把所有逻辑堆进单个 CLI 文件
- 不直接修改 `dev-up` 现有行为
- 不引入数据库级读写或旁路认证逻辑

## 13. 后续扩展位

若第一版稳定，可在后续迭代增加：

- 导出 `storageState`
- 图片与字体本地化
- 多页面批量抓取
- 指定等待选择器后再抓页
- 录制页面截图与控制台日志
