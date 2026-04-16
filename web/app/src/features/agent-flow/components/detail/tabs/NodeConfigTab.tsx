import { NodeInspector } from '../../inspector/NodeInspector';
import { NodePolicySection } from '../cards/NodePolicySection';
import { NodeOutputContractCard } from '../cards/NodeOutputContractCard';
import { NodeRelationsCard } from '../cards/NodeRelationsCard';
import { NodeSummaryCard } from '../cards/NodeSummaryCard';

export function NodeConfigTab() {
  return (
    <div className="agent-flow-node-detail__config-tab">
      <NodeSummaryCard />
      <NodeInspector />
      <NodeOutputContractCard />
      <NodePolicySection />
      <NodeRelationsCard />
    </div>
  );
}
