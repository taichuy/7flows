import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';

import { App } from '../App';

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

describe('demo ux regression coverage', () => {
  test('home separates the action queue from recent runs and keeps product-facing copy', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: '工作台' })).toBeInTheDocument();
    expect(screen.queryByText('CURRENT PRODUCT DEMO')).not.toBeInTheDocument();
    expect(screen.queryByText('本轮批判')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent Flow Studio')).not.toBeInTheDocument();
    expect(screen.getByText('行动队列')).toBeInTheDocument();
    expect(screen.getByText('最近运行')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: '进入流程编排' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看子系统接入' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看工具台' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看 权限复核 / own-all matrix' }));

    const dialog = await screen.findByRole('dialog', { name: '权限复核 / own-all matrix' });
    expect(
      within(dialog).getByText('当前权限矩阵里仍有一个角色同时触发 own 与 all 两条授权语义，工作台只保留人工复核入口，不再在首页直接展开矩阵细节。')
    ).toBeInTheDocument();
  });

  test('subsystems page opens a concrete detail drawer from the list', async () => {
    window.history.pushState({}, '', '/subsystems');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '子系统' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看 Growth Portal 详情' }));

    const dialog = await screen.findByRole('dialog', { name: 'Growth Portal' });
    expect(within(dialog).getByText('/embedded/growth-portal')).toBeInTheDocument();
    expect(within(dialog).getByText('Growth Systems')).toBeInTheDocument();
  });

  test('tools page filters the event queue and opens incident review directly', async () => {
    window.history.pushState({}, '', '/tools');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '工具' })).toBeInTheDocument();
    expect(screen.getByText('事件队列')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '待确认' }));
    expect(screen.getByRole('button', { name: '查看 权限矩阵冲突' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看 Webhook 回写超时' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看 权限矩阵冲突' }));

    const dialog = await screen.findByRole('dialog', { name: '权限矩阵冲突' });
    expect(
      within(dialog).getByText('回到设置 / 访问控制，确认 own 与 all 的最终授权口径。')
    ).toBeInTheDocument();
  });

  test('settings uses account and security sections instead of a team placeholder', async () => {
    window.history.pushState({}, '', '/settings');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '安全设置' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '团队' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: '安全设置' }));

    expect(await screen.findByText('密码与会话')).toBeInTheDocument();
    expect(screen.getByText('最近 30 天未出现异常设备登录。')).toBeInTheDocument();
  });
});
