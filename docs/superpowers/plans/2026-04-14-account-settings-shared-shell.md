# Account And Settings Shared Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/me` 与 `/settings` 落成共享二级壳层，迁移为静态注册的 section 子路由，并在不改变 `/me` 视觉基线的前提下补齐权限可见性、响应式导航、测试和样式边界回归。

**Architecture:** 先建立一个纯布局的 `SectionPageLayout` 与导航骨架，再把 `/me`、`/settings` 的 section 定义冻结到各自 `features/*/lib`，由静态子路由负责深链，由 feature 自己负责可见性和默认落点。`APP_ROUTES` 继续只表达一级导航语义，二级 section 的显隐、无权限跳转和空态都收口到 feature 页面容器里，最后用 `style-boundary` 和浏览器截图回归锁住 `/me` 的视觉不回退。

**Tech Stack:** React 19, TypeScript, TanStack Router, TanStack Query, Zustand, Ant Design, Vitest, Vite, `style-boundary`

**Source Spec:** `docs/superpowers/specs/1flowse/2026-04-14-account-settings-shared-shell-design.md`

**Approval:** 设计稿已冻结；用户在当前会话直接要求输出实施计划。

---

## Scope Notes

- `/me` 与 `/settings` 继续是两套一级入口，只共享二级页面模板，不共享导航树。
- `APP_ROUTES` 仍只保留 `settings` / `me` 两个一级 route id；不要为 `/settings/docs` 或 `/me/security` 新增一级导航语义。
- `route-config.ts` 的子路径匹配应从宽泛的 `startsWith('/settings')` / `startsWith('/me')` 收紧为“根路径或带 `/` 的子路径”，避免误命中形如 `/settings-foo` 的未来路径。
- 设计稿第 `6.4` 节与 `10.1` 节对无权限跳转有轻微措辞差异；本计划以第 `6.4` 节为准，统一实现为“跳到配置顺序中的第一个可见 section”。
- `/settings` 当前业务上总会至少看到 `docs`，`/me` 当前业务上总会至少看到 `profile` / `security`；但共享模板与 feature 页容器仍必须保留“零可见 section 时显示正式空态”的能力，并通过共享层测试覆盖。
- 如果 `/me` 的样式收口开始把 feature 私有类名塞进共享 CSS，立即停下并把这些规则拆到最近 owner（优先 `features/me/pages/me-page.css` 或组件私有样式），不要让 `shared/ui` 吞掉 feature 语义。

## File Structure

**Create**
- `web/app/src/shared/ui/section-page-layout/SectionPageLayout.tsx`
- `web/app/src/shared/ui/section-page-layout/SectionSidebarNav.tsx`
- `web/app/src/shared/ui/section-page-layout/section-page-layout.css`
- `web/app/src/shared/ui/section-page-layout/_tests/section-page-layout.test.tsx`
- `web/app/src/features/me/lib/me-sections.tsx`
- `web/app/src/features/settings/lib/settings-sections.tsx`
- `web/app/src/routes/_tests/section-shell-routing.test.tsx`
- `web/app/src/features/me/pages/me-page.css`

**Modify**
- `web/app/src/app/router.tsx`
- `web/app/src/routes/route-config.ts`
- `web/app/src/routes/_tests/route-config.test.ts`
- `web/app/src/features/settings/pages/SettingsPage.tsx`
- `web/app/src/features/settings/_tests/settings-page.test.tsx`
- `web/app/src/features/me/pages/MePage.tsx`
- `web/app/src/features/me/components/ProfileForm.tsx`
- `web/app/src/features/me/components/ChangePasswordForm.tsx`
- `web/app/src/features/me/_tests/me-page.test.tsx`
- `web/app/src/style-boundary/scenario-manifest.json`

**Delete After Migration**
- `web/app/src/features/settings/components/SettingsSidebar.tsx`

### Task 1: 建立共享 Section Shell 骨架

**Files:**
- Create: `web/app/src/shared/ui/section-page-layout/SectionPageLayout.tsx`
- Create: `web/app/src/shared/ui/section-page-layout/SectionSidebarNav.tsx`
- Create: `web/app/src/shared/ui/section-page-layout/section-page-layout.css`
- Create: `web/app/src/shared/ui/section-page-layout/_tests/section-page-layout.test.tsx`

