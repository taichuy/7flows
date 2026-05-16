import { describe, expect, test, vi } from 'vitest';

import type { BlockContext } from '@1flowbase/page-protocol';

import {
  evaluateJsBlockSource,
  renderJsBlockSource,
  type JsBlockInjectedModuleMap
} from '../index';

const blockSkeleton = `
import { defineBlock } from '@1flowbase/block-sdk';
import { Card, Space, Typography } from '@1flowbase/antd-facade';

export default defineBlock({
  async render(ctx) {
    return Card({
      children: Space({
        children: [
          Typography.Text({ children: ctx.props.title }),
          ctx.state.error
            ? Typography.Text({ children: ctx.state.error })
            : null
        ]
      })
    });
  }
});
`;

function createContext(
  overrides: Partial<BlockContext> = {}
): BlockContext {
  return {
    currentUser: { id: 'user-1', displayName: 'Ada' },
    workspace: { id: 'workspace-1', name: 'Workspace' },
    application: { id: 'app-1', name: 'Application' },
    page: { id: 'page-1', route: '/frontstage/workspace-1/page-1' },
    params: {},
    props: { title: 'Ready' },
    state: { error: null },
    patch: vi.fn(),
    data: {
      query: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    actions: {
      invoke: vi.fn()
    },
    events: {
      emit: vi.fn()
    },
    theme: { mode: 'light', tokens: {} },
    ui: { locale: 'zh-CN', density: 'comfortable' },
    ...overrides
  };
}

function createModules(
  overrides: JsBlockInjectedModuleMap = {}
): JsBlockInjectedModuleMap {
  const text = (input: { children?: unknown; props?: { children?: unknown } }) => ({
    primitive: 'Text',
    props: { children: input.props?.children ?? input.children }
  });
  const stack = (input: { children?: unknown }) => ({
    primitive: 'Stack',
    children: Array.isArray(input.children)
      ? input.children.filter(Boolean)
      : input.children
        ? [input.children]
        : []
  });

  return {
    '@1flowbase/block-sdk': {
      defineBlock(definition: unknown) {
        return definition;
      }
    },
    '@1flowbase/antd-facade': {
      Card: stack,
      Space: stack,
      Typography: {
        Text: text
      },
      Text: text
    },
    ...overrides
  };
}

describe('JS block source evaluator', () => {
  test('evaluates and renders a transformed blank JS block skeleton through injected modules', async () => {
    const result = await renderJsBlockSource({
      source: blockSkeleton,
      modules: createModules(),
      context: createContext()
    });

    expect(result).toMatchObject({
      ok: true,
      schema: {
        primitive: 'Stack',
        children: [
          {
            primitive: 'Stack',
            children: [
              {
                primitive: 'Text',
                props: { children: 'Ready' }
              }
            ]
          }
        ]
      }
    });
  });

  test('evaluates a compiled source object without re-transforming it', () => {
    const first = evaluateJsBlockSource({
      source: `
import { defineBlock } from '@1flowbase/block-sdk';

export default defineBlock({
  render() {
    return { primitive: 'Text', props: { children: 'Ready' } };
  }
});
`,
      modules: createModules()
    });

    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = evaluateJsBlockSource({
      source: first.compiledSource,
      modules: createModules()
    });

    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.compiledSource).toBe(first.compiledSource);
    expect(second.block.render(createContext())).toEqual({
      primitive: 'Text',
      props: { children: 'Ready' }
    });
  });

  test.each([
    [
      'missing block sdk module',
      { '@1flowbase/block-sdk': undefined },
      'modules.@1flowbase/block-sdk'
    ],
    [
      'missing facade module',
      { '@1flowbase/antd-facade': undefined },
      'modules.@1flowbase/antd-facade'
    ],
    [
      'missing defineBlock binding',
      { '@1flowbase/block-sdk': {} },
      'modules.@1flowbase/block-sdk.defineBlock'
    ],
    [
      'missing facade binding',
      { '@1flowbase/antd-facade': { Card: vi.fn(), Space: vi.fn() } },
      'modules.@1flowbase/antd-facade.Typography'
    ]
  ] as const)(
    'returns a stable runtime error for %s',
    async (_label, moduleOverrides, path) => {
      const result = await renderJsBlockSource({
        source: blockSkeleton,
        modules: createModules(moduleOverrides),
        context: createContext()
      });

      expect(result).toMatchObject({
        ok: false,
        error: {
          kind: 'runtime_error',
          errors: [{ code: 'runtime_error', path }]
        }
      });
    }
  );

  test('returns source policy failure when transform rejects the source', async () => {
    const result = await renderJsBlockSource({
      source: "import React from 'react';\nexport default {};",
      modules: createModules(),
      context: createContext()
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'source_policy_failed',
        errors: [{ code: 'import_denied' }]
      }
    });
  });

  test('returns runtime_error when the default export is not a block definition', () => {
    const result = evaluateJsBlockSource({
      source: `
import { defineBlock } from '@1flowbase/block-sdk';

export default defineBlock({ title: 'Missing render' });
`,
      modules: createModules()
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'runtime_error',
        errors: [{ path: 'source.defaultExport' }]
      }
    });
  });

  test('returns runtime_error when render throws', async () => {
    const result = await renderJsBlockSource({
      source: `
import { defineBlock } from '@1flowbase/block-sdk';

export default defineBlock({
  render() {
    throw new Error('render failed');
  }
});
`,
      modules: createModules(),
      context: createContext()
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'runtime_error',
        errors: [{ path: 'runtime.render' }]
      }
    });
  });

  test('returns schema_invalid when render returns an invalid UI schema', async () => {
    const result = await renderJsBlockSource({
      source: `
import { defineBlock } from '@1flowbase/block-sdk';

export default defineBlock({
  render() {
    return { primitive: 'Unknown' };
  }
});
`,
      modules: createModules(),
      context: createContext()
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'schema_invalid',
        errors: [{ code: 'schema_invalid', path: 'root.primitive' }]
      }
    });
  });
});
