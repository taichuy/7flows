import { Tabs } from 'antd';

import { useAgentFlowEditorStore } from '../../store/editor/provider';
import { NodeDetailHeader } from './NodeDetailHeader';
import { NodeConfigTab } from './tabs/NodeConfigTab';
import { NodeLastRunTab } from './tabs/NodeLastRunTab';

export function NodeDetailPanel({
  onClose,
  onRunNode,
  applicationId,
  runLoading = false
}: {
  onClose: () => void;
  onRunNode?: (() => void) | undefined;
  applicationId?: string;
  runLoading?: boolean;
}) {
  const nodeDetailTab = useAgentFlowEditorStore((state) => state.nodeDetailTab);
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);
  const selectedNodeId = useAgentFlowEditorStore((state) => state.selectedNodeId);

  return (
    <aside aria-label="节点详情" className="agent-flow-node-detail">
      <NodeDetailHeader
        onClose={onClose}
        onRunNode={onRunNode}
        runLoading={runLoading}
      />
      <div className="agent-flow-node-detail__body" data-testid="node-detail-body">
        <Tabs
          activeKey={nodeDetailTab}
          onChange={(key) =>
            setPanelState({ nodeDetailTab: key as 'config' | 'lastRun' })
          }
          items={[
            { key: 'config', label: '设置', children: <NodeConfigTab /> },
            {
              key: 'lastRun',
              label: '上次运行',
              forceRender: true,
              children: (
                <NodeLastRunTab
                  applicationId={applicationId}
                  nodeId={selectedNodeId ?? undefined}
                />
              )
            }
          ]}
        />
      </div>
    </aside>
  );
}
