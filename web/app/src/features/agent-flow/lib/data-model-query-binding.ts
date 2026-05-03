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

  const activeKeys = new Set(
    ACTIVE_BINDINGS[getDataModelAction(node.config.action)]
  );

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
      ? object.expand_relations.filter(
          (entry): entry is string => typeof entry === 'string'
        )
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
      selector: object.selector.filter(
        (segment): segment is string => typeof segment === 'string'
      )
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
