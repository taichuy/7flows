import type {
  JsBlockWorkerFactory,
  JsBlockWorkerLike
} from './js-block-worker-host';
import type { JsBlockWorkerRuntimeMessage } from './js-block-worker-runtime';

export type JsBlockWorkerAdapterErrorCode =
  | 'worker_unavailable'
  | 'worker_url_missing'
  | 'worker_construct_failed';

export class JsBlockWorkerAdapterError extends Error {
  readonly code: JsBlockWorkerAdapterErrorCode;

  constructor(
    code: JsBlockWorkerAdapterErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'JsBlockWorkerAdapterError';
    this.code = code;
  }
}

export interface JsBlockBrowserWorkerNative {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export type JsBlockBrowserWorkerConstructor = new (
  scriptUrl: string | URL,
  options?: WorkerOptions
) => JsBlockBrowserWorkerNative;

export interface JsBlockBrowserWorkerFactoryOptions {
  workerConstructor?: JsBlockBrowserWorkerConstructor | null;
  workerUrl?: string | URL | null;
  workerOptions?: WorkerOptions;
}

export function createJsBlockBrowserWorkerFactory(
  options: JsBlockBrowserWorkerFactoryOptions
): JsBlockWorkerFactory {
  return () => {
    const workerConstructor = resolveWorkerConstructor(options);
    const workerUrl = resolveWorkerUrl(options.workerUrl);

    try {
      return new JsBlockBrowserWorkerAdapter(
        new workerConstructor(workerUrl, options.workerOptions)
      );
    } catch (error) {
      if (error instanceof JsBlockWorkerAdapterError) {
        throw error;
      }

      throw new JsBlockWorkerAdapterError(
        'worker_construct_failed',
        `Failed to construct JS block worker: ${getErrorMessage(error)}`,
        { cause: error }
      );
    }
  };
}

class JsBlockBrowserWorkerAdapter implements JsBlockWorkerLike {
  private messageHandler: ((event: { data: unknown }) => void) | null = null;
  private errorHandler: ((event: { message?: string }) => void) | null = null;
  private messageErrorHandler: ((event: { message?: string }) => void) | null =
    null;

  constructor(private readonly worker: JsBlockBrowserWorkerNative) {}

  get onmessage(): ((event: { data: unknown }) => void) | null {
    return this.messageHandler;
  }

  set onmessage(handler: ((event: { data: unknown }) => void) | null) {
    this.messageHandler = handler;
    this.worker.onmessage =
      handler === null ? null : (event) => handler({ data: event.data });
  }

  get onerror(): ((event: { message?: string }) => void) | null {
    return this.errorHandler;
  }

  set onerror(handler: ((event: { message?: string }) => void) | null) {
    this.errorHandler = handler;
    this.worker.onerror =
      handler === null ? null : (event) => handler({ message: event.message });
  }

  get onmessageerror(): ((event: { message?: string }) => void) | null {
    return this.messageErrorHandler;
  }

  set onmessageerror(handler: ((event: { message?: string }) => void) | null) {
    this.messageErrorHandler = handler;
    this.worker.onmessageerror =
      handler === null
        ? null
        : (event) => handler({ message: getEventMessage(event) });
  }

  postMessage(message: JsBlockWorkerRuntimeMessage): void {
    this.worker.postMessage(message);
  }

  terminate(): void {
    this.worker.terminate();
  }
}

function resolveWorkerConstructor(
  options: JsBlockBrowserWorkerFactoryOptions
): JsBlockBrowserWorkerConstructor {
  const workerConstructor =
    Object.hasOwn(options, 'workerConstructor')
      ? options.workerConstructor
      : getGlobalWorkerConstructor();

  if (!workerConstructor) {
    throw new JsBlockWorkerAdapterError(
      'worker_unavailable',
      'JS block Worker constructor is not available.'
    );
  }

  return workerConstructor;
}

function resolveWorkerUrl(
  workerUrl: string | URL | null | undefined
): string | URL {
  if (
    workerUrl === undefined ||
    workerUrl === null ||
    (typeof workerUrl === 'string' && workerUrl.trim() === '')
  ) {
    throw new JsBlockWorkerAdapterError(
      'worker_url_missing',
      'JS block worker URL is required.'
    );
  }

  return workerUrl;
}

function getGlobalWorkerConstructor():
  | JsBlockBrowserWorkerConstructor
  | undefined {
  return globalThis.Worker as JsBlockBrowserWorkerConstructor | undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'unknown error';
}

function getEventMessage(event: MessageEvent): string | undefined {
  if (typeof event.data === 'string') {
    return event.data;
  }

  return undefined;
}