- [x] **Step 1: 先写共享壳层的失败测试**

在 `web/app/src/shared/ui/section-page-layout/_tests/section-page-layout.test.tsx` 中先覆盖三件事：

```tsx
test('renders desktop rail navigation and sidebar footer', () => {});
test('renders empty state instead of broken navigation when navItems is empty', () => {});
test('switches to compact mobile navigation when breakpoint is below lg', () => {});
```

测试断言至少包含：
- 桌面端能看到 `role="navigation"` 的 section rail；
- `sidebarFooter` 与 `children` 分区渲染，不和导航项混在一起；
- `navItems=[]` 时展示传入的正式空态；
- 移动端 `visible sections <= 4` 渲染 `Tabs/Segmented`；
- 移动端 `visible sections > 4` 渲染按钮触发的 `Drawer`。

- [x] **Step 2: 运行定向测试，确认骨架尚未存在**

Run: `pnpm --dir web/app test -- src/shared/ui/section-page-layout/_tests/section-page-layout.test.tsx`

Expected: FAIL because `section-page-layout` 模块和导出尚不存在。

- [x] **Step 3: 写出最小共享布局实现**

在 `SectionPageLayout.tsx` 冻结设计稿里的最小 API：

```tsx
export interface SectionNavItem {
  key: string;
  label: string;
  to: string;
  icon?: React.ReactNode;
  group?: string;
  visible?: boolean;
}

export interface SectionPageLayoutProps {
  pageTitle?: React.ReactNode;
  pageDescription?: React.ReactNode;
  navItems: SectionNavItem[];
  activeKey: string;
  children: React.ReactNode;
  sidebarFooter?: React.ReactNode;
  emptyState?: React.ReactNode;
}
```

实现要求：

```tsx
const visibleItems = navItems.filter((item) => item.visible !== false);
const compactMode = !Grid.useBreakpoint().lg;
const compactVariant = visibleItems.length <= 4 ? 'tabs' : 'drawer';
```

- `SectionPageLayout` 只负责页级标题、二级导航骨架、内容区宽度、空态和响应式切换。
- `SectionSidebarNav` 只负责把 `navItems` + `activeKey` 映射成 `Menu` / `Tabs` / `Drawer` 中的同一份导航真值。
- `section-page-layout.css` 统一收口以下类：
  - `.section-page-layout`
  - `.section-page-layout__rail`
  - `.section-page-layout__content`
  - `.section-page-layout__nav`
  - `.section-page-layout__mobile-tabs`
  - `.section-page-layout__drawer-trigger`
- 内容宽度沿用设计稿要求：`min(1200px, calc(100% - 48px))`，不要在 feature 页面里重复计算。

- [x] **Step 4: 重跑共享布局测试**

Run: `pnpm --dir web/app test -- src/shared/ui/section-page-layout/_tests/section-page-layout.test.tsx`

Expected: PASS

- [x] **Step 5: 提交共享壳层基础设施**

```bash
git add web/app/src/shared/ui/section-page-layout
git commit -m "feat(web): add shared section page layout"
```

### Task 2: 冻结 section 定义并接上静态子路由

**Files:**
- Create: `web/app/src/features/me/lib/me-sections.tsx`
- Create: `web/app/src/features/settings/lib/settings-sections.tsx`
- Create: `web/app/src/routes/_tests/section-shell-routing.test.tsx`
- Modify: `web/app/src/app/router.tsx`
- Modify: `web/app/src/routes/route-config.ts`
- Modify: `web/app/src/routes/_tests/route-config.test.ts`

- [x] **Step 1: 先写路由级失败测试**

在 `web/app/src/routes/_tests/section-shell-routing.test.tsx` 中新增三组回归：

```tsx
test('redirects /me to /me/profile', async () => {});
test('redirects /settings to the first visible section', async () => {});
test('redirects an invisible settings section to the first visible section', async () => {});
```

同时把 `route-config.test.ts` 补成对子路径的显式锁定：

```ts
expect(getSelectedRouteId('/settings/docs')).toBe('settings');
expect(getSelectedRouteId('/settings/roles')).toBe('settings');
expect(getSelectedRouteId('/me/profile')).toBe('me');
expect(getSelectedRouteId('/me/security')).toBe('me');
```

