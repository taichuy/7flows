# Data Model Query Params 01 Frontend Contract Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Update the index plan after each completed task.

**Goal:** Add the TypeScript `data_model_query` binding contract and make frontend selector consumers respect Data Model active bindings.

**Architecture:** Keep the shared binding type in `@1flowbase/flow-schema`; keep Data Model query normalization, selector extraction, active binding filtering, and duplicate remapping in one feature helper.

**Tech Stack:** TypeScript, Vitest, `@1flowbase/flow-schema`.

---

## Files

- Modify: `web/packages/flow-schema/src/index.ts`
- Create: `web/app/src/features/agent-flow/lib/data-model-query-binding.ts`
- Modify: `web/app/src/features/agent-flow/api/runtime.ts`
- Modify: `web/app/src/features/agent-flow/lib/validate-document.ts`
- Modify: `web/app/src/features/agent-flow/lib/document/transforms/duplicate.ts`
- Test: `web/app/src/features/agent-flow/_tests/node-debug-preview-input.test.ts`
- Test: `web/app/src/features/agent-flow/_tests/validate-document.test.ts`
- Test: `web/app/src/features/agent-flow/_tests/document-transforms.test.ts`

### Task 1: Add Failing Frontend Contract Tests

- [x] **Step 1: Add debug preview coverage**

Append these tests to `web/app/src/features/agent-flow/_tests/node-debug-preview-input.test.ts`:

```ts
  test('extracts selector dependencies from active Data Model query binding', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      id: 'node-data-model',
      type: 'data_model',
      alias: 'Orders',
      description: '',
      containerId: null,
      position: { x: 720, y: 220 },
      configVersion: 1,
      config: { data_model_code: 'orders', action: 'list' },
      bindings: {
        query: {
          kind: 'data_model_query',
          value: {
            filters: [
              {
                field_code: 'status',
                operator: 'eq',
                value: { kind: 'selector', selector: ['node-start', 'query'] }
              }
            ],
            sorts: [],
            expand_relations: [],
            page: { kind: 'constant', value: 1 },
            page_size: { kind: 'constant', value: 20 }
          }
        },
        record_id: { kind: 'selector', value: ['node-answer', 'answer'] }
      },
      outputs: [
        { key: 'records', title: '记录列表', valueType: 'array' },
        { key: 'total', title: '记录总数', valueType: 'number' }
      ]
    });

    expect(buildNodeDebugPreviewPlan(document, 'node-data-model')).toEqual({
      input_payload: {},
      missing_fields: [
        expect.objectContaining({
          nodeId: 'node-start',
          key: 'query',
          valueType: 'string'
        })
      ]
    });
  });

  test('ignores residual Data Model query binding when action is create', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      id: 'node-data-model',
      type: 'data_model',
      alias: 'Orders',
      description: '',
      containerId: null,
      position: { x: 720, y: 220 },
      configVersion: 1,
      config: { data_model_code: 'orders', action: 'create' },
      bindings: {
        query: {
          kind: 'data_model_query',
          value: {
            filters: [
              {
                field_code: 'status',
                operator: 'eq',
                value: { kind: 'selector', selector: ['node-answer', 'answer'] }
              }
            ],
            sorts: [],
            expand_relations: [],
            page: { kind: 'constant', value: 1 },
            page_size: { kind: 'constant', value: 20 }
          }
        },
        payload: {
          kind: 'named_bindings',
          value: [{ name: 'title', selector: ['node-start', 'query'] }]
        }
      },
      outputs: [{ key: 'record', title: '记录', valueType: 'json' }]
    });

    expect(buildNodeDebugPreviewPlan(document, 'node-data-model')).toEqual({
      input_payload: {},
      missing_fields: [
        expect.objectContaining({
          nodeId: 'node-start',
          key: 'query'
        })
      ]
    });
  });
```

- [x] **Step 2: Add validation and duplication coverage**

Append this test to `web/app/src/features/agent-flow/_tests/validate-document.test.ts`:

```ts
  test('validates only active Data Model action bindings', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      ...createNodeDocument('data_model' as never, 'node-data-model'),
      config: { data_model_code: 'orders', action: 'create' },
      bindings: {
        query: {
          kind: 'data_model_query',
          value: {
            filters: [
              {
                field_code: 'status',
                operator: 'eq',
                value: { kind: 'selector', selector: ['node-answer', 'answer'] }
              }
            ],
            sorts: [],
            expand_relations: [],
            page: { kind: 'constant', value: 1 },
            page_size: { kind: 'constant', value: 20 }
          }
        },
        payload: {
          kind: 'named_bindings',
          value: [{ name: 'title', selector: ['node-start', 'query'] }]
        }
      }
    });

    const issues = validateDocument(document);

    expect(
      issues.some(
        (issue) =>
          issue.nodeId === 'node-data-model' &&
          issue.fieldKey === 'bindings.query'
      )
    ).toBe(false);
  });
```

