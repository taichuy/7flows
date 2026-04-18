import {
  createDefaultAgentFlowDocument,
  type FlowAuthoringDocument
} from '@1flowbase/flow-schema';

export function buildDefaultAgentFlowDocument(
  flowId: string
): FlowAuthoringDocument {
  return createDefaultAgentFlowDocument({ flowId });
}