- [x] **Step 2: 跑路由测试，确认深链目前不可用**

Run: `pnpm --dir web/app test -- src/routes/_tests/route-config.test.ts src/routes/_tests/section-shell-routing.test.tsx`

Expected: FAIL because router 目前只注册 `/me` 与 `/settings` 父路径，深链路径会落到 `404` 或停留在页内状态。

- [x] **Step 3: 建立 feature 自有 section catalog，并把 router 改成静态子路由**

`web/app/src/features/me/lib/me-sections.tsx` 先冻结：

```tsx
export type MeSectionKey = 'profile' | 'security';

export function getMeSections(): SectionNavItem[] {
  return [
    { key: 'profile', label: '个人信息', to: '/me/profile', icon: <UserOutlined /> },
    { key: 'security', label: '安全设置', to: '/me/security', icon: <KeyOutlined /> }
  ];
}
```

`web/app/src/features/settings/lib/settings-sections.tsx` 冻结：

```tsx
export type SettingsSectionKey = 'docs' | 'members' | 'roles';

export function getVisibleSettingsSections(input: {
  isRoot: boolean;
  permissions: string[];
}): SectionNavItem[] {
  return [
    { key: 'docs', label: 'API 文档', to: '/settings/docs', visible: true },
    { key: 'members', label: '用户管理', to: '/settings/members', visible: input.isRoot || input.permissions.includes('user.view.all') },
    { key: 'roles', label: '权限管理', to: '/settings/roles', visible: input.isRoot || input.permissions.includes('role_permission.view.all') }
  ].filter((item) => item.visible !== false);
}
```

把 `app/router.tsx` 改成静态注册的父子路由：

```tsx
const settingsIndexRoute = createRoute({ path: '/settings', component: () => <RouteGuard routeId="settings"><SettingsPage /></RouteGuard> });
const settingsDocsRoute = createRoute({ path: '/settings/docs', component: () => <RouteGuard routeId="settings"><SettingsPage requestedSectionKey="docs" /></RouteGuard> });
const settingsMembersRoute = createRoute({ path: '/settings/members', component: () => <RouteGuard routeId="settings"><SettingsPage requestedSectionKey="members" /></RouteGuard> });
const settingsRolesRoute = createRoute({ path: '/settings/roles', component: () => <RouteGuard routeId="settings"><SettingsPage requestedSectionKey="roles" /></RouteGuard> });
```

`/me` 同理，保留 `RouteGuard routeId="me"`，不要把二级 section 权限判断塞回通用 `RouteGuard`。

把 `route-config.ts` 的 matcher 收口为：

```ts
selectedMatchers: [
  (pathname) => pathname === '/settings' || pathname.startsWith('/settings/'),
];
```

`/me` 同理。

- [x] **Step 4: 重跑路由测试**

Run: `pnpm --dir web/app test -- src/routes/_tests/route-config.test.ts src/routes/_tests/section-shell-routing.test.tsx`

Expected: PASS

- [x] **Step 5: 提交 section catalog 与静态子路由**

```bash
git add web/app/src/app/router.tsx web/app/src/routes/route-config.ts web/app/src/routes/_tests
git add web/app/src/features/me/lib/me-sections.tsx web/app/src/features/settings/lib/settings-sections.tsx
git commit -m "feat(web): add section routes for me and settings"
```

### Task 3: 迁移 SettingsPage 到共享壳层

**Files:**
- Modify: `web/app/src/features/settings/pages/SettingsPage.tsx`
- Modify: `web/app/src/features/settings/_tests/settings-page.test.tsx`
- Delete After Migration: `web/app/src/features/settings/components/SettingsSidebar.tsx`

- [x] **Step 1: 先把 Settings 页面测试改成真实路由行为**

把 `settings-page.test.tsx` 从“直接渲染页面组件 + 页内 state”改成“带 router 的深链场景”：

```tsx
test('redirects /settings to /settings/docs for any authenticated user', async () => {});
test('renders /settings/members when user.view.all is present', async () => {});
test('redirects /settings/members to /settings/docs when the section is invisible', async () => {});
```

