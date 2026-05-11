import type { NodeDebugPreviewVariableCache } from '../../api/runtime';

const DEBUG_SESSION_STORAGE_VERSION = 1;
const DEBUG_SESSION_STORAGE_PREFIX = '1flowbase.agent-flow.debug-session';

interface PersistedDebugSessionPayload {
  version: number;
  debugSessionId?: string;
  latestRunId?: string | null;
  inputValues: Record<string, unknown>;
  variableOverrides?: NodeDebugPreviewVariableCache;
}

export function buildAgentFlowDebugSessionStorageKey(
  applicationId: string,
  draftId: string
) {
  return `${DEBUG_SESSION_STORAGE_PREFIX}:${applicationId}:${draftId}`;
}

function readPersistedDebugSessionPayload(
  storageKey: string
): PersistedDebugSessionPayload | null {
  const rawValue = window.localStorage.getItem(storageKey);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as PersistedDebugSessionPayload;

    if (
      parsedValue.version !== DEBUG_SESSION_STORAGE_VERSION ||
      !parsedValue.inputValues ||
      typeof parsedValue.inputValues !== 'object'
    ) {
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

function writePersistedDebugSessionPayload(
  storageKey: string,
  nextPayload: Partial<PersistedDebugSessionPayload>
) {
  const currentPayload = readPersistedDebugSessionPayload(storageKey);

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      version: DEBUG_SESSION_STORAGE_VERSION,
      debugSessionId:
        nextPayload.debugSessionId ?? currentPayload?.debugSessionId,
      latestRunId:
        nextPayload.latestRunId !== undefined
          ? nextPayload.latestRunId
          : (currentPayload?.latestRunId ?? null),
      inputValues: nextPayload.inputValues ?? currentPayload?.inputValues ?? {},
      variableOverrides:
        nextPayload.variableOverrides ?? currentPayload?.variableOverrides ?? {}
    } satisfies PersistedDebugSessionPayload)
  );
}

export function readPersistedInputValues(
  storageKey: string
): Record<string, unknown> | null {
  return readPersistedDebugSessionPayload(storageKey)?.inputValues ?? null;
}

export function readPersistedDebugSessionId(storageKey: string): string | null {
  const debugSessionId =
    readPersistedDebugSessionPayload(storageKey)?.debugSessionId;
  return typeof debugSessionId === 'string' && debugSessionId.trim()
    ? debugSessionId
    : null;
}

export function writePersistedInputValues(
  storageKey: string,
  inputValues: Record<string, unknown>
) {
  writePersistedDebugSessionPayload(storageKey, { inputValues });
}

export function writePersistedDebugSessionId(
  storageKey: string,
  debugSessionId: string
) {
  writePersistedDebugSessionPayload(storageKey, { debugSessionId });
}

export function readPersistedLatestRunId(storageKey: string): string | null {
  const latestRunId = readPersistedDebugSessionPayload(storageKey)?.latestRunId;
  return typeof latestRunId === 'string' && latestRunId.trim()
    ? latestRunId
    : null;
}

export function writePersistedLatestRunId(
  storageKey: string,
  latestRunId: string | null
) {
  writePersistedDebugSessionPayload(storageKey, { latestRunId });
}

export function readPersistedVariableOverrides(
  storageKey: string
): NodeDebugPreviewVariableCache {
  const overrides =
    readPersistedDebugSessionPayload(storageKey)?.variableOverrides;
  return overrides && typeof overrides === 'object' && !Array.isArray(overrides)
    ? overrides
    : {};
}

export function writePersistedVariableOverrides(
  storageKey: string,
  variableOverrides: NodeDebugPreviewVariableCache
) {
  writePersistedDebugSessionPayload(storageKey, { variableOverrides });
}
