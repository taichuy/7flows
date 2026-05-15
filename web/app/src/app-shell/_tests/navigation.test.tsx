import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { Navigation } from '../Navigation';

describe('Navigation', () => {
  test('renders primary console navigation and keeps settings out of the primary rail', async () => {
    render(<Navigation pathname="/embedded-apps" useRouterLinks={false} />);

    const nav = await screen.findByRole('navigation', { name: 'Primary' });

    expect(within(nav).getByRole('link', { name: '工作台' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: '前台' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: '子系统' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: '工具' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: '设置' })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '子系统', current: 'page' })).toBeInTheDocument();
  });
});
