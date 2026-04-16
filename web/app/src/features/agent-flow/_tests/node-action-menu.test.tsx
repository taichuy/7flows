import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { NodeActionMenu } from '../components/detail/NodeActionMenu';

describe('NodeActionMenu', () => {
  test('exposes locate and copy actions only', async () => {
    render(<NodeActionMenu onLocate={vi.fn()} onCopy={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));

    expect(await screen.findByRole('menuitem', { name: '定位节点' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '复制节点' })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: '删除节点' })
    ).not.toBeInTheDocument();
  });
});
