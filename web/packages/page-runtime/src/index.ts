export interface PageDefinition {
  route: string;
  title: string;
}

export function renderPageTitle(definition: PageDefinition): string {
  return `${definition.title} (${definition.route})`;
}

export * from './js-block-source-policy';
export * from './native-trusted-block-source-policy';
export * from './native-trusted-block-manifest';
export * from './native-trusted-block-host';
export * from './native-trusted-block-portal';
export * from './native-trusted-block/source-evaluator';
export * from './js-block-source-transform';
export * from './js-block-source-evaluator';
export * from './block-context-mediator';
export * from './js-block-host-effect-bridge';
export * from './js-block-worker-host';
export * from './js-block-worker-runtime';
export * from './js-block-worker-adapter';
export * from './js-block-worker-executor';
export * from './js-block-worker-modules';
