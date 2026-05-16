export const BLOCK_RUNTIME_ERROR_CODES = [
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

export type BlockRuntimeErrorCode = (typeof BLOCK_RUNTIME_ERROR_CODES)[number];

export interface BlockProtocolError {
  code: BlockRuntimeErrorCode;
  path: string;
  message: string;
}
