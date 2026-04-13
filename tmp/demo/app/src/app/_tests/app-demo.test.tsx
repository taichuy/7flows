import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach } from 'vitest';

import { App } from '../App';

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

test('renders the control-plane shell and current primary navigation', async () => {
  render(<App />);

  expect(await screen.findByText('1Flowse')).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '打开导航菜单' })).toBeInTheDocument();

  const primaryNavigation = await screen.findByRole('navigation', {
    name: 'Primary'
  });

  expect(within(primaryNavigation).getByRole('link', { name: '工作台' })).toBeInTheDocument();
  expect(within(primaryNavigation).getByRole('link', { name: '子系统' })).toBeInTheDocument();
  expect(within(primaryNavigation).getByRole('link', { name: '工具' })).toBeInTheDocument();
  expect(within(primaryNavigation).getByRole('link', { name: '设置' })).toBeInTheDocument();

  expect(screen.getByRole('link', { name: '进入流程编排' })).toBeInTheDocument();
  expect(screen.queryByText('CURRENT PRODUCT DEMO')).not.toBeInTheDocument();
  expect(screen.queryByText('1Flowse Bootstrap')).not.toBeInTheDocument();
});

test('opens the mobile navigation drawer with account and shell status context', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: '打开导航菜单' }));

  const dialog = await screen.findByRole('dialog', { name: '控制台导航' });

  expect(within(dialog).getByText('Growth Lab')).toBeInTheDocument();
  expect(within(dialog).getByText('平台健康 99.94%')).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: /工具/ })).toBeInTheDocument();
});

test('renders the studio route and updates the inspector when a node is focused', async () => {
  window.history.pushState({}, '', '/studio');

  render(<App />);

  expect(await screen.findByRole('heading', { name: '流程编排' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /需求汇总/i })).toBeInTheDocument();
  expect(screen.getByText('当前聚焦节点')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /发布网关/i }));

  expect(
    await screen.findByText('负责把已确认流程发布到宿主运行时，并同步更新入口版本。')
  ).toBeInTheDocument();
});

test('renders the tools route and opens an incident drawer from the event queue', async () => {
  window.history.pushState({}, '', '/tools');

  render(<App />);

  expect(await screen.findByRole('heading', { name: '工具' })).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText('搜索事件或负责人'), {
    target: { value: '权限' }
  });

  fireEvent.click(screen.getByRole('button', { name: '查看 权限矩阵冲突' }));

  expect(await screen.findByRole('dialog', { name: '权限矩阵冲突' })).toBeInTheDocument();
  expect(
    screen.getByText('同一角色同时命中 own 与 all 两类授权，需要回到访问控制面板重新确认范围。')
  ).toBeInTheDocument();
});

test('renders the settings route and switches to access control content', async () => {
  window.history.pushState({}, '', '/settings');

  render(<App />);

  expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('menuitem', { name: '访问控制' }));

  expect(await screen.findByText('角色矩阵')).toBeInTheDocument();
  expect(screen.getByText('平台负责人')).toBeInTheDocument();
});
