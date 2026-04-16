import { NodeRunIOCard } from '../last-run/NodeRunIOCard';
import { NodeRunMetadataCard } from '../last-run/NodeRunMetadataCard';
import { NodeRunSummaryCard } from '../last-run/NodeRunSummaryCard';

export function NodeLastRunTab() {
  return (
    <div className="agent-flow-node-detail__last-run">
      <NodeRunSummaryCard />
      <NodeRunIOCard />
      <NodeRunMetadataCard />
    </div>
  );
}
