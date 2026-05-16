import type { BlockProtocolError } from '@1flowbase/page-protocol';

export type NativeTrustedBlockPortalRootHandle = unknown;

export interface NativeTrustedBlockPortalContainmentInput {
  root: NativeTrustedBlockPortalRootHandle;
}

export interface NativeTrustedBlockModalPortalContract {
  getContainer(): NativeTrustedBlockPortalRootHandle;
}

export interface NativeTrustedBlockPopupPortalContract {
  getPopupContainer(
    triggerNode?: unknown
  ): NativeTrustedBlockPortalRootHandle;
}

export interface NativeTrustedBlockPortalContainment {
  root: NativeTrustedBlockPortalRootHandle;
  modal: NativeTrustedBlockModalPortalContract;
  select: NativeTrustedBlockPopupPortalContract;
  dropdown: NativeTrustedBlockPopupPortalContract;
  tooltip: NativeTrustedBlockPopupPortalContract;
}

export type NativeTrustedBlockPortalContainmentResult =
  | {
      ok: true;
      containment: NativeTrustedBlockPortalContainment;
      errors: [];
    }
  | {
      ok: false;
      errors: BlockProtocolError[];
    };

type RecordValue = Record<string, unknown>;

export function createNativeTrustedBlockPortalContainment(
  input: unknown
): NativeTrustedBlockPortalContainmentResult {
  const root = isRecord(input) ? input.root : undefined;

  if (root === undefined || root === null) {
    return failure(
      'schema_invalid',
      'root',
      'Native trusted block portal containment requires a caller-provided block root.'
    );
  }

  const getContainer = (): NativeTrustedBlockPortalRootHandle => root;
  const getPopupContainer = (): NativeTrustedBlockPortalRootHandle => root;

  return {
    ok: true,
    containment: {
      root,
      modal: { getContainer },
      select: { getPopupContainer },
      dropdown: { getPopupContainer },
      tooltip: { getPopupContainer }
    },
    errors: []
  };
}

function failure(
  code: BlockProtocolError['code'],
  path: string,
  message: string
): NativeTrustedBlockPortalContainmentResult {
  return {
    ok: false,
    errors: [{ code, path, message }]
  };
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
