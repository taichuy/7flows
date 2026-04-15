import type { NodeProps } from '@xyflow/react';

import { NodePickerPopover } from '../node-picker/NodePickerPopover';
import type { AgentFlowCanvasNode } from './node-registry';

export function AgentFlowNodeCard({
  data,
  selected
}: NodeProps<AgentFlowCanvasNode>) {
  return (
    <div
      className={`agent-flow-node-card${selected ? ' agent-flow-node-card--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => data.onSelectNode(data.nodeId)}
      onDoubleClick={() => {
        if (data.canEnterContainer) {
          data.onOpenContainer(data.nodeId);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          data.onSelectNode(data.nodeId);
        }
      }}
    >
      <div className="agent-flow-node-card__eyebrow">
        <span>{data.alias === data.typeLabel ? 'Node' : data.typeLabel}</span>
        {data.issueCount > 0 ? (
          <span className="agent-flow-node-card__badge">{data.issueCount}</span>
        ) : null}
      </div>
      <div className="agent-flow-node-card__title">{data.alias}</div>
      <div className="agent-flow-node-card__actions">
        <NodePickerPopover
          ariaLabel={`在 ${data.alias} 后新增节点`}
          open={data.pickerOpen}
          onOpenChange={(open) => {
            if (open) {
              data.onOpenPicker(data.nodeId);
              return;
            }

            data.onClosePicker();
          }}
          onPickNode={(nodeType) => data.onInsertNode(data.nodeId, nodeType)}
        />
      </div>
    </div>
  );
}