Append this test to `web/app/src/features/agent-flow/_tests/document-transforms.test.ts`:

```ts
  test('duplicates Data Model query binding and rewrites selector values', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const sourceNode = createNodeDocument('data_model' as never, 'node-data-model');
    sourceNode.bindings.query = {
      kind: 'data_model_query',
      value: {
        filters: [
          {
            field_code: 'status',
            operator: 'eq',
            value: { kind: 'selector', selector: ['node-data-model', 'total'] }
          }
        ],
        sorts: [],
        expand_relations: [],
        page: { kind: 'constant', value: 1 },
        page_size: { kind: 'constant', value: 20 }
      }
    };
    document.graph.nodes.push(sourceNode);

    const duplicated = duplicateNodeSubgraph(document, {
      nodeId: 'node-data-model'
    });
    const copied = duplicated.graph.nodes.find(
      (node) => node.id === 'node-data-model-copy'
    );

    expect(copied?.bindings.query).toMatchObject({
      kind: 'data_model_query',
      value: {
        filters: [
          {
            value: {
              kind: 'selector',
              selector: ['node-data-model-copy', 'total']
            }
          }
        ]
      }
    });
  });
```

- [x] **Step 3: Confirm failure**

Run:

```bash
pnpm --dir web/app test -- node-debug-preview-input validate-document document-transforms
```

Expected: FAIL because `data_model_query` is not in `FlowBinding`, selector extraction does not inspect it, and active Data Model bindings are not filtered.

### Task 2: Add Binding Types And Helper

- [x] **Step 1: Extend `FlowBinding`**

Add these exported types before `export type FlowBinding` in `web/packages/flow-schema/src/index.ts`:

```ts
export type DataModelQueryOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

export type DataModelQueryValue =
  | { kind: 'constant'; value: unknown }
  | { kind: 'selector'; selector: string[] };

export interface DataModelQueryFilter {
  field_code: string;
  operator: DataModelQueryOperator;
  value: DataModelQueryValue;
}

export interface DataModelQuerySort {
  field_code: string;
  direction: 'asc' | 'desc';
}

export interface DataModelQueryBindingValue {
  filters: DataModelQueryFilter[];
  sorts: DataModelQuerySort[];
  expand_relations: string[];
  page: DataModelQueryValue;
  page_size: DataModelQueryValue;
}
```

Add this branch to `FlowBinding`:

```ts
  | {
      kind: 'data_model_query';
      value: DataModelQueryBindingValue;
    }
```

- [x] **Step 2: Create helper module**

Create `web/app/src/features/agent-flow/lib/data-model-query-binding.ts`:

