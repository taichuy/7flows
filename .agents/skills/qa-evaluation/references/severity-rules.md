# QA Severity Rules

| 严重度 | 含义 | 默认处理 |
| --- | --- | --- |
| `Blocking` | 当前问题会阻塞继续推进、交付或合并 | 必须先修复 |
| `High` | 当前问题风险高，默认必须修复 | 必须修复 |
| `Medium` | 当前问题不是阻塞，但已足够影响质量和可信度 | 默认应修复 |
| `Low` | 当前问题影响较小，但仍是质量债务 | 默认也修复；若暂缓必须说明原因 |

## Severity Hints

| 场景 | 建议严重度 |
| --- | --- |
| 主路径走不通、关键结果错误、核心状态不一致 | `Blocking` |
| 改共享组件导致其他消费者行为变化 | `High` |
| 局部交互错位、映射不一致、回归缺口明显 | `Medium` |
| 文案、边角一致性、小范围低风险瑕疵 | `Low` |

## Backend Severity Hints

| 后端场景 | 建议严重度 |
| --- | --- |
| 绕过 service 直接改关键状态、插件可注册系统接口、`public / control / runtime` 混层 | `Blocking` |
| 公共 API 契约变化未回归、`runtime extension / capability plugin` 边界被打破、repository 混业务规则、`resource kernel` 托管边界失效 | `High` |
| `storage-pg` 的 repository / mapper 拆分被打回混层实现、mapper 藏业务规则、dynamic modeling 与 runtime data 被混成同一层 | `High` |
| `ApiSuccess` / `204` / 错误结构不一致、后端验证命令或验证脚本缺失、测试目录或命名不对齐 | `Medium` |
| 文档、命名、低风险一致性瑕疵，但未直接影响行为 | `Low` |

## Frontend Severity Hints

| 前端场景 | 建议严重度 |
| --- | --- |
| 主路径可用，但共享样式递归覆盖打坏原生组件布局或交互 | `High` |
| 共享壳层或第三方组件覆写未做其他消费者回归 | `High` |
| 导航文案、`route id`、`path`、选中态不一致，用户路径真相被写散 | `Medium` |
| UI 质量没有真实证据，只按代码主观判断通过 | `Medium` |
| 目录边界失焦、测试目录未对齐、文件职责持续膨胀 | `Medium` |
| 低风险视觉一致性瑕疵，但不影响主路径和原生组件行为 | `Low` |

## Reporting Rules

- `Medium` 及以上问题默认都应进入修复范围
- `Low` 不等于可以忽略，只是优先级最低
- 严重度判断必须基于证据和影响，不要只看改动大小
- 证据不足时不要强行给高结论，应该明确写未验证限制
