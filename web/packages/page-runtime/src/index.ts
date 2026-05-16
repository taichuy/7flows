export interface PageDefinition {
  route: string;
  title: string;
}

export function renderPageTitle(definition: PageDefinition): string {
  return `${definition.title} (${definition.route})`;
}

export * from './js-block-source-policy';
export * from './js-block-source-transform';
export * from './js-block-source-evaluator';
export * from './block-context-mediator';
export * from './js-block-host-effect-bridge';
export * from './js-block-worker-host';
export * from './js-block-worker-runtime';
export * from './js-block-worker-adapter';
export * from './js-block-worker-executor';
export * from './js-block-worker-modules';
