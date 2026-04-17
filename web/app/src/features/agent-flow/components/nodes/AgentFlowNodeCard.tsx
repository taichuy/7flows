import { Tooltip } from 'antd';
import { Position, type NodeProps } from '@xyflow/react';

import { SchemaRenderer } from '../../../../shared/schema-ui/runtime/SchemaRenderer';
import { CanvasHandle } from '../canvas/CanvasHandle';
import { NodePickerPopover } from '../node-picker/NodePickerPopover';
import type { AgentFlowCanvasNode } from '../canvas/node-types';
import { agentFlowRendererRegistry } from '../../schema/agent-flow-renderer-registry';

export function AgentFlowNodeCard({
  data,
  selected
}: NodeProps<AgentFlowCanvasNode>) {
  const cardAdapter = {
    getValue(path: string) {
      if (path === 'alias') {
        return data.alias;
      }

      if (path === 'description') {
        return data.description;
      }

      if (path.startsWith('config.')) {
        return data.config[path.slice('config.'.length)];
      }

      return null;
    },
    setValue: () => undefined,
    getDerived(key: string) {
      if (key === 'node') {
        return {
          id: data.nodeId,
          type: data.nodeType,
          alias: data.alias,
          description: data.description,
          config: data.config,
          outputs: []
        };
      }

      if (key === 'issueCount') {
        return data.issueCount;
      }

      if (key === 'typeLabel') {
        return data.typeLabel;
      }

      return null;
    },
    dispatch: () => undefined
  } as const;

  return (
    <>
      {data.showTargetHandle ? (
        <CanvasHandle
          type="target"
          position={Position.Left}
          className="agent-flow-node-handle agent-flow-node-handle--target"
        />
      ) : null}
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
        <SchemaRenderer
          adapter={cardAdapter}
          blocks={data.nodeSchema.card.blocks}
          registry={agentFlowRendererRegistry}
        />
      </div>
      {data.showSourceHandle ? (
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
        >
          <Tooltip
            title={
              <div style={{ textAlign: 'center', fontSize: 12, padding: '2px 0' }}>
                <div>点击添加节点</div>
                <div>拖拽连接节点</div>
              </div>
            }
            placement="top"
            color="#ffffff"
            overlayInnerStyle={{ color: '#333', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            open={!data.pickerOpen ? undefined : false} /* Disable tooltip when popover is open */
          >
            <CanvasHandle
              type="source"
              position={Position.Right}
              aria-expanded={data.pickerOpen}
              aria-haspopup="menu"
              aria-label={`在 ${data.alias} 后新增节点`}
              className="agent-flow-node-handle agent-flow-node-handle--source"
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();

                if (data.pickerOpen) {
                  data.onClosePicker();
                  return;
                }

                data.onOpenPicker(data.nodeId);
              }}
            >
              <span aria-hidden="true" className="agent-flow-node-handle__icon">
                +
              </span>
            </CanvasHandle>
          </Tooltip>
        </NodePickerPopover>
      ) : null}
    </>
  );
}
