import type { BlockUiSchemaValidationOptions } from '@1flowbase/page-protocol';
import {
  createJsBlockWorkerHost,
  type BlockContextMediatorState,
  type JsBlockHostEffectHandlers,
  type JsBlockRunError,
  type JsBlockRuntimeRejection,
  type JsBlockRuntimeSessionState,
  type JsBlockWorkerClearTimeout,
  type JsBlockWorkerEffect,
  type JsBlockWorkerFactory,
  type JsBlockWorkerLogEntry,
  type JsBlockWorkerScheduleTimeout
} from '@1flowbase/page-runtime';

import type { RestrictedBlockRunPlan } from './restricted-block-loader';

export type RestrictedBlockRuntimeHostSnapshotStatus =
  | 'idle'
  | 'running'
  | 'ready'
  | 'failed'
  | 'timed_out'
  | 'disposed';

export interface RestrictedBlockRuntimeHostSnapshot {
  status: RestrictedBlockRuntimeHostSnapshotStatus;
  requestId: string;
  blockId: string;
  schemaValidationOptions: BlockUiSchemaValidationOptions;
  schema?: unknown;
  error?: JsBlockRunError;
  logs: JsBlockWorkerLogEntry[];
  effects: JsBlockWorkerEffect[];
  rejections: JsBlockRuntimeRejection[];
  mediatorState?: BlockContextMediatorState;
}

export interface RestrictedBlockRuntimeHostOptions {
  runPlan: RestrictedBlockRunPlan;
  workerFactory: JsBlockWorkerFactory;
  handlers?: JsBlockHostEffectHandlers;
  scheduleTimeout?: JsBlockWorkerScheduleTimeout;
  clearScheduledTimeout?: JsBlockWorkerClearTimeout;
}

export interface RestrictedBlockRuntimeHost {
  run(): RestrictedBlockRuntimeHostSnapshot;
  dispose(): RestrictedBlockRuntimeHostSnapshot;
  getSnapshot(): RestrictedBlockRuntimeHostSnapshot;
  getHostState(): JsBlockRuntimeSessionState;
}

export function createRestrictedBlockRuntimeHost(
  options: RestrictedBlockRuntimeHostOptions
): RestrictedBlockRuntimeHost {
  const runPlan = options.runPlan;
  const workerHost = createJsBlockWorkerHost({
    workerFactory: options.workerFactory,
    scheduleTimeout: options.scheduleTimeout,
    clearScheduledTimeout: options.clearScheduledTimeout,
    effectBridge: {
      policy: runPlan.mediatorPolicy,
      handlers: options.handlers,
      getContext: () => ({ tickId: runPlan.request.requestId })
    }
  });
  let didDispose = false;

  const createSnapshot = (): RestrictedBlockRuntimeHostSnapshot => {
    const state = workerHost.getState();
    const requestState = state.requests[runPlan.request.requestId];
    const result = requestState?.result;

    return {
      status: didDispose
        ? 'disposed'
        : mapSnapshotStatus(requestState?.status),
      requestId: runPlan.request.requestId,
      blockId: runPlan.request.blockId,
      schemaValidationOptions: cloneSchemaValidationOptions(
        runPlan.schemaValidationOptions
      ),
      ...(result?.ok === true ? { schema: result.schema } : {}),
      ...(result?.ok === false ? { error: result.error } : {}),
      logs: [...(requestState?.logs ?? [])],
      effects: [...(requestState?.effects ?? [])],
      rejections: [...state.rejections],
      mediatorState: cloneMediatorState(workerHost.getEffectMediatorState())
    };
  };

  return {
    run() {
      if (!didDispose) {
        workerHost.run(runPlan.request);
      }

      return createSnapshot();
    },
    dispose() {
      if (!didDispose) {
        didDispose = true;
        workerHost.dispose(runPlan.request.requestId);
      }

      return createSnapshot();
    },
    getSnapshot() {
      return createSnapshot();
    },
    getHostState() {
      return workerHost.getState();
    }
  };
}

function mapSnapshotStatus(
  requestStatus: RestrictedBlockRuntimeHostRequestStatus | undefined
): RestrictedBlockRuntimeHostSnapshotStatus {
  switch (requestStatus) {
    case 'pending':
      return 'running';
    case 'ready':
    case 'failed':
    case 'timed_out':
    case 'disposed':
      return requestStatus;
    case undefined:
      return 'idle';
  }
}

type RestrictedBlockRuntimeHostRequestStatus =
  JsBlockRuntimeSessionState['requests'][string]['status'];

function cloneSchemaValidationOptions(
  options: BlockUiSchemaValidationOptions
): BlockUiSchemaValidationOptions {
  return {
    ...options,
    allowedDataPermissions: options.allowedDataPermissions
      ? [...options.allowedDataPermissions]
      : undefined,
    allowedActions: options.allowedActions
      ? [...options.allowedActions]
      : undefined,
    allowedEvents: options.allowedEvents ? [...options.allowedEvents] : undefined
  };
}

function cloneMediatorState(
  state: BlockContextMediatorState | undefined
): BlockContextMediatorState | undefined {
  if (!state) {
    return undefined;
  }

  return {
    eventChains: { ...state.eventChains }
  };
}
