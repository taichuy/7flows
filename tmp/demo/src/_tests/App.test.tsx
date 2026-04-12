import {
  fireEvent,
  render,
  screen
} from '@testing-library/react';

import { App } from '../app/App';

describe('workspace demo', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders overview with a single main CTA and workspace focus lanes', async () => {
    render(<App />);

    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Revenue Copilot'
      })
    ).toBeInTheDocument();
    expect(await screen.findByText('Workspace demo')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '进入编排' })
    ).toBeInTheDocument();
    expect(screen.getByText('Workspace pulse')).toBeInTheDocument();
    expect(screen.getAllByText('Approval gate').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: '定位审批断点' })
    ).toBeInTheDocument();
    expect(screen.getByText('当前焦点')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '查看发布面' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '打开 backlog' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '检查 host gap' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '查看 API 契约' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '继续处理等待态' })
    ).not.toBeInTheDocument();
  });

  it('opens the orchestration page from workspace pulse and focuses the approval node', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '定位审批断点' }));

    expect(await screen.findByText('客户问询主流程')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Approval gate' })).toBeInTheDocument();
  });

  it('opens the waiting run drawer from overview focus lanes', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '打开 backlog' }));

    expect(await screen.findByRole('heading', { name: '调用日志' })).toBeInTheDocument();
    expect(await screen.findByText(/为什么停在这里/i)).toBeInTheDocument();
    expect(await screen.findByText(/Checkpoint persisted/i)).toBeInTheDocument();
  });

  it('jumps from overview focus lanes to the published API contract', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '查看发布面' }));

    expect(
      await screen.findByText(/兼容模式只改变 envelope/i)
    ).toBeInTheDocument();
  });

  it('jumps from overview focus lanes to monitoring host gaps', async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '检查 host gap' }));

    expect(
      await screen.findByText(/这里重点是运行健康、state discipline 和 plugin 边界/i)
    ).toBeInTheDocument();
  });
});
