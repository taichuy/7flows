# Task Mode Checklist

## Inputs

- 当前任务目标是否清楚
- 当前改动范围是否清楚
- 预期验收场景是否清楚
- 相关页面 / 模块 / API 边界是否清楚

## Evidence Gate

- 能运行的回归脚本是否已经运行
- 能执行的局部验证命令是否已经执行
- 需要看界面时，是否提供了截图或真实交互证据
- 若评估对象是单一路由或受保护页面，是否优先运行 `node scripts/node/page-debug.js snapshot|open ...` 获取运行态证据
- 需要走用户路径时，是否按入口到完成走了一遍
- 页面存在规范化跳转时，是否记录请求路由、最终 URL，以及 `--wait-for-url` 的真实取值
- 无法验证时，是否明确写出 `未验证，不下确定结论`

## Checks

| 检查项 | 要回答的问题 | 常见证据 |
| --- | --- | --- |
| 功能完成 | 当前任务目标是否真正完成 | 测试结果、运行结果、界面结果 |
| UI 风格与质量 | 风格、视觉层级、原生组件完整性是否达到验收标准 | 截图、真实页面、视觉对照、交互结果 |
| 路由级运行态证据 | 单一路由、受保护页面、登录跳转和 ready signal 是否已被真实验证 | `page-debug` JSON、`outputDir`、`meta.json`、`page.png`、`console.ndjson` |
| 样式边界 | 是否仍守住 `theme token / first-party wrapper / explicit slot` 边界，是否出现无边界第三方递归覆盖 | CSS 选择器、wrapper class、computed style、blast radius 说明 |
| 导航真值层 | 导航文案、`route id`、`path`、选中态和权限映射是否仍来自同一事实源 | 路由配置、导航配置、选中态逻辑、spec 对照 |
| 目录与边界 | 目录是否对齐 spec，文件职责是否仍聚焦，测试目录规则是否仍被遵守 | 目录树、文件职责、`_tests`、行数与目录压力 |
| 交互流 | 本次改动是否破坏入口、主路径、详情路径或反馈逻辑 | 手动流程、截图、录屏、页面行为 |
| 变化传播 | 改共享组件、共享状态、公共协议后，其他消费者是否被带坏 | 受影响页面/模块回归、调用方检查 |
| 状态 / API / 数据映射 | 当前展示、接口、状态和值映射是否仍一致 | 接口结果、UI 状态、日志、数据样例 |
| 关键回归 | 当前任务需要的关键回归是否存在并已运行 | 测试命令、断言结果、失败/通过记录 |

## Backend Task Supplement

命中以下任一条件时，必须追加后端专项检查：

- 后端路由、响应结构、OpenAPI 或调用契约发生变化
- service、repository、mapper、runtime-core、orchestration-runtime、runtime-profile、plugin-framework、storage-postgres、storage-durable、storage-object 发生变化
- 任务涉及 `runtime extension`、`capability plugin`、动态建模、resource kernel、文件管理 / 对象存储、验证脚本

执行顺序固定跟随 `backend-regression-steps.md`，不要先看局部代码再回补验证。

| 检查项 | 要回答的问题 | 常见证据 |
| --- | --- | --- |
| 三平面 | 当前改动是否仍明确区分 `public / control / runtime`，有没有把公开协议、控制面资源和 runtime 数据写混 | 路由路径、模块结构、调用链 |
| 宿主托管边界 | `resource kernel` 是否仍由宿主托管，`dynamic modeling` 是否仍是元数据系统而不是 runtime 数据本身 | descriptor/registry、模型发布流程、runtime engine |
| 接口包装 | 是否仍遵守 `ApiSuccess`、`204 No Content`、统一错误结构和分页 `meta` | 路由返回、OpenAPI、测试断言 |
| 状态入口 | 是否仍由命名明确的 service command/action 修改关键状态，route 是否绕过了 service | route 代码、service 写入口、审计触发点 |
| 插件消费边界 | 是否仍守住 `host-extension / runtime extension / capability plugin` 边界，有没有出现 runtime 或 capability 插件直接扩系统接口 | plugin-framework、runtime-core、接口注册点 |
| 分层边界 | 是否出现 repository 混业务逻辑、mapper 混规则、route 混 SQL、service 失焦 | 代码结构、文件职责、写路径 |
| 存储分层 | `storage-postgres` 是否仍保持 repository / mapper 拆分，`storage-durable` 是否只暴露主存储稳定入口，`storage-object` 是否只承担文件 driver 边界 | storage-postgres/storage-durable/storage-object 目录、repository/mapper tests、driver tests、调用链 |
| 质量门禁 | 是否执行了后端最小验证命令或验证脚本，是否补了对应 tests，是否继续把大文件和目录压力放大 | 命令输出、脚本输出、测试文件、`wc -l`、目录结构 |

## Blast Radius Review

- 不要只看当前改动入口
- 共享组件改动必须抽查其他使用方
- 共享壳层样式或第三方组件覆写必须抽查其他消费者，不能只看当前截图
- 公共状态改动必须检查其他写入口和读入口
- 公共 API 改动必须检查调用方是否仍按同一契约工作
- 如果局部改动引入公共行为变化，默认至少报 `High`
- 后端公共路由改动必须抽查其他调用方、OpenAPI 和相关 `_tests`
- session、auth、provider 或 callback 改动必须补查 `public` 与 `control` 平面的传播影响
- `storage-postgres`、`storage-durable`、`storage-object`、`runtime-core`、`orchestration-runtime`、`runtime-profile`、`plugin-framework` 这类基础层改动，默认按高 blast radius 看待

## Output Discipline

- 先给结论，再列 Findings
- 每条问题都写证据、原因、修正方向
- 没有阻塞问题时，也要补残余风险和未覆盖项
