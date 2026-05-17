import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import type { FrontstagePageContent } from '../api/page-content';
import { PageCanvas } from '../components/PageCanvas';

function createPageContent(
  overrides: Partial<FrontstagePageContent> = {}
): FrontstagePageContent {
  return {
    page: {
      id: 'page-1',
      title: 'Landing',
      kind: 'page',
      parentId: null,
      rank: '001000',
      schemaRootUid: 'root-1'
    },
    schema: {
      rootUid: 'root-1',
      payload: {}
    },
    root: {
      uid: 'root-1',
      payload: {}
    },
    ...overrides
  };
}

describe('PageCanvas', () => {
  test('renders a compact loading state before content is available', () => {
    render(<PageCanvas isLoading />);

    expect(screen.getByText('页面内容加载中')).toBeInTheDocument();
    expect(screen.getByText('正在读取页面内容和区块清单。')).toBeInTheDocument();
  });

  test('renders an error state with retry action', () => {
    const onRetry = vi.fn();

    render(<PageCanvas hasError onRetry={onRetry} />);

    expect(screen.getByText('页面内容加载失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('renders an unselected empty state without content', () => {
    render(<PageCanvas content={undefined} />);

    expect(screen.getByText('未选择页面内容')).toBeInTheDocument();
    expect(screen.getByText('选择页面后将显示只读内容画布。')).toBeInTheDocument();
  });

  test('renders empty document diagnostics from normalized page content', () => {
    render(<PageCanvas content={createPageContent()} />);

    expect(screen.getByText('Landing')).toBeInTheDocument();
    expect(screen.getByText('Root root-1')).toBeInTheDocument();
    expect(screen.getByText('0 个区块')).toBeInTheDocument();
    expect(screen.getByText('页面内容为空')).toBeInTheDocument();
  });

  test('renders normalized block list and selected block details', () => {
    render(
      <PageCanvas
        selectedBlockId="cta"
        content={createPageContent({
          root: {
            uid: 'root-1',
            payload: {
              blocks: [
                {
                  id: 'hero',
                  codeRef: 'hero-code',
                  contributionCode: 'official.hero',
                  runtime: { kind: 'iframe', entry: 'blocks/hero.html' },
                  layout: { order: 20, region: 'main' }
                },
                {
                  id: 'cta',
                  code_ref: 'cta-code',
                  contribution_code: 'official.cta',
                  runtime: 'inline',
                  layout: { order: 10, region: 'footer' }
                }
              ]
            }
          }
        })}
      />
    );

    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('cta');
    expect(rows[1]).toHaveTextContent('hero');

    expect(screen.getByText('已选区块')).toBeInTheDocument();
    expect(screen.getByText('official.cta')).toBeInTheDocument();
    expect(screen.getAllByText('inline').length).toBeGreaterThan(0);
    expect(screen.getByText('footer')).toBeInTheDocument();
  });

  test('renders read-only render plan slots with runtime state and fallback reasons', () => {
    render(
      <PageCanvas
        content={createPageContent({
          root: {
            uid: 'root-1',
            payload: {
              blocks: [
                {
                  id: 'legacy',
                  codeRef: 'legacy-code',
                  contributionCode: 'official.legacy',
                  runtime: { kind: 'inline', entry: 'legacy.js' },
                  layout: { order: 20, region: 'footer', span: 6 }
                },
                {
                  id: 'hero',
                  codeRef: 'hero-code',
                  contributionCode: 'official.hero',
                  runtime: { kind: 'iframe', entry: 'blocks/hero.js' },
                  layout: { order: 10, region: 'main', span: 12 }
                }
              ]
            }
          }
        })}
      />
    );

    const slots = within(screen.getByTestId('page-canvas-render-slots'))
      .getAllByRole('button');
    expect(slots).toHaveLength(2);
    expect(slots[0]).toHaveTextContent('hero');
    expect(slots[0]).toHaveTextContent('restricted_js_block');
    expect(slots[0]).toHaveTextContent('可运行，等待运行时接入');
    expect(slots[0]).toHaveTextContent('blocks/hero.js');
    expect(slots[0]).toHaveTextContent('order: 10');
    expect(slots[0]).toHaveTextContent('region: main');
    expect(slots[0]).toHaveTextContent('span: 12');

    expect(slots[1]).toHaveTextContent('legacy');
    expect(slots[1]).toHaveTextContent('placeholder');
    expect(slots[1]).toHaveTextContent('unsupported_runtime');
    expect(slots[1]).toHaveTextContent('legacy.js');
  });

  test('notifies selection changes without persisting content', () => {
    const onSelectBlock = vi.fn();

    render(
      <PageCanvas
        onSelectBlock={onSelectBlock}
        content={createPageContent({
          root: {
            uid: 'root-1',
            payload: {
              blocks: [
                {
                  id: 'hero',
                  codeRef: 'hero-code',
                  contributionCode: 'official.hero',
                  runtime: 'inline'
                }
              ]
            }
          }
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /hero/ }));

    expect(onSelectBlock).toHaveBeenCalledWith('hero');
  });

  test('renders document diagnostics without exposing raw JSON', () => {
    render(
      <PageCanvas
        content={createPageContent({
          root: {
            uid: 'root-1',
            payload: {
              blocks: [{ id: 'hero' }, { id: 'hero' }]
            }
          }
        })}
      />
    );

    const diagnostics = screen.getByTestId('page-canvas-diagnostics');
    expect(
      within(diagnostics).getByText('duplicate_block_id')
    ).toBeInTheDocument();
    expect(within(diagnostics).getAllByText('missing_runtime')).toHaveLength(2);
    expect(diagnostics).not.toHaveTextContent('"blocks"');
  });
});
