## Scope
- 作用域：`web/` 及其子目录。
- 当前阶段：前端仍处于 bootstrap 阶段；新增代码要向目标结构收敛，不要继续把混合职责堆进 `app/router.tsx` 和 `styles/global.css`。

## Skills
- 做前端实现、页面、壳层、组件、交互时：使用 `frontend-development`
- 做导航、层级、入口、一致性判断时：补 `frontend-logic-design`
- 做质量评估、回归审计时：使用 `qa-evaluation`

## Directory Rules
- `app/` 只保留应用启动、Provider 组装、入口级装配。
- `app-shell/` 只承载共享壳层和壳层级菜单，不承载 route tree。
- `routes/` 负责路由真值层：`route id / path / selected state / permission key / guard`。
- `features/*/pages` 放页面容器，`features/*/components` 放 feature 内部组件。
- `features/*/api` 放 feature 级请求消费层，例如 query key、queryFn、mutation 和当前 feature 的请求适配。
- `features/*/lib` 放 feature 内部工具，不对其他 feature 默认开放。
- `shared/ui` 放跨 feature 复用组件，不承担 `app-shell` 专属结构。
- `shared/utils` 只放纯函数工具，不放请求、副作用和界面组件。
- `shared/api` 只放多个 feature 共同依赖的请求编排；若只是单 feature 使用，优先留在 `features/*/api`。
- 底层原始请求 client、DTO、transport 放 `web/packages/api-client`；页面和组件里不要直接写请求函数。
- 测试文件必须进入最近的 `_tests/`。
- `style-boundary/` 只负责样式场景注册和样式边界回归，不负责泛 UI 质量结论。

## Local Rules
- 优先复用 `@1flowse/ui` 与 `antd`，不要重复造轮子。
- UI 禁止出现内部提示词、调试文本、占位文案、mock 文案、`TODO/FIXME`、异常对象、原始 JSON。
- 未开放功能不要写 `placeholder / reserved / later`；改为隐藏入口或正式“未开放/建设中”状态。
- 仅开发辅助信息允许在 `import.meta.env.DEV` 下渲染。
- 路由相关改动必须同步维护导航文案、`route id`、`path`、选中态和权限键。
- 样式改动固定按 `theme token -> first-party wrapper -> explicit slot -> stop`；禁止裸写 `.ant-*` 递归覆盖。
- 管理台/后台页面禁止 `Card` 套 `Card` 和卡片墙式堆叠；优先使用 `Table`、`Descriptions`、`Form`、`Typography`、`Divider`、`Space/Flex` 组织信息。

## Verification
- 修改前端后至少执行：
  - `pnpm --dir web lint`
  - `pnpm --dir web test`
  - `pnpm --dir web/app build`
- 改动导航、壳层、共享样式、全局样式或第三方 slot 覆写后，必须补一次 `style-boundary` 回归。
- 必须检查桌面端和移动端关键页面；不能只看代码就判 UI 通过。
