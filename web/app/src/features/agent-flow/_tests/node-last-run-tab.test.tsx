import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { NodeLastRunTab } from '../components/detail/tabs/NodeLastRunTab';

describe('NodeLastRunTab', () => {
  test('renders summary, io and metadata shells without faking runtime values', () => {
    render(<NodeLastRunTab />);

    expect(screen.getByText('运行摘要')).toBeInTheDocument();
    expect(screen.getByText('节点输入输出')).toBeInTheDocument();
    expect(screen.getByText('元数据')).toBeInTheDocument();
    expect(screen.getByText('当前版本暂未接入运行数据')).toBeInTheDocument();
  });
});
