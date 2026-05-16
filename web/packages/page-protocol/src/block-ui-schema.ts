import type {
  BlockProtocolError,
  BlockRuntimeErrorCode
} from './block-runtime-error';

export const BLOCK_UI_PRIMITIVES = [
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

export const BLOCK_STYLE_CATEGORIES = [
  'spacing',
  'color',
  'typography',
  'border',
  'radius',
  'layout'
] as const;

export const BLOCK_DATA_PERMISSIONS = [
  'query',
  'create',
  'update',
  'delete'
] as const;

export type BlockUiPrimitive = (typeof BLOCK_UI_PRIMITIVES)[number];
export type BlockStyleCategory = (typeof BLOCK_STYLE_CATEGORIES)[number];
export type BlockDataPermission = (typeof BLOCK_DATA_PERMISSIONS)[number];
export type BlockStyleTokenValue = string | number | boolean | null;
export type BlockUiProps = Record<string, unknown>;

export type BlockUiStyle = Partial<{
  spacing: Partial<Record<BlockSpacingStyleKey, BlockStyleTokenValue>>;
  color: Partial<Record<BlockColorStyleKey, BlockStyleTokenValue>>;
  typography: Partial<Record<BlockTypographyStyleKey, BlockStyleTokenValue>>;
  border: Partial<Record<BlockBorderStyleKey, BlockStyleTokenValue>>;
  radius: Partial<Record<BlockRadiusStyleKey, BlockStyleTokenValue>>;
  layout: Partial<Record<BlockLayoutStyleKey, BlockStyleTokenValue>>;
}>;

export interface BlockUiPermissionMarkers {
  data?: BlockDataPermission[];
  actions?: string[];
  events?: string[];
}

export interface BlockUiSchemaNode {
  primitive: BlockUiPrimitive;
  key?: string;
  props?: BlockUiProps;
  style?: BlockUiStyle;
  children?: BlockUiSchemaNode[];
  permissions?: BlockUiPermissionMarkers;
}

export type BlockUiSchema = BlockUiSchemaNode;

export interface BlockUiSchemaValidationOptions {
  maxDepth?: number;
  maxNodes?: number;
  allowedDataPermissions?: readonly BlockDataPermission[];
  allowedActions?: readonly string[];
  allowedEvents?: readonly string[];
}

export type BlockUiSchemaValidationResult =
  | {
      ok: true;
      schema: BlockUiSchema;
      errors: [];
    }
  | {
      ok: false;
      errors: BlockProtocolError[];
    };

type BlockStyleKeyByCategory = {
  spacing: BlockSpacingStyleKey;
  color: BlockColorStyleKey;
  typography: BlockTypographyStyleKey;
  border: BlockBorderStyleKey;
  radius: BlockRadiusStyleKey;
  layout: BlockLayoutStyleKey;
};

type BlockSpacingStyleKey =
  | 'margin'
  | 'marginX'
  | 'marginY'
  | 'marginTop'
  | 'marginRight'
  | 'marginBottom'
  | 'marginLeft'
  | 'padding'
  | 'paddingX'
  | 'paddingY'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'gap'
  | 'rowGap'
  | 'columnGap';

type BlockColorStyleKey =
  | 'text'
  | 'background'
  | 'border'
  | 'accent'
  | 'status';

type BlockTypographyStyleKey =
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'align'
  | 'truncate';

type BlockBorderStyleKey = 'width' | 'style' | 'color';
type BlockRadiusStyleKey = 'all' | 'top' | 'right' | 'bottom' | 'left';

type BlockLayoutStyleKey =
  | 'display'
  | 'width'
  | 'minWidth'
  | 'maxWidth'
  | 'height'
  | 'minHeight'
  | 'maxHeight'
  | 'overflow'
  | 'align'
  | 'justify'
  | 'direction'
  | 'wrap'
  | 'columns'
  | 'span';

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_NODES = 250;

const primitiveSet = new Set<string>(BLOCK_UI_PRIMITIVES);
const styleCategorySet = new Set<string>(BLOCK_STYLE_CATEGORIES);
const dataPermissionSet = new Set<string>(BLOCK_DATA_PERMISSIONS);
const nodeKeySet = new Set([
  'primitive',
  'key',
  'props',
  'style',
  'children',
  'permissions'
]);

const styleKeys: {
  [Category in BlockStyleCategory]: readonly BlockStyleKeyByCategory[Category][];
} = {
  spacing: [
    'margin',
    'marginX',
    'marginY',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'padding',
    'paddingX',
    'paddingY',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'gap',
    'rowGap',
    'columnGap'
  ],
  color: ['text', 'background', 'border', 'accent', 'status'],
  typography: ['fontSize', 'fontWeight', 'lineHeight', 'align', 'truncate'],
  border: ['width', 'style', 'color'],
  radius: ['all', 'top', 'right', 'bottom', 'left'],
  layout: [
    'display',
    'width',
    'minWidth',
    'maxWidth',
    'height',
    'minHeight',
    'maxHeight',
    'overflow',
    'align',
    'justify',
    'direction',
    'wrap',
    'columns',
    'span'
  ]
};

const styleKeySets: Record<BlockStyleCategory, ReadonlySet<string>> = {
  spacing: new Set(styleKeys.spacing),
  color: new Set(styleKeys.color),
  typography: new Set(styleKeys.typography),
  border: new Set(styleKeys.border),
  radius: new Set(styleKeys.radius),
  layout: new Set(styleKeys.layout)
};

const dataPermissionErrorCodes: Record<
  BlockDataPermission,
  BlockRuntimeErrorCode
> = {
  query: 'query_denied',
  create: 'create_denied',
  update: 'update_denied',
  delete: 'delete_denied'
};

export function validateBlockUiSchema(
  schema: unknown,
  options: BlockUiSchemaValidationOptions = {}
): BlockUiSchemaValidationResult {
  const errors: BlockProtocolError[] = [];
  const state = {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxNodes: options.maxNodes ?? DEFAULT_MAX_NODES,
    nodeCount: 0,
    allowedDataPermissions: new Set(options.allowedDataPermissions ?? []),
    allowedActions: new Set(options.allowedActions ?? []),
    allowedEvents: new Set(options.allowedEvents ?? []),
    seen: new WeakSet<object>()
  };

  validateNode(schema, 'root', 1, state, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    schema: schema as BlockUiSchema,
    errors: []
  };
}

interface ValidationState {
  maxDepth: number;
  maxNodes: number;
  nodeCount: number;
  allowedDataPermissions: ReadonlySet<BlockDataPermission>;
  allowedActions: ReadonlySet<string>;
  allowedEvents: ReadonlySet<string>;
  seen: WeakSet<object>;
}

function validateNode(
  value: unknown,
  path: string,
  depth: number,
  state: ValidationState,
  errors: BlockProtocolError[]
): void {
  if (errors.length > 0) {
    return;
  }

  if (depth > state.maxDepth) {
    addError(errors, 'schema_invalid', path, 'Schema exceeds maximum depth.');
    return;
  }

  if (!isRecord(value)) {
    addError(errors, 'schema_invalid', path, 'Schema node must be an object.');
    return;
  }

  if (state.seen.has(value)) {
    addError(errors, 'schema_invalid', path, 'Schema contains a cycle.');
    return;
  }
  state.seen.add(value);

  state.nodeCount += 1;
  if (state.nodeCount > state.maxNodes) {
    addError(errors, 'schema_invalid', path, 'Schema exceeds maximum nodes.');
    return;
  }

  for (const key of Object.keys(value)) {
    if (!nodeKeySet.has(key)) {
      addError(errors, 'schema_invalid', `${path}.${key}`, 'Unknown schema key.');
      return;
    }
  }

  if (!primitiveSet.has(String(value.primitive))) {
    addError(
      errors,
      'schema_invalid',
      `${path}.primitive`,
      'Unknown block UI primitive.'
    );
    return;
  }

  if (value.key !== undefined && typeof value.key !== 'string') {
    addError(errors, 'schema_invalid', `${path}.key`, 'Key must be a string.');
    return;
  }

  if (value.props !== undefined && !isJsonLike(value.props)) {
    addError(
      errors,
      'schema_invalid',
      `${path}.props`,
      'Props must be JSON-compatible data.'
    );
    return;
  }

  if (value.style !== undefined) {
    validateStyle(value.style, `${path}.style`, errors);
    if (errors.length > 0) {
      return;
    }
  }

  if (value.permissions !== undefined) {
    validatePermissions(value.permissions, `${path}.permissions`, state, errors);
    if (errors.length > 0) {
      return;
    }
  }

  if (value.children === undefined) {
    return;
  }

  if (!Array.isArray(value.children)) {
    addError(
      errors,
      'schema_invalid',
      `${path}.children`,
      'Children must be an array.'
    );
    return;
  }

  value.children.forEach((child, index) => {
    validateNode(child, `${path}.children[${index}]`, depth + 1, state, errors);
  });
}

function validateStyle(
  value: unknown,
  path: string,
  errors: BlockProtocolError[]
): void {
  if (!isRecord(value)) {
    addError(errors, 'schema_invalid', path, 'Style must be an object.');
    return;
  }

  for (const [category, categoryValue] of Object.entries(value)) {
    if (!styleCategorySet.has(category)) {
      addError(
        errors,
        'schema_invalid',
        `${path}.${category}`,
        'Style category is not allowed.'
      );
      return;
    }

    if (!isRecord(categoryValue)) {
      addError(
        errors,
        'schema_invalid',
        `${path}.${category}`,
        'Style category must be a token object.'
      );
      return;
    }

    const allowedKeys = styleKeySets[category as BlockStyleCategory];
    for (const [styleKey, tokenValue] of Object.entries(categoryValue)) {
      if (!allowedKeys.has(styleKey)) {
        addError(
          errors,
          'schema_invalid',
          `${path}.${category}.${styleKey}`,
          'Style token key is not allowed.'
        );
        return;
      }

      if (!isTokenValue(tokenValue)) {
        addError(
          errors,
          'schema_invalid',
          `${path}.${category}.${styleKey}`,
          'Style token value must be scalar.'
        );
        return;
      }
    }
  }
}

function validatePermissions(
  value: unknown,
  path: string,
  state: ValidationState,
  errors: BlockProtocolError[]
): void {
  if (!isRecord(value)) {
    addError(errors, 'schema_invalid', path, 'Permissions must be an object.');
    return;
  }

  for (const key of Object.keys(value)) {
    if (key !== 'data' && key !== 'actions' && key !== 'events') {
      addError(
        errors,
        'schema_invalid',
        `${path}.${key}`,
        'Unknown permission marker group.'
      );
      return;
    }
  }

  validateDataPermissions(value.data, `${path}.data`, state, errors);
  if (errors.length > 0) {
    return;
  }
  validateStringPermissionList(
    value.actions,
    `${path}.actions`,
    state.allowedActions,
    'action_denied',
    errors
  );
  if (errors.length > 0) {
    return;
  }
  validateStringPermissionList(
    value.events,
    `${path}.events`,
    state.allowedEvents,
    'event_denied',
    errors
  );
}

function validateDataPermissions(
  value: unknown,
  path: string,
  state: ValidationState,
  errors: BlockProtocolError[]
): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    addError(errors, 'schema_invalid', path, 'Data permissions must be an array.');
    return;
  }

  value.forEach((permission, index) => {
    const itemPath = `${path}[${index}]`;

    if (typeof permission !== 'string' || !dataPermissionSet.has(permission)) {
      addError(
        errors,
        'schema_invalid',
        itemPath,
        'Unknown data permission marker.'
      );
      return;
    }

    const dataPermission = permission as BlockDataPermission;
    if (!state.allowedDataPermissions.has(dataPermission)) {
      addError(
        errors,
        dataPermissionErrorCodes[dataPermission],
        itemPath,
        'Data permission marker is not allowed.'
      );
    }
  });
}

function validateStringPermissionList(
  value: unknown,
  path: string,
  allowed: ReadonlySet<string>,
  deniedCode: BlockRuntimeErrorCode,
  errors: BlockProtocolError[]
): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    addError(errors, 'schema_invalid', path, 'Permission markers must be an array.');
    return;
  }

  value.forEach((permission, index) => {
    const itemPath = `${path}[${index}]`;

    if (typeof permission !== 'string' || permission.length === 0) {
      addError(
        errors,
        'schema_invalid',
        itemPath,
        'Permission marker must be a non-empty string.'
      );
      return;
    }

    if (!allowed.has(permission)) {
      addError(
        errors,
        deniedCode,
        itemPath,
        'Permission marker is not allowed.'
      );
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isTokenValue(value: unknown): value is BlockStyleTokenValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isJsonLike(value: unknown): boolean {
  if (isTokenValue(value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonLike(item));
  }

  if (isRecord(value)) {
    return Object.values(value).every((item) => isJsonLike(item));
  }

  return false;
}

function addError(
  errors: BlockProtocolError[],
  code: BlockRuntimeErrorCode,
  path: string,
  message: string
): void {
  errors.push({ code, path, message });
}
