import { describe, expect, test } from 'vitest';

import {
  createJsBlockBrowserWorkerFactory,
  JsBlockWorkerAdapterError,
  type JsBlockBrowserWorkerConstructor,
  type JsBlockWorkerLike
} from '../index';

class FakeNativeWorker {
  static readonly instances: FakeNativeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly messages: unknown[] = [];
  readonly scriptUrl: string | URL;
  readonly options?: WorkerOptions;
  terminateCount = 0;

  constructor(scriptUrl: string | URL, options?: WorkerOptions) {
    this.scriptUrl = scriptUrl;
    this.options = options;
    FakeNativeWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminateCount += 1;
  }
}

const FakeNativeWorkerConstructor =
  FakeNativeWorker as unknown as JsBlockBrowserWorkerConstructor;

describe('JS block browser worker adapter', () => {
  test('returns a lazy JsBlockWorkerFactory that constructs the injected Worker with URL and module options', () => {
    FakeNativeWorker.instances.length = 0;
    const workerUrl = new URL('https://example.test/js-block-worker.js');
    const factory = createJsBlockBrowserWorkerFactory({
      workerConstructor: FakeNativeWorkerConstructor,
      workerUrl,
      workerOptions: { type: 'module', name: 'js-block-worker' }
    });

    expect(FakeNativeWorker.instances).toHaveLength(0);

    const worker = factory();

    expect(worker).toMatchObject<Partial<JsBlockWorkerLike>>({
      postMessage: expect.any(Function),
      terminate: expect.any(Function)
    });
    expect(FakeNativeWorker.instances).toHaveLength(1);
    expect(FakeNativeWorker.instances[0]).toMatchObject({
      scriptUrl: workerUrl,
      options: { type: 'module', name: 'js-block-worker' }
    });
  });

  test('passes classic worker options through the controlled adapter configuration', () => {
    FakeNativeWorker.instances.length = 0;
    const factory = createJsBlockBrowserWorkerFactory({
      workerConstructor: FakeNativeWorkerConstructor,
      workerUrl: '/workers/js-block-worker.js',
      workerOptions: { type: 'classic', credentials: 'same-origin' }
    });

    factory();

    expect(FakeNativeWorker.instances[0]?.options).toEqual({
      type: 'classic',
      credentials: 'same-origin'
    });
  });

  test('bridges Worker message handlers without exposing browser globals to tests', () => {
    FakeNativeWorker.instances.length = 0;
    const worker = createJsBlockBrowserWorkerFactory({
      workerConstructor: FakeNativeWorkerConstructor,
      workerUrl: '/workers/js-block-worker.js'
    })();
    const nativeWorker = FakeNativeWorker.instances[0];
    const messages: unknown[] = [];

    worker.onmessage = (event) => messages.push(event.data);
    nativeWorker?.onmessage?.({ data: { ready: true } } as MessageEvent);
    worker.postMessage({
      direction: 'host_to_worker',
      type: 'init'
    });
    worker.terminate();

    expect(messages).toEqual([{ ready: true }]);
    expect(nativeWorker?.messages).toEqual([
      { direction: 'host_to_worker', type: 'init' }
    ]);
    expect(nativeWorker?.terminateCount).toBe(1);
  });

  test('fails with a controlled error when no Worker constructor is available', () => {
    const factory = createJsBlockBrowserWorkerFactory({
      workerConstructor: undefined,
      workerUrl: '/workers/js-block-worker.js'
    });

    expect(factory).toThrow(JsBlockWorkerAdapterError);
    expect(factory).toThrow(/Worker constructor is not available/);

    try {
      factory();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'worker_unavailable'
      });
    }
  });

  test('fails with a controlled error when worker URL is missing', () => {
    const factory = createJsBlockBrowserWorkerFactory({
      workerConstructor: FakeNativeWorkerConstructor,
      workerUrl: undefined
    });

    expect(factory).toThrow(JsBlockWorkerAdapterError);

    try {
      factory();
    } catch (error) {
      expect(error).toMatchObject({
        code: 'worker_url_missing'
      });
    }
  });

  test('wraps Worker construction failures in a controlled adapter error', () => {
    const ThrowingWorker = class {
      constructor() {
        throw new Error('blocked by policy');
      }
    } as unknown as JsBlockBrowserWorkerConstructor;
    const factory = createJsBlockBrowserWorkerFactory({
      workerConstructor: ThrowingWorker,
      workerUrl: '/workers/js-block-worker.js'
    });

    try {
      factory();
    } catch (error) {
      expect(error).toBeInstanceOf(JsBlockWorkerAdapterError);
      expect(error).toMatchObject({
        code: 'worker_construct_failed',
        message: 'Failed to construct JS block worker: blocked by policy'
      });
    }
  });
});
