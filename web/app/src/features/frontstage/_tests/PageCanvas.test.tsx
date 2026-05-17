import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import type { FrontstagePageContent } from '../api/page-content';
import { PageCanvas } from '../components/PageCanvas';
import type { FrontstagePageCanvasRuntimeSourceState } from '../lib/page-canvas/runtime-source';
import type { FrontstagePageCanvasRuntimeRunPlanState } from '../lib/page-canvas/runtime-run-plan';

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

  test('renders block code read status from runtime source state per render slot', () => {
    const runtimeSourceState = {
      workspaceId: 'workspace-1',
      pageId: 'page-1',
      sources: [
        {
          status: 'ready',
          blockId: 'ready',
          sourceIndex: 0,
          slotIndex: 0,
          codeRef: 'ready-code'
        },
        {
          status: 'loading',
          blockId: 'loading',
          sourceIndex: 1,
          slotIndex: 1,
          codeRef: 'loading-code'
        },
        {
          status: 'missing',
          blockId: 'missing',
          sourceIndex: 2,
          slotIndex: 2,
          codeRef: 'missing-code',
          message: 'Block code is empty for missing-code.'
        },
        {
          status: 'failed',
          blockId: 'failed',
          sourceIndex: 3,
          slotIndex: 3,
          codeRef: 'failed-code',
          error: { message: 'read failed' }
        },
        {
          status: 'skipped',
          blockId: 'legacy',
          sourceIndex: 4,
          slotIndex: 4,
          codeRef: 'legacy-code',
          fallbackReasons: [
            {
              code: 'unsupported_runtime',
              path: 'blocks.4.runtime.kind',
              message: 'Unsupported runtime.'
            }
          ]
        }
      ]
    } as FrontstagePageCanvasRuntimeSourceState;

    render(
      <PageCanvas
        runtimeSourceState={runtimeSourceState}
        content={createPageContent({
          root: {
            uid: 'root-1',
            payload: {
              blocks: [
                {
                  id: 'ready',
                  codeRef: 'ready-code',
                  contributionCode: 'official.ready',
                  runtime: { kind: 'iframe', entry: 'blocks/ready.js' },
                  layout: { order: 0, region: 'main' }
                },
                {
                  id: 'loading',
                  codeRef: 'loading-code',
                  contributionCode: 'official.loading',
                  runtime: { kind: 'iframe', entry: 'blocks/loading.js' },
                  layout: { order: 1, region: 'main' }
                },
                {
                  id: 'missing',
                  codeRef: 'missing-code',
                  contributionCode: 'official.missing',
                  runtime: { kind: 'iframe', entry: 'blocks/missing.js' },
                  layout: { order: 2, region: 'main' }
                },
                {
                  id: 'failed',
                  codeRef: 'failed-code',
                  contributionCode: 'official.failed',
                  runtime: { kind: 'iframe', entry: 'blocks/failed.js' },
                  layout: { order: 3, region: 'main' }
                },
                {
                  id: 'legacy',
                  codeRef: 'legacy-code',
                  contributionCode: 'official.legacy',
                  runtime: { kind: 'inline', entry: 'legacy.js' },
                  layout: { order: 4, region: 'footer' }
                }
              ]
            }
          }
        })}
      />
    );

    const slots = within(screen.getByTestId('page-canvas-render-slots'))
      .getAllByRole('button');

    expect(slots[0]).toHaveTextContent('ready');
    expect(slots[0]).toHaveTextContent('代码已就绪');
    expect(slots[1]).toHaveTextContent('loading');
    expect(slots[1]).toHaveTextContent('代码读取中');
    expect(slots[2]).toHaveTextContent('missing');
    expect(slots[2]).toHaveTextContent('代码缺失');
    expect(slots[3]).toHaveTextContent('failed');
    expect(slots[3]).toHaveTextContent('代码读取失败');
    expect(slots[4]).toHaveTextContent('legacy');
    expect(slots[4]).toHaveTextContent('跳过运行');
    expect(slots[4]).toHaveTextContent('unsupported_runtime');
  });

  test('renders runtime run plan status per matched render slot while keeping code status', () => {
    const runtimeSourceState = {
      workspaceId: 'workspace-1',
      pageId: 'page-1',
      sources: [
        {
          status: 'ready',
          blockId: 'ready',
          sourceIndex: 0,
          slotIndex: 0,
          codeRef: 'ready-code'
        },
        {
          status: 'loading',
          blockId: 'loading',
          sourceIndex: 1,
          slotIndex: 1,
          codeRef: 'loading-code'
        },
        {
          status: 'ready',
          blockId: 'catalog-missing',
          sourceIndex: 2,
          slotIndex: 2,
          codeRef: 'catalog-missing-code'
        },
        {
          status: 'ready',
          blockId: 'rejected',
          sourceIndex: 3,
          slotIndex: 3,
          codeRef: 'rejected-code'
        }
      ]
    } as FrontstagePageCanvasRuntimeSourceState;
    const runtimeRunPlanState = {
      workspaceId: 'workspace-1',
      pageId: 'page-1',
      items: [
        {
          status: 'run_plan_ready',
          blockId: 'ready',
          slotIndex: 0,
          codeRef: 'ready-code'
        },
        {
          status: 'source_not_ready',
          blockId: 'loading',
          slotIndex: 1,
          codeRef: 'loading-code',
          reason: {
            code: 'source_not_ready',
            path: 'sources.1.status',
            message: 'waiting for block code'
          }
        },
        {
          status: 'catalog_missing',
          blockId: 'catalog-missing',
          slotIndex: 2,
          codeRef: 'catalog-missing-code',
          reason: {
            code: 'catalog_missing',
            path: 'catalogEntries',
            message: 'missing catalog'
          }
        },
        {
          status: 'rejected',
          blockId: 'rejected',
          slotIndex: 3,
          codeRef: 'rejected-code',
          rejection: {
            ok: false,
            code: 'missing_limits',
            path: 'limits',
            message: 'missing limits'
          }
        }
      ]
    } as FrontstagePageCanvasRuntimeRunPlanState;

    render(
      <PageCanvas
        runtimeSourceState={runtimeSourceState}
        runtimeRunPlanState={runtimeRunPlanState}
        content={createPageContent({
          root: {
            uid: 'root-1',
            payload: {
              blocks: [
                {
                  id: 'ready',
                  codeRef: 'ready-code',
                  contributionCode: 'official.ready',
                  runtime: { kind: 'iframe', entry: 'blocks/ready.js' },
                  layout: { order: 0, region: 'main' }
                },
                {
                  id: 'loading',
                  codeRef: 'loading-code',
                  contributionCode: 'official.loading',
                  runtime: { kind: 'iframe', entry: 'blocks/loading.js' },
                  layout: { order: 1, region: 'main' }
                },
                {
                  id: 'catalog-missing',
                  codeRef: 'catalog-missing-code',
                  contributionCode: 'official.catalog-missing',
                  runtime: {
                    kind: 'iframe',
                    entry: 'blocks/catalog-missing.js'
                  },
                  layout: { order: 2, region: 'main' }
                },
                {
                  id: 'rejected',
                  codeRef: 'rejected-code',
                  contributionCode: 'official.rejected',
                  runtime: { kind: 'iframe', entry: 'blocks/rejected.js' },
                  layout: { order: 3, region: 'main' }
                }
              ]
            }
          }
        })}
      />
    );

    const slots = within(screen.getByTestId('page-canvas-render-slots'))
      .getAllByRole('button');

    expect(slots[0]).toHaveTextContent('ready');
    expect(slots[0]).toHaveTextContent('代码已就绪');
    expect(slots[0]).toHaveTextContent('运行计划已就绪');
    expect(slots[1]).toHaveTextContent('loading');
    expect(slots[1]).toHaveTextContent('代码读取中');
    expect(slots[1]).toHaveTextContent('等待代码状态');
    expect(slots[2]).toHaveTextContent('catalog-missing');
    expect(slots[2]).toHaveTextContent('代码已就绪');
    expect(slots[2]).toHaveTextContent('Catalog 未匹配');
    expect(slots[3]).toHaveTextContent('rejected');
    expect(slots[3]).toHaveTextContent('代码已就绪');
    expect(slots[3]).toHaveTextContent('运行计划失败');
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
