import { Tabs } from 'antd';
import { useMemo } from 'react';

import { SchemaDockPanel } from '../../../../shared/schema-ui/overlay-shell/SchemaDockPanel';
import { createAgentFlowNodeSchemaAdapter } from '../../schema/node-schema-adapter';
import { resolveAgentFlowNodeSchema } from '../../schema/node-schema-registry';
import { useNodeInteractions } from '../../hooks/interactions/use-node-interactions';
import type { AgentFlowEnvironmentVariable } from '../../lib/application-environment-variables';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import { NodeDetailHeader } from './NodeDetailHeader';
import { NodeConfigTab } from './tabs/NodeConfigTab';
import { NodeLastRunTab } from './tabs/NodeLastRunTab';

const nodeDetailShellSchema = {
  schemaVersion: '1.0.0',
  shellType: 'dock_panel',
  title: '节点详情'
} as const;

export function NodeDetailPanel({
  onClose,
  onRunNode,
  applicationId,
  activeRunId,
  environmentVariables = [],
  onResolveRunScope,
  runLoading = false
}: {
  onClose: () => void;
  onRunNode?: (() => void) | undefined;
  applicationId?: string;
  activeRunId?: string | null;
  environmentVariables?: AgentFlowEnvironmentVariable[];
  onResolveRunScope?: ((runId: string | null) => void) | undefined;
  runLoading?: boolean;
}) {
  const nodeDetailTab = useAgentFlowEditorStore((state) => state.nodeDetailTab);
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);
  const document = useAgentFlowEditorStore((state) => state.workingDocument);
  const selectedNodeId = useAgentFlowEditorStore(
    (state) => state.selectedNodeId
  );
  const setWorkingDocument = useAgentFlowEditorStore(
    (state) => state.setWorkingDocument
  );
  const { openNodePicker } = useNodeInteractions();
  const runtime = useMemo(() => {
    if (!selectedNodeId) {
      return { selectedNodeId: null, schema: null, adapter: null };
    }

    const selectedNode = document.graph.nodes.find(
      (node) => node.id === selectedNodeId
    );

    if (!selectedNode) {
      return { selectedNodeId: null, schema: null, adapter: null };
    }

    const schema = resolveAgentFlowNodeSchema(selectedNode.type);
    const adapter = createAgentFlowNodeSchemaAdapter({
      document,
      nodeId: selectedNodeId,
      environmentVariables,
      setWorkingDocument,
      dispatch(actionKey, payload) {
        if (actionKey === 'openNodePicker') {
          openNodePicker(
            (payload as { nodeId?: string } | undefined)?.nodeId ??
              selectedNodeId
          );
        }
      }
    });

    return {
      selectedNodeId,
      schema,
      adapter
    };
  }, [
    document,
    environmentVariables,
    openNodePicker,
    selectedNodeId,
    setWorkingDocument
  ]);

  if (!runtime.selectedNodeId || !runtime.schema || !runtime.adapter) {
    return null;
  }

  return (
    <SchemaDockPanel
      bodyClassName="agent-flow-node-detail__body"
      className="agent-flow-node-detail"
      headerless
      schema={nodeDetailShellSchema}
    >
      <div
        className="agent-flow-node-detail__body"
        data-testid="node-detail-body"
      >
        <NodeDetailHeader
          adapter={runtime.adapter}
          onClose={onClose}
          onRunNode={onRunNode}
          runLoading={runLoading}
          schema={runtime.schema}
        />
        <Tabs
          activeKey={nodeDetailTab}
          onChange={(key) =>
            setPanelState({ nodeDetailTab: key as 'config' | 'lastRun' })
          }
          items={[
            {
              key: 'config',
              label: '设置',
              children: (
                <NodeConfigTab
                  adapter={runtime.adapter}
                  schema={runtime.schema}
                />
              )
            },
            {
              key: 'lastRun',
              label: '上次运行',
              forceRender: true,
              children: (
                <NodeLastRunTab
                  activeRunId={activeRunId}
                  adapter={runtime.adapter}
                  applicationId={applicationId}
                  nodeId={runtime.selectedNodeId}
                  onResolveRunScope={onResolveRunScope}
                  schema={runtime.schema}
                />
              )
            }
          ]}
        />
      </div>
    </SchemaDockPanel>
  );
}
