## Scope
- 作用域：`web/` 及其子目录。
- 当前阶段：前端仍处于 bootstrap 阶段；新增代码要向目标结构收敛，不要继续把混合职责堆进 `app/src/app/router.tsx` 和 `app/src/styles/globals.css`。

## Skills
- 做前端实现、页面、壳层、组件、交互时：使用 `frontend-development`
- 只要涉及导航、层级、入口、详情容器、L0 / L1 / L2 / L3 或同类对象行为统一，先跑 `frontend-development` 的交互架构 gate；命中结构问题时补 `frontend-logic-design`
- 做质量评估、回归审计时：使用 `qa-evaluation`

## Directory Rules
- `app/src/` 是主前端源码根；下面提到的 `app/`、`app-shell/`、`routes/`、`features/`、`shared/`、`state/`、`styles/`、`style-boundary/` 默认都指 `app/src` 下对应目录。
- `app/` 只保留应用启动、Provider 组装、入口级装配。
- `app-shell/` 只承载共享壳层和壳层级菜单，不承载 route tree、feature 页面容器或 feature 私有组件。
- `routes/` 负责路由真值层：`route id / path / selected state / permission key / guard`。
- `features/*/pages` 放页面容器，`features/*/components` 放 feature 内部组件。
- `features/*/api` 放 feature 级请求消费层，例如 query key、queryFn、mutation 和当前 feature 的请求适配。
- `features/*/lib` 放 feature 内部工具，不对其他 feature 默认开放。
- `shared/ui` 放跨 feature 复用组件，不承担 `app-shell` 专属结构。
- `shared/utils` 只放纯函数工具，不放请求、副作用和界面组件。
- `shared/api` 只放多个 feature 共同依赖的请求编排；若只是单 feature 使用，优先留在 `features/*/api`。
- `state/` 只放跨页面共享的客户端状态；feature 私有状态留在 feature 内，服务端数据优先留在 query/mutation 消费层，不要塞进 store。
- `styles/` 只放 token、reset、global 和应用级样式边界；feature 或页面专属样式应跟最近的页面、组件或壳层 owner 放在一起。
- `test/` 只放全局测试 setup 和跨场景测试工具；业务测试文件必须进入最近的 `_tests/`。
- `style-boundary/` 只负责样式场景注册和样式边界回归，不负责泛 UI 质量结论。
- `packages/api-client` 放底层原始请求 client、DTO、transport；页面和组件里不要直接写请求函数。
- `packages/ui` 只放设计系统级通用组件；单 feature 组件和 `app-shell` 专属结构不要上提到这里。
- 其他 `packages/*` 只在需要脱离 `app/` 独立复用、发布或承载 runtime/protocol/schema/SDK 时出现；不要为了“更整洁”把普通页面逻辑提成 package。
- 同一目录下文件数量接近 `15` 个时，先按职责继续收纳子目录，不要继续横向摊平；单文件接近 `1500` 行时先拆分职责。

## Local Rules
- 优先复用 `@1flowbase/ui` 与 `antd`，不要重复造轮子。
- UI 禁止出现内部提示词、调试文本、占位文案、mock 文案、`TODO/FIXME`、异常对象、原始 JSON。
- 未开放功能不要写 `placeholder / reserved / later`；改为隐藏入口或正式“未开放/建设中”状态。
- 仅开发辅助信息允许在 `import.meta.env.DEV` 下渲染。
- 路由相关改动必须同步维护导航文案、`route id`、`path`、选中态和权限键。
- 样式改动固定按 `theme token -> first-party wrapper -> explicit slot -> stop`；禁止裸写 `.ant-*` 递归覆盖。
- 管理台/后台页面禁止 `Card` 套 `Card` 和卡片墙式堆叠；优先使用 `Table`、`Descriptions`、`Form`、`Typography`、`Divider`、`Space/Flex` 组织信息。
- 前端测试资源限制统一由仓库根 `.1flowbase.verify.local.json` 驱动；需要调整 `turbo` 并发或 `vitest` workers 时，同步更新 `.1flowbase.verify.local.json.example`，不要在 `web/package.json` 或 `web/app/package.json` 重新写死并发。
- 需要吃到本地资源限制时，优先走仓库标准入口：`pnpm --dir web test`、`pnpm --dir web/app test`、`node scripts/node/test-frontend.js fast|full`；不要直接用裸 `pnpm exec vitest` 或 `pnpm exec turbo` 绕过限制。

## Verification
- 进入自检、验收、回归或交付阶段时，使用 `qa-evaluation` 并自行执行对应脚本。
- 改动导航、壳层、共享样式、全局样式或第三方 slot 覆写后，QA 结论必须包含 `style-boundary` 证据。
- 需要页面结论时，必须检查桌面端和移动端关键页面；不能只看代码就判 UI 通过。