```ts
import type {
  DataModelQueryBindingValue,
  DataModelQueryFilter,
  DataModelQueryOperator,
  DataModelQueryValue,
  FlowBinding,
  FlowNodeDocument
} from '@1flowbase/flow-schema';

export const DATA_MODEL_QUERY_OPERATORS: DataModelQueryOperator[] = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte'
];

export const DATA_MODEL_QUERY_DEFAULT_VALUE: DataModelQueryBindingValue = {
  filters: [],
  sorts: [],
  expand_relations: [],
  page: { kind: 'constant', value: 1 },
  page_size: { kind: 'constant', value: 20 }
};

const ACTIVE_BINDINGS: Record<string, string[]> = {
  list: ['query'],
  get: ['record_id'],
  create: ['payload'],
  update: ['record_id', 'payload'],
  delete: ['record_id']
};

export function getDataModelAction(value: unknown) {
  return typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(ACTIVE_BINDINGS, value)
    ? value
    : 'list';
}

export function getActiveNodeBindings(node: FlowNodeDocument) {
  if (node.type !== 'data_model') {
    return Object.entries(node.bindings);
  }

  const activeKeys = new Set(ACTIVE_BINDINGS[getDataModelAction(node.config.action)]);

  return Object.entries(node.bindings).filter(([key]) => activeKeys.has(key));
}

export function normalizeDataModelQueryBindingValue(
  value: unknown
): DataModelQueryBindingValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DATA_MODEL_QUERY_DEFAULT_VALUE;
  }

  const object = value as Partial<DataModelQueryBindingValue>;

  return {
    filters: Array.isArray(object.filters) ? object.filters : [],
    sorts: Array.isArray(object.sorts) ? object.sorts : [],
    expand_relations: Array.isArray(object.expand_relations)
      ? object.expand_relations.filter((entry): entry is string => typeof entry === 'string')
      : [],
    page: normalizeDataModelQueryValue(object.page, 1),
    page_size: normalizeDataModelQueryValue(object.page_size, 20)
  };
}

export function normalizeDataModelQueryValue(
  value: unknown,
  fallback: unknown
): DataModelQueryValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { kind: 'constant', value: fallback };
  }

  const object = value as Partial<DataModelQueryValue>;

  if (object.kind === 'selector' && Array.isArray(object.selector)) {
    return {
      kind: 'selector',
      selector: object.selector.filter((segment): segment is string => typeof segment === 'string')
    };
  }

  if (object.kind === 'constant') {
    return { kind: 'constant', value: object.value };
  }

  return { kind: 'constant', value: fallback };
}

export function extractDataModelQuerySelectors(
  value: DataModelQueryBindingValue
) {
  const selectors = value.filters.flatMap((filter) =>
    filter.value.kind === 'selector' ? [filter.value.selector] : []
  );

  if (value.page.kind === 'selector') {
    selectors.push(value.page.selector);
  }

  if (value.page_size.kind === 'selector') {
    selectors.push(value.page_size.selector);
  }

  return selectors;
}

export function remapDataModelQueryBinding(
  binding: FlowBinding,
  remapSelector: (selector: string[]) => string[]
): FlowBinding {
  if (binding.kind !== 'data_model_query') {
    return binding;
  }

  const remapValue = (value: DataModelQueryValue): DataModelQueryValue =>
    value.kind === 'selector'
      ? { ...value, selector: remapSelector(value.selector) }
      : value;

  return {
    ...binding,
    value: {
      ...binding.value,
      filters: binding.value.filters.map((filter: DataModelQueryFilter) => ({
        ...filter,
        value: remapValue(filter.value)
      })),
      page: remapValue(binding.value.page),
      page_size: remapValue(binding.value.page_size)
    }
  };
}
```

### Task 3: Wire Frontend Consumers

- [x] **Step 1: Update debug preview selector extraction**

In `web/app/src/features/agent-flow/api/runtime.ts`, import:

```ts
import {
  extractDataModelQuerySelectors,
  getActiveNodeBindings
} from '../lib/data-model-query-binding';
```

Add this branch to `extractSelectors`:

```ts
    case 'data_model_query':
      return extractDataModelQuerySelectors(binding.value)
        .map((value) => normalizeSelectorPath(value))
        .filter((value): value is readonly [string, string] => value !== null);
```

Replace both selector scans over `Object.values(node.bindings)` with:

```ts
  const selectors = getActiveNodeBindings(node).flatMap(([, binding]) =>
    extractSelectors(binding)
  );
```

- [x] **Step 2: Update validation**

In `web/app/src/features/agent-flow/lib/validate-document.ts`, import:

```ts
import {
  extractDataModelQuerySelectors,
  getActiveNodeBindings
} from './data-model-query-binding';
```

Add this branch to `collectBindingSelectors`:

```ts
    case 'data_model_query':
      return extractDataModelQuerySelectors(binding.value);
```

Replace the binding loop with:

```ts
    for (const [bindingKey, bindingValue] of getActiveNodeBindings(node)) {
```

- [x] **Step 3: Update duplicate remapping**

In `web/app/src/features/agent-flow/lib/document/transforms/duplicate.ts`, import:

```ts
import { remapDataModelQueryBinding } from '../../data-model-query-binding';
```

Add this branch to `remapBinding`:

```ts
    case 'data_model_query':
      return remapDataModelQueryBinding(binding, (selector) =>
        remapSelector(selector, idMap)
      );
```

- [x] **Step 4: Verify**

Run:

```bash
pnpm --dir web/app test -- node-debug-preview-input validate-document document-transforms
```

Expected: PASS.

- [x] **Step 5: Commit**

Run:

```bash
git add web/packages/flow-schema/src/index.ts web/app/src/features/agent-flow/lib/data-model-query-binding.ts web/app/src/features/agent-flow/api/runtime.ts web/app/src/features/agent-flow/lib/validate-document.ts web/app/src/features/agent-flow/lib/document/transforms/duplicate.ts web/app/src/features/agent-flow/_tests/node-debug-preview-input.test.ts web/app/src/features/agent-flow/_tests/validate-document.test.ts web/app/src/features/agent-flow/_tests/document-transforms.test.ts
git commit -m "feat: add data model query binding contract"
```