断言至少包含：
- `API 文档` iframe 在 `/settings/docs` 出现；
- `user.view.all` 存在时可进入 `/settings/members`；
- 只有 `role_permission.view.all` 时直达 `/settings/members` 会回到 `/settings/docs`；
- `canManageMembers` / `canManageRoles` 继续只控制面板内操作，不改变 section 可见性。

- [x] **Step 2: 运行 Settings 定向测试，确认当前实现仍依赖页内 state**

Run: `pnpm --dir web/app test -- src/features/settings/_tests/settings-page.test.tsx`

Expected: FAIL because `SettingsPage` 仍使用 `useState(activeSectionKey)`，不会根据静态子路由解析 section。

- [x] **Step 3: 用共享壳层重写 SettingsPage**

把 `SettingsPage.tsx` 改成接收 `requestedSectionKey?: SettingsSectionKey` 的容器：

```tsx
export function SettingsPage({
  requestedSectionKey
}: {
  requestedSectionKey?: SettingsSectionKey;
}) {
  const visibleSections = getVisibleSettingsSections({ isRoot, permissions });
  const fallbackSection = visibleSections[0];

  if (!fallbackSection) {
    return (
      <SectionPageLayout
        pageTitle="设置"
        navItems={[]}
        activeKey=""
        emptyState={<Result status="info" title="当前账号暂无可访问内容" />}
      />
    );
  }

  if (!requestedSectionKey || !visibleSections.some((section) => section.key === requestedSectionKey)) {
    return <Navigate to={fallbackSection.to} replace />;
  }
}
```

继续实现：
- `pageTitle` 固定为 `设置`；
- `pageDescription` 说明这是系统管理域；
- 内容区按 `requestedSectionKey` 渲染 `ApiDocsPanel`、`MemberManagementPanel`、`RolePermissionPanel`；
- `SettingsSidebar.tsx` 若只剩一层薄包装则直接删掉，不要再让 feature 内维护第二套导航组件。

- [x] **Step 4: 重跑 Settings 定向测试**

Run: `pnpm --dir web/app test -- src/features/settings/_tests/settings-page.test.tsx`

Expected: PASS

- [ ] **Step 5: 提交 Settings 迁移**

```bash
git add web/app/src/features/settings/pages/SettingsPage.tsx web/app/src/features/settings/_tests/settings-page.test.tsx
git add -u web/app/src/features/settings/components/SettingsSidebar.tsx
git commit -m "feat(web): migrate settings page to shared shell"
```

### Task 4: 迁移 MePage，并收口 `/me` 样式而不改变视觉基线

**Files:**
- Create: `web/app/src/features/me/pages/me-page.css`
- Modify: `web/app/src/features/me/pages/MePage.tsx`
- Modify: `web/app/src/features/me/components/ProfileForm.tsx`
- Modify: `web/app/src/features/me/components/ChangePasswordForm.tsx`
- Modify: `web/app/src/features/me/_tests/me-page.test.tsx`

- [ ] **Step 1: 先写 `/me` 的失败测试**

把 `me-page.test.tsx` 改成围绕真实路由和共享壳层行为：

```tsx
test('redirects /me to /me/profile', async () => {});
test('does not render sign-out inside the /me sidebar', async () => {});
test('keeps profile update flow working on /me/profile', async () => {});
test('submits password change on /me/security and navigates to /sign-in after success', async () => {});
```

断言重点：
- `/me` 根路径会跳到 `/me/profile`；
- 侧栏只保留 `个人信息` / `安全设置`，没有 `退出登录`；
- `编辑资料` Drawer 行为和资料保存仍工作；
- 密码更新成功后仍清理 session 并跳去 `/sign-in`。

- [ ] **Step 2: 运行 `/me` 定向测试，确认旧结构依赖固定 Sider 与菜单事件**

Run: `pnpm --dir web/app test -- src/features/me/_tests/me-page.test.tsx`

Expected: FAIL because `MePage` 仍在页内维护 `selectedKey`，并把 `退出登录` 混在侧栏导航里。

- [ ] **Step 3: 把 `/me` 切到共享壳层，并把样式搬到最近 owner**

`MePage.tsx` 改成和 `SettingsPage` 同样的容器模式：

