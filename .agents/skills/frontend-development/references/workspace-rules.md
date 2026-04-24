# 1flowbase Product Surface Rules

## Execution Order

前端涉及工作区时，按这个顺序判断：

1. 任务域边界
2. L1 详情模型
3. 状态语义
4. token / 视觉细节

前三步没收敛前，不要先抛光样式。

## Fixed Surface Recipes

| 页面 / section | 主块 | 辅助块 |
| --- | --- | --- |
| `home` | 应用目录、类型 / 标签 / 关键词筛选、创建入口 | 编辑、标签管理、导入入口 |
| `application/orchestration` | AgentFlow 画布 stage + Inspector + draft/runtime 控制 | 节点选择、版本 / 历史、问题抽屉、移动端摘要 |
| `application/api` | 当前发布契约摘要 + 接入方式 / 认证说明 + 请求 / 响应结构 | 版本信息、示例片段、变更提示 |
| `application/logs` | 筛选区 + 运行列表 + Run Drawer / resume card | 时间范围、聚合计数、导出入口 |
| `application/monitoring` | 健康摘要 + 关键指标卡 / 图 + 异常热点列表 | 时间范围切换、阈值说明、刷新时间 |
| `settings` | `SectionPageLayout` + 当前设置 section body | `docs / system-runtime / files / model-providers / members / roles` |

规则：

- 一页或一个 section 只回答一个任务域
- `home` 只承接应用目录、应用创建 / 导入和目录筛选，不承接具体应用的编排、日志、API 正文或运行监控
- 应用详情 section 统一由 `features/applications/lib/application-sections.tsx` 定义
- 设置页 section 统一由 `features/settings/lib/settings-sections.tsx` 定义，不重复造侧栏和权限路由真值层

## L1 Detail Models

工作区只允许两种 L1 详情模型：

| 模型 | 场景 | 规则 |
| --- | --- | --- |
| `Drawer` | Shell 列表行，如 run row、日志行 | 模态；带焦点约束；关闭后焦点回退 |
| `Inspector` | Canvas 对象，如节点、连线 | 非模态；原地更新；保留画布上下文 |

禁止：

- 同类对象有时 `Drawer`、有时 `Modal`、有时跳页
- 节点详情走 `Drawer`
- 日志行详情塞进 `Inspector`
- 未经确认新增第三种 L1 模型

## Status Semantics

| 语义 | 用法 |
| --- | --- |
| `running` | 系统正在执行；唯一使用主色的运行态 |
| `waiting` | 等待外部输入或排队中 |
| `failed` | 失败、阻塞、需要排查 |
| `success` / `healthy` | 执行成功或运行正常 |
| `draft` | 尚未发布 |
| `selected` | 用户当前选中态，不与运行态混用 |

规则：

- 状态色只表达系统状态，不表达类型和装饰
- 类型标签一律中性
- 同一状态在列表、节点、Inspector 三处必须一致

## Button And Copy Discipline

- 只有产生当前上下文可验证结果的控件，才使用 `<button>`
- 导航项使用 `<a>`，不是 `<button>`
- 未实现但要占位的入口，降级成链接或静态文本，不保留 primary CTA 视觉
- UI 文案禁止出现 prompt-like、command-like、internal-instruction-like 表达

## Mobile Downgrade

- `390px` 首屏必须优先展示：状态、标题、当前域主动作
- 移动端主内容优先，`sidebar` 排到主内容后面
- `max-width: 768px` 下，编排页隐藏桌面画布，改成摘要块
- 不要把必须横向滚动的半成品桌面画布塞进小屏
