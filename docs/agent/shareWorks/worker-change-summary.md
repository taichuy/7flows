# Worker Change Summary

日期：2026-04-12
任务：

- `e5635f29` 按批准变更单修改 `tmp/demo`
- `a711d18d` 按临时批准变更单更新 `DESIGN.md`

## 变更内容

1. 将 `tmp/demo` 从单页拼盘重构为五个明确视图：
   - `应用概览`
   - `编排`
   - `应用 API`
   - `调用日志`
   - `监控报表`
2. 左侧导航收敛为 `编排 / 应用 API / 调用日志 / 监控报表`，概览改为默认落点，通过应用标题返回。
3. 概览页只保留基本信息、发布状态、核心健康摘要和单一主入口 `进入编排`。
4. 编排页保留 `canvas + inspector`，并在小屏降级为流程摘要与节点列表，不再要求手机端横向滚动完整画布。
5. 调用日志页保留 run list + drawer，下钻规则固定为“列表详情走 drawer”。
6. 修复 drawer 最小模态契约：
   - 关闭态使用 `hidden`
   - 打开时设置初始焦点到关闭按钮
   - `Escape` / 关闭按钮 / 遮罩均可关闭
   - 关闭后焦点回到触发项
   - 打开时对主工作区应用 `inert`
7. 清除了伪按钮和设计评审型文案，保留的按钮都具备真实结果：
   - 视图切换
   - 返回概览
   - 进入编排
   - 节点聚焦
   - 日志详情抽屉
8. 状态语义统一为：
   - `selected` = 中性 focus ring
   - `running` = 紫蓝
   - `healthy` = 绿色
   - `waiting` = 琥珀
   - `failed` = 红色
   - `draft` = 中性灰
   - `published` = 主蓝
   - 类型标签改为中性 badge，不再和状态共享高饱和语法
9. 重写 `docs/draft/DESIGN.md`，补入本轮工作区边界、L1 详情规则、状态映射、移动端策略和 no-op 按钮禁令。

## 涉及文件

- `tmp/demo/index.html`
- `tmp/demo/styles.css`
- `tmp/demo/script.js`
- `docs/draft/DESIGN.md`

## 基本验证

- `node --check tmp/demo/script.js`
  - 结果：通过
- `rg -n "<button|data-view-trigger|data-run-trigger|data-node|data-drawer-close" tmp/demo/index.html`
  - 结果：静态 HTML 中只保留视图切换、进入编排、抽屉关闭等真实入口；节点与日志按钮由脚本生成
- `rg -n "Default Visual Baseline|Three rules|Tone chips|Sub-spec note|Compare tokens|Open API page|Upload static bundle|State Data|Compact mode" tmp/demo/index.html docs/draft/DESIGN.md`
  - 结果：无匹配，旧的评审型文案和伪入口已清除
- `rg -n "aria-modal|aria-hidden|inert|Escape|Tab|drawer" tmp/demo/script.js tmp/demo/index.html`
  - 结果：抽屉具备 `aria-modal`、`hidden`、`Escape`、`Tab` 焦点约束和 `inert` 处理
- `rg -n "max-width: 720|max-width: 390|mobile-stage|desktop-stage|detail-drawer" tmp/demo/styles.css`
  - 结果：存在小屏降级和 390px 抽屉适配规则

## 未完成的验证

- 未在真实浏览器中做桌面/移动端手动点击回归
- 未重新生成 `desktop.png` / `mobile.png`

建议下一步由 QA 复验交互契约和响应式行为。
