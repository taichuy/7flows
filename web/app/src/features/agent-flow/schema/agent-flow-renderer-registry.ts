import { createRendererRegistry } from '../../../shared/schema-ui/registry/create-renderer-registry';

import { agentFlowFieldRenderers } from './agent-flow-field-renderers';
import { agentFlowViewRenderers } from './agent-flow-view-renderers';

export const agentFlowRendererRegistry = createRendererRegistry({
  fields: agentFlowFieldRenderers,
  views: agentFlowViewRenderers,
  shells: {}
});

