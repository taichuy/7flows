import {
  createConsoleRuntimeModelRecord,
  deleteConsoleRuntimeModelRecord,
  fetchConsoleRuntimeModelRecords,
  getDefaultApiBaseUrl,
  updateConsoleRuntimeModelRecord,
  type ApiBaseUrlLocation,
  type ConsoleRuntimeModelRecordFilterInput,
  type ConsoleRuntimeModelRecordInput,
  type ConsoleRuntimeModelRecordSortInput,
  type FetchConsoleRuntimeModelRecordsInput
} from '@1flowbase/api-client';
import type {
  JsBlockHostDataEffect,
  JsBlockHostEffectHandler
} from '@1flowbase/page-runtime';

export interface FrontstageJsBlockDataEffectClient {
  fetchConsoleRuntimeModelRecords: typeof fetchConsoleRuntimeModelRecords;
  createConsoleRuntimeModelRecord: typeof createConsoleRuntimeModelRecord;
  updateConsoleRuntimeModelRecord: typeof updateConsoleRuntimeModelRecord;
  deleteConsoleRuntimeModelRecord: typeof deleteConsoleRuntimeModelRecord;
}

export interface CreateFrontstageJsBlockDataEffectHandlerOptions {
  csrfToken?: string | null;
  baseUrl?: string;
  locationLike?: ApiBaseUrlLocation;
  client?: FrontstageJsBlockDataEffectClient;
}

const defaultClient: FrontstageJsBlockDataEffectClient = {
  fetchConsoleRuntimeModelRecords,
  createConsoleRuntimeModelRecord,
  updateConsoleRuntimeModelRecord,
  deleteConsoleRuntimeModelRecord
};

export function getFrontstageJsBlockDataEffectApiBaseUrl(
  locationLike: ApiBaseUrlLocation | undefined = typeof window !== 'undefined'
    ? window.location
    : undefined
): string {
  return (
    import.meta.env.VITE_API_BASE_URL ?? getDefaultApiBaseUrl(locationLike)
  );
}

export function createFrontstageJsBlockDataEffectHandler(
  options: CreateFrontstageJsBlockDataEffectHandlerOptions = {}
): JsBlockHostEffectHandler<JsBlockHostDataEffect> {
  const client = options.client ?? defaultClient;
  const baseUrl =
    options.baseUrl ??
    getFrontstageJsBlockDataEffectApiBaseUrl(options.locationLike);

  return async (effect) => {
    switch (effect.operation) {
      case 'query':
        return client.fetchConsoleRuntimeModelRecords(
          readModel(effect.payload),
          readQueryInput(effect.payload),
          baseUrl
        );
      case 'create':
        return client.createConsoleRuntimeModelRecord(
          readModel(effect.payload),
          readRecordInput(effect.payload),
          requireCsrfToken(options.csrfToken),
          baseUrl
        );
      case 'update':
        return client.updateConsoleRuntimeModelRecord(
          readModel(effect.payload),
          readRecordId(effect.payload),
          readRecordInput(effect.payload),
          requireCsrfToken(options.csrfToken),
          baseUrl
        );
      case 'delete':
        return client.deleteConsoleRuntimeModelRecord(
          readModel(effect.payload),
          readRecordId(effect.payload),
          requireCsrfToken(options.csrfToken),
          baseUrl
        );
      default:
        throw new Error(
          `JS Block data effect operation is not supported: ${effect.operation}.`
        );
    }
  };
}

function readPayload(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new Error('JS Block data effect payload must be an object.');
  }

  return payload;
}

function readModel(payload: unknown): string {
  const value = readPayload(payload).model;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      'JS Block data effect payload.model must be a non-empty string.'
    );
  }

  return value;
}

function readRecordInput(payload: unknown): ConsoleRuntimeModelRecordInput {
  const value = readPayload(payload).input;
  if (!isRecord(value)) {
    throw new Error('JS Block data effect payload.input must be an object.');
  }

  return value;
}

function readRecordId(payload: unknown): string {
  const value = readPayload(payload).id;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('JS Block data effect payload.id must be a non-empty string.');
  }

  return value;
}

function readQueryInput(
  payload: unknown
): FetchConsoleRuntimeModelRecordsInput {
  const record = readPayload(payload);
  const input: FetchConsoleRuntimeModelRecordsInput = {};

  const page = readOptionalPositiveInteger(record, 'page');
  if (page !== undefined) {
    input.page = page;
  }

  const pageSize = readOptionalPageSize(record);
  if (pageSize !== undefined) {
    input.page_size = pageSize;
  }

  if (record.filter !== undefined) {
    input.filter = readFilter(record.filter);
  }
  if (record.sort !== undefined) {
    input.sort = readSort(record.sort);
  }
  if (record.expand !== undefined) {
    input.expand = readExpand(record.expand);
  }

  return input;
}

function readOptionalPageSize(
  payload: Record<string, unknown>
): number | undefined {
  if (payload.page_size !== undefined) {
    return readOptionalPositiveInteger(payload, 'page_size');
  }

  return readOptionalPositiveInteger(payload, 'pageSize');
}

function readOptionalPositiveInteger(
  payload: Record<string, unknown>,
  key: string
): number | undefined {
  const value = payload[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(
      `JS Block data effect payload.${key} must be a positive integer.`
    );
  }

  return value;
}

function readFilter(value: unknown): FetchConsoleRuntimeModelRecordsInput['filter'] {
  if (typeof value === 'string') {
    return value;
  }

  if (
    !isRecord(value) ||
    typeof value.field !== 'string' ||
    typeof value.operator !== 'string' ||
    !isRuntimeFilterValue(value.value)
  ) {
    throw new Error(
      'JS Block data effect payload.filter must be a string or filter object.'
    );
  }

  return {
    field: value.field,
    operator: value.operator,
    value: value.value
  } satisfies ConsoleRuntimeModelRecordFilterInput;
}

function readSort(value: unknown): FetchConsoleRuntimeModelRecordsInput['sort'] {
  if (typeof value === 'string') {
    return value;
  }

  if (
    !isRecord(value) ||
    typeof value.field !== 'string' ||
    typeof value.direction !== 'string'
  ) {
    throw new Error(
      'JS Block data effect payload.sort must be a string or sort object.'
    );
  }

  return {
    field: value.field,
    direction: value.direction
  } satisfies ConsoleRuntimeModelRecordSortInput;
}

function readExpand(value: unknown): FetchConsoleRuntimeModelRecordsInput['expand'] {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.every(isString)) {
    return value;
  }

  throw new Error(
    'JS Block data effect payload.expand must be a string or string array.'
  );
}

function requireCsrfToken(value: string | null | undefined): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('JS Block data write effect requires csrfToken.');
  }

  return value;
}

function isRuntimeFilterValue(
  value: unknown
): value is ConsoleRuntimeModelRecordFilterInput['value'] {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
