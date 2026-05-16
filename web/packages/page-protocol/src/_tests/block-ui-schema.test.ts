import { describe, expect, test } from 'vitest';

import {
  BLOCK_CONTEXT_KEYS,
  BLOCK_RUNTIME_ERROR_CODES,
  BLOCK_UI_PRIMITIVES,
  validateBlockUiSchema
} from '../index';

const expectedPrimitives = [
  'Stack',
  'Inline',
  'Grid',
  'Divider',
  'Text',
  'Title',
  'Caption',
  'Badge',
  'Table',
  'Descriptions',
  'Empty',
  'Alert',
  'Form',
  'FormItem',
  'Input',
  'Textarea',
  'Select',
  'Checkbox',
  'Switch',
  'DatePicker',
  'NumberInput',
  'Button',
  'IconButton',
  'Modal'
] as const;

const expectedErrorCodes = [
  'import_denied',
  'syntax_invalid',
  'transform_failed',
  'runtime_timeout',
  'runtime_error',
  'schema_invalid',
  'query_denied',
  'create_denied',
  'update_denied',
  'delete_denied',
  'action_denied',
  'event_denied'
] as const;

function deepSchema(depth: number): unknown {
  let node: unknown = { primitive: 'Text', props: { children: 'leaf' } };

  for (let index = 0; index < depth; index += 1) {
    node = { primitive: 'Stack', children: [node] };
  }

  return node;
}

describe('block UI schema protocol', () => {
  test('exports the first controlled primitive and error code sets', () => {
    expect(BLOCK_UI_PRIMITIVES).toEqual(expectedPrimitives);
    expect(BLOCK_RUNTIME_ERROR_CODES).toEqual(expectedErrorCodes);
  });

  test('exports only the minimal BlockContext surface keys', () => {
    expect(BLOCK_CONTEXT_KEYS).toEqual([
      'currentUser',
      'workspace',
      'application',
      'page',
      'params',
      'props',
      'state',
      'patch',
      'data',
      'actions',
      'events',
      'theme',
      'ui'
    ]);
    expect(BLOCK_CONTEXT_KEYS).not.toContain('React');
    expect(BLOCK_CONTEXT_KEYS).not.toContain('antd');
    expect(BLOCK_CONTEXT_KEYS).not.toContain('router');
    expect(BLOCK_CONTEXT_KEYS).not.toContain('store');
    expect(BLOCK_CONTEXT_KEYS).not.toContain('queryClient');
    expect(BLOCK_CONTEXT_KEYS).not.toContain('window');
    expect(BLOCK_CONTEXT_KEYS).not.toContain('document');
    expect(BLOCK_CONTEXT_KEYS).not.toContain('fetch');
    expect(BLOCK_CONTEXT_KEYS).not.toContain('storage');
  });

  test('accepts a valid schema with controlled primitives and style tokens', () => {
    const schema = {
      primitive: 'Stack',
      key: 'root',
      style: {
        spacing: { padding: 'space.4', gap: 'space.2' },
        color: { background: 'surface.default', text: 'text.primary' },
        typography: { align: 'left', fontWeight: 'medium' },
        border: { width: 'border.1', color: 'border.default' },
        radius: { all: 'radius.2' },
        layout: { width: 'full' }
      },
      children: expectedPrimitives.map((primitive) => ({
        primitive,
        props: { children: primitive }
      }))
    };

    expect(validateBlockUiSchema(schema)).toEqual({
      ok: true,
      schema,
      errors: []
    });
  });

  test('rejects an unknown primitive with a structured schema error', () => {
    const result = validateBlockUiSchema({
      primitive: 'NativeTrustedBlock'
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      code: 'schema_invalid',
      path: 'root.primitive'
    });
  });

  test('rejects arbitrary css keys outside the style whitelist', () => {
    const result = validateBlockUiSchema({
      primitive: 'Text',
      style: { position: 'absolute' }
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      code: 'schema_invalid',
      path: 'root.style.position'
    });
  });

  test('rejects schemas that exceed depth or node budgets', () => {
    const tooDeep = validateBlockUiSchema(deepSchema(9));
    expect(tooDeep.ok).toBe(false);
    expect(tooDeep.errors[0]).toMatchObject({
      code: 'schema_invalid',
      path: expect.stringContaining('children')
    });

    const tooLarge = validateBlockUiSchema(
      {
        primitive: 'Stack',
        children: [
          { primitive: 'Text' },
          { primitive: 'Text' },
          { primitive: 'Text' },
          { primitive: 'Text' }
        ]
      },
      { maxNodes: 4 }
    );
    expect(tooLarge.ok).toBe(false);
    expect(tooLarge.errors[0]).toMatchObject({
      code: 'schema_invalid'
    });
  });

  test.each([
    ['query', 'query_denied'],
    ['create', 'create_denied'],
    ['update', 'update_denied'],
    ['delete', 'delete_denied']
  ] as const)('rejects denied data permission marker %s', (permission, code) => {
    const result = validateBlockUiSchema(
      {
        primitive: 'Table',
        permissions: { data: [permission] }
      },
      { allowedDataPermissions: [] }
    );

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      code,
      path: 'root.permissions.data[0]'
    });
  });

  test('rejects denied action and event permission markers', () => {
    const actionResult = validateBlockUiSchema(
      {
        primitive: 'Button',
        permissions: { actions: ['delete-record'] }
      },
      { allowedActions: ['save-record'] }
    );
    expect(actionResult.ok).toBe(false);
    expect(actionResult.errors[0]).toMatchObject({
      code: 'action_denied',
      path: 'root.permissions.actions[0]'
    });

    const eventResult = validateBlockUiSchema(
      {
        primitive: 'Button',
        permissions: { events: ['record.deleted'] }
      },
      { allowedEvents: ['record.saved'] }
    );
    expect(eventResult.ok).toBe(false);
    expect(eventResult.errors[0]).toMatchObject({
      code: 'event_denied',
      path: 'root.permissions.events[0]'
    });
  });

  test('returns a structured failure for malformed input without throwing', () => {
    expect(() => validateBlockUiSchema(null)).not.toThrow();
    const result = validateBlockUiSchema(null);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({
      code: 'schema_invalid',
      path: 'root'
    });
  });
});
