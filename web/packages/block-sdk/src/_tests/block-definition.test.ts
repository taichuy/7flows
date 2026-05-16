import { describe, expect, test, vi } from 'vitest';

import {
  validateBlockUiSchema,
  type BlockContext
} from '../../../page-protocol/src/index';

import {
  defineBlock,
  isBlockDefinition,
  type BlockDefinition
} from '../index';

const blockContext = {
  currentUser: null,
  workspace: { id: 'workspace-1', name: 'Workspace' },
  application: { id: 'application-1', name: 'Application' },
  page: { id: 'page-1', route: '/demo', title: 'Demo' },
  params: {},
  props: {},
  state: {},
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
  ui: { locale: 'en-US', density: 'comfortable' }
} satisfies BlockContext;

describe('defineBlock', () => {
  test('normalizes and freezes a legal block definition without executing user code', () => {
    const render = vi.fn(() => ({
      primitive: 'Text' as const,
      props: { children: 'Ready' }
    }));
    const setup = vi.fn();
    const dispose = vi.fn();

    const block = defineBlock({
      id: 'status-summary',
      title: 'Status summary',
      initialState: { count: 1 },
      setup,
      render,
      dispose
    });

    expect(block).toEqual({
      id: 'status-summary',
      title: 'Status summary',
      initialState: { count: 1 },
      setup,
      render,
      dispose
    });
    expect(Object.isFrozen(block)).toBe(true);
    expect(Object.isFrozen(block.initialState)).toBe(true);
    expect(render).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    expect(isBlockDefinition(block)).toBe(true);
  });

  test('types render as a BlockUiSchema that validates through page-protocol', () => {
    const block: BlockDefinition = defineBlock({
      render(ctx) {
        return {
          primitive: 'Stack',
          children: [
            {
              primitive: 'Text',
              props: { children: ctx.page.title }
            }
          ]
        };
      }
    });

    const view = block.render(blockContext);

    expect(validateBlockUiSchema(view)).toEqual({
      ok: true,
      schema: view,
      errors: []
    });
  });

  test.each([
    ['null definition', null],
    ['missing render', { title: 'Missing render' }],
    ['non-function render', { render: 'Text' }],
    ['non-string id', { id: 42, render: () => ({ primitive: 'Text' }) }],
    ['non-string title', { title: 42, render: () => ({ primitive: 'Text' }) }],
    ['non-function setup', { setup: true, render: () => ({ primitive: 'Text' }) }],
    ['non-function dispose', { dispose: true, render: () => ({ primitive: 'Text' }) }],
    ['unknown capability key', { render: () => ({ primitive: 'Text' }), document: {} }]
  ])('rejects invalid definitions with a stable SDK error: %s', (_label, value) => {
    expect(() => defineBlock(value)).toThrowError(
      expect.objectContaining({
        name: 'BlockDefinitionError',
        code: 'block_definition_invalid'
      })
    );
    expect(isBlockDefinition(value)).toBe(false);
  });

  test('rejects accessor properties without invoking them', () => {
    const renderGetter = vi.fn(() => () => ({ primitive: 'Text' }));
    const definition = Object.defineProperty({}, 'render', {
      enumerable: true,
      get: renderGetter
    });

    expect(() => defineBlock(definition)).toThrowError(
      expect.objectContaining({
        name: 'BlockDefinitionError',
        code: 'block_definition_invalid'
      })
    );
    expect(renderGetter).not.toHaveBeenCalled();
  });

  test('does not expose React, DOM, router, store, query client, fetch, or storage capabilities', () => {
    const block = defineBlock({
      render() {
        return { primitive: 'Text', props: { children: 'No host escape' } };
      }
    });

    expect(Object.keys(block).sort()).toEqual(['render']);
    expect(block).not.toHaveProperty('React');
    expect(block).not.toHaveProperty('document');
    expect(block).not.toHaveProperty('window');
    expect(block).not.toHaveProperty('router');
    expect(block).not.toHaveProperty('store');
    expect(block).not.toHaveProperty('queryClient');
    expect(block).not.toHaveProperty('fetch');
    expect(block).not.toHaveProperty('localStorage');
  });
});