```tsx
export function MePage({
  requestedSectionKey
}: {
  requestedSectionKey?: MeSectionKey;
}) {
  const visibleSections = getMeSections();
  const fallbackSection = visibleSections[0];

  if (!requestedSectionKey) {
    return <Navigate to={fallbackSection.to} replace />;
  }
}
```

布局要求：
- `pageTitle="个人资料"`，`pageDescription` 说明该页承载个人资料与安全设置；
- `sidebarFooter` 暂时留空，不要把 `退出登录` 放回去；
- 共享壳层负责 rail、内容宽度和移动端导航；
- `ProfileForm` / `ChangePasswordForm` 继续各自承载 section 级标题。

样式收口要求：

```tsx
<Card className="me-profile-card" ... />
<Button className="me-profile-card__edit" ... />
<Tag className="me-profile-card__status" ... />
```

`me-page.css` 只承载 `/me` feature 私有类：
- `.me-page`
- `.me-profile-card`
- `.me-profile-card__header`
- `.me-profile-card__edit`
- `.me-profile-card__status`
- `.me-security-panel`

把 `MePage.tsx`、`ProfileForm.tsx`、`ChangePasswordForm.tsx` 中与 layout/card/spacing/selected-state 直接相关的 inline style 迁到：
- `section-page-layout.css` 中的共享类；
- `me-page.css` 中的 `/me` 私有类；
- 必要时通过 Ant Design 的 `className` / `styles` slot 精确落点；
- 禁止用无边界 `.ant-*` 后代链兜底。

- [ ] **Step 4: 重跑 `/me` 定向测试**

Run: `pnpm --dir web/app test -- src/features/me/_tests/me-page.test.tsx`

Expected: PASS

- [ ] **Step 5: 提交 `/me` 迁移与样式收口**

```bash
git add web/app/src/features/me/pages/MePage.tsx web/app/src/features/me/pages/me-page.css
git add web/app/src/features/me/components/ProfileForm.tsx web/app/src/features/me/components/ChangePasswordForm.tsx
git add web/app/src/features/me/_tests/me-page.test.tsx
git commit -m "feat(web): migrate me page to shared shell"
```

### Task 5: 刷新 style-boundary 与回归断言

**Files:**
- Modify: `web/app/src/style-boundary/scenario-manifest.json`
- Modify: `web/app/src/features/me/_tests/me-page.test.tsx`
- Modify: `web/app/src/features/settings/_tests/settings-page.test.tsx`
- Modify: `web/app/src/routes/_tests/route-config.test.ts`

- [ ] **Step 1: 先补会失败的样式边界与场景断言**

把 `scenario-manifest.json` 先改出新的影响面与边界断言预期：

```json
{
  "id": "page.settings",
  "impactFiles": [
    "web/app/src/shared/ui/section-page-layout/SectionPageLayout.tsx",
    "web/app/src/shared/ui/section-page-layout/SectionSidebarNav.tsx",
    "web/app/src/shared/ui/section-page-layout/section-page-layout.css",
    "web/app/src/features/settings/pages/SettingsPage.tsx",
    "web/app/src/features/settings/lib/settings-sections.tsx"
  ]
}
```

`page.me` 同理，并额外纳入：
- `web/app/src/features/me/pages/me-page.css`
- `web/app/src/features/me/lib/me-sections.tsx`

边界断言至少新增：
- `page.settings` 上 `.section-page-layout__rail` 的 `display`；
- `page.settings` 上 `.section-page-layout__content` 的 `max-width` 或布局特征；
- `page.me` 上 `.me-profile-card` 的 `border-radius` / `box-shadow`；
- `page.me` 上当前选中导航项的背景色仍为浅绿色语义。

- [ ] **Step 2: 跑 style-boundary 文件校验，确认映射尚未补齐**

Run: `node scripts/node/check-style-boundary.js file web/app/src/features/me/pages/MePage.tsx`

Expected: FAIL or mismatch because共享壳层文件与 `/me` 私有样式文件还未完整进入 `impactFiles`。

- [ ] **Step 3: 完成 manifest 收口并同步修正测试断言**

