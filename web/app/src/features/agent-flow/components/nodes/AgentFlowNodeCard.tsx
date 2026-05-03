import {
  DeleteOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  SwapOutlined
} from '@ant-design/icons';
import { Button, Dropdown, Tooltip, type MenuProps } from 'antd';
import { Position, type NodeProps } from '@xyflow/react';
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react';

import { SchemaRenderer } from '../../../../shared/schema-ui/runtime/SchemaRenderer';
import { CanvasHandle } from '../canvas/CanvasHandle';
import { NodePickerPopover } from '../node-picker/NodePickerPopover';
import type { AgentFlowCanvasNode } from '../canvas/node-types';
import { agentFlowRendererRegistry } from '../../schema/agent-flow-renderer-registry';
import { getNodeDefinitionMeta } from '../../lib/node-definitions';
import {
  getNodePickerOptionDescription,
  getNodePickerOptionKey
} from '../../lib/plugin-node-definitions';

const QUICK_ACTION_HIDE_DELAY_MS = 1000;

export function AgentFlowNodeCard({
  data,
  selected
}: NodeProps<AgentFlowCanvasNode>) {
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const hideQuickActionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const stopActionEvent = (event: ReactMouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };
  const clearHideQuickActionsTimer = () => {
    if (hideQuickActionsTimerRef.current === null) {
      return;
    }

    clearTimeout(hideQuickActionsTimerRef.current);
    hideQuickActionsTimerRef.current = null;
  };
  const showQuickActions = () => {
    clearHideQuickActionsTimer();
    setQuickActionsVisible(true);
  };
  const scheduleHideQuickActions = () => {
    clearHideQuickActionsTimer();
    hideQuickActionsTimerRef.current = setTimeout(() => {
      setQuickActionsVisible(false);
      hideQuickActionsTimerRef.current = null;
    }, QUICK_ACTION_HIDE_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (hideQuickActionsTimerRef.current !== null) {
        clearTimeout(hideQuickActionsTimerRef.current);
      }
    };
  }, []);
  const nodePickerOptions = data.nodePickerOptions ?? [];
  const replaceItems: MenuProps['items'] = nodePickerOptions.map((option) => ({
    key: getNodePickerOptionKey(option),
    label: getNodePickerOptionDescription(option)
      ? `${option.label} · ${getNodePickerOptionDescription(option)}`
      : option.label,
    disabled: option.kind === 'plugin_contribution' && option.disabled,
    onClick: ({ domEvent }) => {
      domEvent.stopPropagation();
      data.onReplaceNode(data.nodeId, option);
    }
  }));
  const menuItems: MenuProps['items'] = [
    {
      key: 'run',
      icon: <PlayCircleOutlined />,
      label: '执行此节点',
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        data.onSelectNode(data.nodeId);
        data.onRunNode(data.nodeId);
      }
    },
    {
      key: 'replace',
      icon: <SwapOutlined />,
      label: '更换节点',
      children: replaceItems
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除节点',
      danger: true,
      onClick: ({ domEvent }) => {
        domEvent.stopPropagation();
        data.onDeleteNode(data.nodeId);
      }
    }
  ];
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

      if (key === 'typeLabel') {
        return data.typeLabel;
      }

      if (key === 'definitionMeta') {
        return getNodeDefinitionMeta(data.nodeType);
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
        className={`agent-flow-node-card agent-flow-node-card--theme-unified agent-flow-node-card--type-${data.nodeType}${selected ? ' agent-flow-node-card--selected' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => data.onSelectNode(data.nodeId)}
        onMouseEnter={showQuickActions}
        onMouseLeave={scheduleHideQuickActions}
        onFocus={showQuickActions}
        onBlur={scheduleHideQuickActions}
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
        <div
          className={`agent-flow-node-card__quick-actions${quickActionsVisible ? ' agent-flow-node-card__quick-actions--visible' : ''}`}
          data-testid={`agent-flow-node-quick-actions-${data.nodeId}`}
          onClick={stopActionEvent}
          onDoubleClick={stopActionEvent}
          onMouseEnter={showQuickActions}
          onMouseLeave={scheduleHideQuickActions}
          onMouseDown={stopActionEvent}
        >
          <Tooltip title="执行此节点">
            <Button
              aria-label={`执行 ${data.alias}`}
              className="agent-flow-node-card__quick-action"
              icon={<PlayCircleOutlined />}
              shape="circle"
              size="small"
              type="text"
              onClick={(event) => {
                stopActionEvent(event);
                data.onSelectNode(data.nodeId);
                data.onRunNode(data.nodeId);
              }}
            />
          </Tooltip>
          <Dropdown menu={{ items: menuItems }} trigger={['click']}>
            <Button
              aria-label={`${data.alias} 更多操作`}
              className="agent-flow-node-card__quick-action"
              icon={<MoreOutlined />}
              shape="circle"
              size="small"
              type="text"
              onClick={stopActionEvent}
            />
          </Dropdown>
        </div>
      </div>
      {data.showSourceHandle ? (
        <NodePickerPopover
          ariaLabel={`在 ${data.alias} 后新增节点`}
          open={data.pickerOpen}
          options={data.nodePickerOptions}
          onOpenChange={(open) => {
            if (open) {
              data.onOpenPicker(data.nodeId);
              return;
            }

            data.onClosePicker();
          }}
          onPickNode={(option) => data.onInsertNode(data.nodeId, option)}
        >
          <Tooltip
            title={
              <div
                style={{ textAlign: 'center', fontSize: 12, padding: '2px 0' }}
              >
                <div>点击添加节点</div>
                <div>拖拽连接节点</div>
              </div>
            }
            placement="top"
            color="#ffffff"
            styles={{
              body: {
                color: '#333',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }
            }}
            open={
              !data.pickerOpen ? undefined : false
            } /* Disable tooltip when popover is open */
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
