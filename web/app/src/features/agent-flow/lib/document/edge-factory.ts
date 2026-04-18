import type { FlowEdgeDocument } from '@1flowbase/flow-schema';

export function createEdgeDocument({
  id,
  source,
  target,
  sourceHandle = null,
  targetHandle = null,
  containerId = null,
  points = []
}: {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  containerId?: string | null;
  points?: Array<{ x: number; y: number }>;
}): FlowEdgeDocument {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    containerId,
    points
  };
}
