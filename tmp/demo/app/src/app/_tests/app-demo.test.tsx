import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach } from 'vitest';

import { App } from '../App';

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

test('renders the control-plane shell and current primary navigation', async () => {
  render(<App />);

  expect(await screen.findByText('1Flowse', undefined, { timeout: 5000 })).toBeInTheDocument();
  expect(
    await screen.findByRole('heading', { name: '工作台' }, { timeout: 5000 })
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '打开导航菜单' })).toBeInTheDocument();

  const primaryNavigation = await screen.findByRole(
    'navigation',
    {
      name: 'Primary'
    },
    {
      timeout: 5000
    }
  );

  expect(within(primaryNavigation).getByRole('link', { name: '工作台' })).toBeInTheDocument();
  expect(within(primaryNavigation).getByRole('link', { name: '当前应用' })).toBeInTheDocument();
  expect(within(primaryNavigation).getByRole('link', { name: '工具' })).toBeInTheDocument();
  expect(within(primaryNavigation).getByRole('link', { name: '设置' })).toBeInTheDocument();
  expect(within(primaryNavigation).queryByRole('link', { name: '流程编排' })).not.toBeInTheDocument();

  expect(screen.getByRole('link', { name: '进入当前应用' })).toBeInTheDocument();
  expect(screen.queryByText('CURRENT PRODUCT DEMO')).not.toBeInTheDocument();
  expect(screen.queryByText('1Flowse Bootstrap')).not.toBeInTheDocument();
});

test('opens the mobile navigation drawer with account and shell status context', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: '打开导航菜单' }));

  const dialog = await screen.findByRole('dialog', { name: '控制台导航' }, { timeout: 5000 });

  expect(within(dialog).getByText('增长实验室')).toBeInTheDocument();
  expect(within(dialog).getByText('平台健康 99.94%')).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: /工具/ })).toBeInTheDocument();
});

test('renders the studio route with publish, runtime and state sections and updates the inspector when a node is focused', async () => {
  window.history.pushState({}, '', '/studio');

  render(<App />);

  expect(
    await screen.findByRole('heading', { name: '流程编排' }, { timeout: 5000 })
  ).toBeInTheDocument();
  expect(screen.getAllByText('发布检查').length).toBeGreaterThan(0);
  expect(screen.getByText('运行轨道')).toBeInTheDocument();
  expect(screen.getByText('状态记忆')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /需求汇总/i })).toBeInTheDocument();
  expect(screen.getByText('当前聚焦节点')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /发布网关/i }));

  const inspectorCard = screen.getByRole('region', { name: '当前聚焦节点' });
  expect(
    within(inspectorCard).getByText(
      '负责把已确认流程发布到宿主运行时，并同步更新入口版本。'
    )
  ).toBeInTheDocument();
  expect(screen.getAllByText('/agentflows/publish-check/runs').length).toBeGreaterThan(0);
  expect(screen.getByText('长期记忆：团队发布偏好')).toBeInTheDocument();
});

test('renders the application overview route as the stable app landing page before studio', async () => {
  window.history.pushState({}, '', '/application');

  render(<App />);

  expect(await screen.findByRole('heading', { name: '应用概览' }, { timeout: 5000 })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: '当前应用工作区' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '进入编排' })).toBeInTheDocument();
  expect(screen.queryByText('当前交付物')).not.toBeInTheDocument();
});

test('renders the tools route and opens an incident drawer from the event queue', async () => {
  window.history.pushState({}, '', '/tools');

  render(<App />);

  expect(await screen.findByRole('heading', { name: '工具' }, { timeout: 5000 })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: '事件卡片列表' })).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText('搜索事件、负责人或治理域'), {
    target: { value: '安全' }
  });

  fireEvent.click(screen.getByRole('button', { name: '查看 权限矩阵冲突' }));

  const dialog = await screen.findByRole('dialog', { name: '权限矩阵冲突' }, { timeout: 5000 });
  expect(
    within(dialog).getByText('回到设置 / 访问控制，确认 own 与 all 的最终授权口径。')
  ).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: '前往访问控制' })).toBeInTheDocument();
});

test('renders the settings route and switches to access control content', async () => {
  window.history.pushState({}, '', '/settings');

  render(<App />);

  expect(await screen.findByRole('heading', { name: '设置' }, { timeout: 5000 })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('menuitem', { name: '访问控制' }));

  expect(await screen.findByText('角色矩阵')).toBeInTheDocument();
  expect(screen.getByText('平台负责人')).toBeInTheDocument();
});
