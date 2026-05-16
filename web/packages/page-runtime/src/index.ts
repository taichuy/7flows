export interface PageDefinition {
  route: string;
  title: string;
}

export function renderPageTitle(definition: PageDefinition): string {
  return `${definition.title} (${definition.route})`;
}

export * from './js-block-source-policy';
export * from './block-context-mediator';
export * from './js-block-worker-host';
export * from './js-block-worker-runtime';
export * from './js-block-worker-adapter';
