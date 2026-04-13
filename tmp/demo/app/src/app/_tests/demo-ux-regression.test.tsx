import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';

import { App } from '../App';

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

describe('demo ux regression coverage', () => {
  test('home separates the action queue from recent runs and keeps product-facing copy', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: '工作台' }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.queryByText('CURRENT PRODUCT DEMO')).not.toBeInTheDocument();
    expect(screen.queryByText('本轮批判')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent Flow Studio')).not.toBeInTheDocument();
    expect(screen.getByText('行动队列')).toBeInTheDocument();
    expect(screen.getByText('最近运行')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: '进入流程编排' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看子系统接入' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看工具台' })).toBeInTheDocument();

    expect(screen.queryByText('Growth Systems')).not.toBeInTheDocument();
    expect(screen.queryByText('Platform Ops')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看 权限矩阵复核' }));

    const dialog = await screen.findByRole('dialog', { name: '权限矩阵复核' }, { timeout: 5000 });
    expect(
      within(dialog).getByText('当前权限矩阵里仍有一个角色同时触发 own 与 all 两条授权语义，工作台只保留人工复核入口，不再在首页直接展开矩阵细节。')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('安全团队')).toBeInTheDocument();
  });

  test('home queue actions carry the user into the focused studio governance flow', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '查看 发布回写确认' }));

    const dialog = await screen.findByRole('dialog', { name: '发布回写确认' }, { timeout: 5000 });

    fireEvent.click(within(dialog).getByRole('link', { name: '打开发布闭环' }));

    expect(
      await screen.findByRole('heading', { name: '流程编排' }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByText('当前治理链')).toBeInTheDocument();
    expect(screen.getByText('Webhook 回写超时')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '前往工具台处理事件' })).toBeInTheDocument();
  });

  test('subsystems page uses product-facing names and provides a direct follow-up action', async () => {
    window.history.pushState({}, '', '/subsystems');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '子系统' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '子系统卡片列表' })).toBeInTheDocument();
    expect(screen.queryByText('Growth Portal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看 增长门户 详情' }));

    const dialog = await screen.findByRole('dialog', { name: '增长门户' }, { timeout: 5000 });
    expect(within(dialog).getByText('/embedded/growth-portal')).toBeInTheDocument();
    expect(within(dialog).getByText('增长系统')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '进入接入治理' })).toBeInTheDocument();
  });

  test('tools page filters incidents with localized owners and exposes management routes from detail drawers', async () => {
    window.history.pushState({}, '', '/tools');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '工具' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('事件队列')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '事件卡片列表' })).toBeInTheDocument();
    expect(screen.queryByText('Security')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '待确认' }));
    expect(screen.getByRole('button', { name: '查看 权限矩阵冲突' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看 Webhook 回写超时' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看 权限矩阵冲突' }));

    const dialog = await screen.findByRole('dialog', { name: '权限矩阵冲突' }, { timeout: 5000 });
    expect(
      within(dialog).getByText('回到设置 / 访问控制，确认 own 与 all 的最终授权口径。')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('安全团队')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '前往访问控制' })).toBeInTheDocument();
  });

  test('settings uses account and security sections instead of a team placeholder', async () => {
    window.history.pushState({}, '', '/settings');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '设置' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '安全设置' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '团队' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: '安全设置' }));

    expect(await screen.findByText('密码与会话', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('最近 30 天未出现异常设备登录。')).toBeInTheDocument();
  });

  test('settings can open directly into the access-control governance context', async () => {
    window.history.pushState({}, '', '/settings?section=access&focus=incident-acl');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '设置' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('当前治理关注')).toBeInTheDocument();
    expect(screen.getByText('权限矩阵冲突')).toBeInTheDocument();
    expect(
      screen.getByText('当前有一条发布前阻塞事件直接指向访问控制，需要先统一授权口径。')
    ).toBeInTheDocument();
    expect(screen.getByText('角色矩阵')).toBeInTheDocument();
  });

  test('subsystems can open directly into the focused rollout drawer from governance links', async () => {
    window.history.pushState({}, '', '/subsystems?subsystem=growth-portal&focus=cache-rollout');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '子系统' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('当前同步关注')).toBeInTheDocument();

    const dialog = await screen.findByRole('dialog', { name: '增长门户' }, { timeout: 5000 });
    expect(within(dialog).getByText('确认新版资源包的缓存策略')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '前往工具台跟进缓存窗口' })).toBeInTheDocument();
  });
});
