import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { DebugComposer } from '../../components/debug-console/conversation/DebugComposer';

describe('DebugComposer', () => {
  test('submits by button click and Enter key when not running', () => {
    const handleSubmit = vi.fn();

    render(
      <DebugComposer
        disabled={false}
        submitting={false}
        stopping={false}
        value="你好？"
        onChange={vi.fn()}
        onStop={vi.fn()}
        onSubmit={handleSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '发送调试消息' }));
    expect(screen.getByText('功能已开启')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByPlaceholderText('和 Bot 聊天'), {
      key: 'Enter',
      code: 'Enter'
    });

    expect(handleSubmit).toHaveBeenCalledTimes(2);
  });

  test('shows stop action while submitting and does not submit on Enter', () => {
    const handleSubmit = vi.fn();
    const handleStop = vi.fn();

    const { container } = render(
      <DebugComposer
        disabled={true}
        submitting={true}
        stopping={false}
        value=""
        onChange={vi.fn()}
        onStop={handleStop}
        onSubmit={handleSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '终止调试运行' }));
    fireEvent.keyDown(screen.getByPlaceholderText('和 Bot 聊天'), {
      key: 'Enter',
      code: 'Enter'
    });

    expect(container.querySelector('.anticon-close-circle')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '终止调试运行' })
    ).toHaveClass('agent-flow-editor__debug-composer-stop');
    expect(handleStop).toHaveBeenCalledTimes(1);
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  test('disables stop action while stopping', () => {
    const handleStop = vi.fn();

    render(
      <DebugComposer
        disabled={true}
        submitting={true}
        stopping={true}
        value=""
        onChange={vi.fn()}
        onStop={handleStop}
        onSubmit={vi.fn()}
      />
    );

    const stopButton = screen.getByRole('button', {
      name: '正在终止调试运行'
    });
    expect(stopButton).toBeDisabled();
    fireEvent.click(stopButton);
    expect(handleStop).not.toHaveBeenCalled();
  });
});