完成后确保：
- `page.settings` / `page.me` 的 `impactFiles` 覆盖共享模板、feature catalog、page container 和私有样式文件；
- `route-config.test.ts` 明确锁住 `/settings/*` 与 `/me/*` 子路由仍归属一级导航；
- `me-page.test.tsx` / `settings-page.test.tsx` 都只依赖真实路由结果，不再依赖页内 `useState`。

- [ ] **Step 4: 重跑样式边界与关键回归**

Run:

```bash
pnpm --dir web/app test -- src/routes/_tests/route-config.test.ts src/features/settings/_tests/settings-page.test.tsx src/features/me/_tests/me-page.test.tsx
node scripts/node/check-style-boundary.js file web/app/src/features/me/pages/MePage.tsx
node scripts/node/check-style-boundary.js file web/app/src/features/settings/pages/SettingsPage.tsx
node scripts/node/check-style-boundary.js file web/app/src/shared/ui/section-page-layout/SectionPageLayout.tsx
```

Expected: PASS

- [ ] **Step 5: 提交样式边界与回归锁定**

```bash
git add web/app/src/style-boundary/scenario-manifest.json
git add web/app/src/routes/_tests/route-config.test.ts web/app/src/features/settings/_tests/settings-page.test.tsx web/app/src/features/me/_tests/me-page.test.tsx
git commit -m "test(web): refresh shared shell regression coverage"
```

### Task 6: 做全量验证与浏览器视觉回归

**Files:**
- Verify only: `web/`
- Screenshot output: `uploads/2026-04-14-me-shared-shell-regression.png`

- [ ] **Step 1: 运行前端全量验证**

Run:

```bash
pnpm --dir web lint
pnpm --dir web test
pnpm --dir web/app build
```

Expected: PASS

- [ ] **Step 2: 运行最终 style-boundary 文件回归**

Run:

```bash
node scripts/node/check-style-boundary.js file web/app/src/features/me/pages/MePage.tsx
node scripts/node/check-style-boundary.js file web/app/src/features/settings/pages/SettingsPage.tsx
node scripts/node/check-style-boundary.js file web/app/src/shared/ui/section-page-layout/SectionPageLayout.tsx
```

Expected: PASS

- [ ] **Step 3: 启动本地联调环境并做 `/me` 基线截图对比**

Run:

```bash
node scripts/node/dev-up.js
node scripts/node/dev-up.js status
```

Expected:
- Web 在 `http://127.0.0.1:3100`
- API 在 `http://127.0.0.1:7800`

手工浏览器检查步骤：
- 登录后打开 `http://127.0.0.1:3100/me/profile`
- 对照基线 `uploads/image_aionui_1776142647213.png`
- 核对顶部壳层高度、左侧 rail 宽度与浅绿色选中态、页面浅色背景氛围、主卡片宽度/圆角/阴影、头像和字段栅格留白
- 重新截取一张 `/me/profile` 当前实现截图，保存为 `uploads/2026-04-14-me-shared-shell-regression.png`
- 再打开移动端宽度，确认 `/me` 与 `/settings` 的二级导航退化到 `Tabs/Segmented` 或 `Drawer`

- [ ] **Step 4: 提交最终验证结果**

```bash
git add uploads/2026-04-14-me-shared-shell-regression.png
git commit -m "chore(web): verify shared me settings shell regression"
```

## Self-Review

- Spec coverage:
  - 共享二级壳层、最小 API、目录落点由 Task 1 覆盖。
  - `/me/*`、`/settings/*` 静态子路由、父路由重定向、无权限重定向由 Task 2 覆盖。
  - `SettingsPage` 权限可见性与面板迁移由 Task 3 覆盖。
  - `/me` 视觉不退化、sign-out 脱离 sidebar、inline style 收口由 Task 4 覆盖。
  - `style-boundary` manifest、测试、共享文件 `file` 校验由 Task 5 覆盖。
  - 浏览器截图基线回归与全量验证由 Task 6 覆盖。
- Placeholder scan: 已避免 `TODO/TBD/类似 Task N` 之类占位词；每个任务都给了文件、命令和通过标准。
- Consistency: 全文统一使用 `first visible section` 作为无权限跳转规则；一级导航仍是 `settings` / `me`，二级 section 不升级为一级 route id。
