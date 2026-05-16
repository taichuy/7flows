import type { BlockProtocolError } from '@1flowbase/page-protocol';

import {
  NATIVE_TRUSTED_BLOCK_PERMISSION,
  NATIVE_TRUSTED_BLOCK_RUNTIME,
  validateNativeTrustedBlockSource
} from './native-trusted-block-source-policy';

type RecordValue = Record<string, unknown>;

export interface NativeTrustedBlockPrepareInput {
  runtime: unknown;
  source: unknown;
  actorPermissions?: unknown;
  blockId?: unknown;
  entry?: unknown;
  props?: unknown;
}

export interface NativeTrustedBlockPreparePlan {
  runtime: typeof NATIVE_TRUSTED_BLOCK_RUNTIME;
  blockId: string;
  entry: string;
  source: string;
  normalizedSource: string;
  props: RecordValue;
  requiredPermissions: [typeof NATIVE_TRUSTED_BLOCK_PERMISSION];
}

export interface PrepareNativeTrustedBlockSuccess {
  ok: true;
  plan: NativeTrustedBlockPreparePlan;
  errors: [];
}

export interface PrepareNativeTrustedBlockFailure {
  ok: false;
  errors: BlockProtocolError[];
}

export type PrepareNativeTrustedBlockResult =
  | PrepareNativeTrustedBlockSuccess
  | PrepareNativeTrustedBlockFailure;

const DEFAULT_NATIVE_TRUSTED_BLOCK_ID = 'native-trusted-block';
const DEFAULT_NATIVE_TRUSTED_BLOCK_ENTRY = 'default';

export function prepareNativeTrustedBlock(
  input: unknown
): PrepareNativeTrustedBlockResult {
  if (!isRecord(input)) {
    return failure('schema_invalid', 'root', 'Native trusted block input must be an object.');
  }

  if (input.runtime !== NATIVE_TRUSTED_BLOCK_RUNTIME) {
    return failure(
      'schema_invalid',
      'runtime',
      `Native trusted block runtime must be ${NATIVE_TRUSTED_BLOCK_RUNTIME}.`
    );
  }

  const actorPermissions = normalizeActorPermissions(input.actorPermissions);
  if (!actorPermissions.ok) {
    return { ok: false, errors: actorPermissions.errors };
  }

  if (!actorPermissions.value.has(NATIVE_TRUSTED_BLOCK_PERMISSION)) {
    return failure(
      'action_denied',
      'actorPermissions',
      `Actor permissions must include ${NATIVE_TRUSTED_BLOCK_PERMISSION}.`
    );
  }

  if (typeof input.source === 'string' && input.source.trim() === '') {
    return failure(
      'transform_failed',
      'source',
      'Native trusted block source must be a non-empty string.'
    );
  }

  const sourceResult = validateNativeTrustedBlockSource(input.source);
  if (!sourceResult.ok) {
    return { ok: false, errors: sourceResult.errors };
  }

  const metadataErrors: BlockProtocolError[] = [];
  const blockId = normalizeOptionalText(
    input.blockId,
    DEFAULT_NATIVE_TRUSTED_BLOCK_ID,
    'blockId',
    'Native trusted block id',
    metadataErrors
  );
  const entry = normalizeOptionalText(
    input.entry,
    DEFAULT_NATIVE_TRUSTED_BLOCK_ENTRY,
    'entry',
    'Native trusted block entry',
    metadataErrors
  );
  const props = normalizeProps(input.props, metadataErrors);

  if (metadataErrors.length > 0) {
    return { ok: false, errors: metadataErrors };
  }

  return {
    ok: true,
    plan: {
      runtime: NATIVE_TRUSTED_BLOCK_RUNTIME,
      blockId,
      entry,
      source: sourceResult.source,
      normalizedSource: sourceResult.normalizedSource,
      props,
      requiredPermissions: [NATIVE_TRUSTED_BLOCK_PERMISSION]
    },
    errors: []
  };
}

export const validateNativeTrustedBlockManifest = prepareNativeTrustedBlock;

interface ActorPermissionResult {
  ok: true;
  value: Set<string>;
}

interface ActorPermissionFailure {
  ok: false;
  errors: BlockProtocolError[];
}

function normalizeActorPermissions(
  value: unknown
): ActorPermissionResult | ActorPermissionFailure {
  if (value === undefined) {
    return { ok: true, value: new Set() };
  }

  if (!Array.isArray(value)) {
    return failure(
      'schema_invalid',
      'actorPermissions',
      'Actor permissions must be an array of strings.'
    );
  }

  const permissions = new Set<string>();
  for (const [index, permission] of value.entries()) {
    if (typeof permission !== 'string' || permission.trim() === '') {
      return failure(
        'schema_invalid',
        `actorPermissions[${index}]`,
        'Actor permission must be a non-empty string.'
      );
    }

    permissions.add(permission.trim());
  }

  return { ok: true, value: permissions };
}

function normalizeOptionalText(
  value: unknown,
  fallback: string,
  path: string,
  label: string,
  errors: BlockProtocolError[]
): string {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(
      createError('schema_invalid', path, `${label} must be a non-empty string.`)
    );
    return fallback;
  }

  return value.trim();
}

function normalizeProps(
  value: unknown,
  errors: BlockProtocolError[]
): RecordValue {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isRecord(value)) {
    errors.push(
      createError('schema_invalid', 'props', 'Native trusted block props must be an object.')
    );
    return {};
  }

  return { ...value };
}

function failure(
  code: BlockProtocolError['code'],
  path: string,
  message: string
): PrepareNativeTrustedBlockFailure {
  return {
    ok: false,
    errors: [createError(code, path, message)]
  };
}

function createError(
  code: BlockProtocolError['code'],
  path: string,
  message: string
): BlockProtocolError {
  return { code, path, message };
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
