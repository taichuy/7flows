import type { FlowNodeType } from '@1flowse/flow-schema';
import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import { NodePickerPopover } from '../node-picker/NodePickerPopover';

export function EdgeInsertButton({
  open,
  onOpenChange,
  onPickNode
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickNode: (nodeType: FlowNodeType) => void;
}) {
  return (
    <NodePickerPopover
      ariaLabel="在此连线上新增节点"
      open={open}
      onOpenChange={onOpenChange}
      onPickNode={onPickNode}
      placement="rightTop"
    >
      <Button
        type="primary"
        shape="circle"
        size="small"
        icon={<PlusOutlined style={{ fontSize: 12, fontWeight: 'bold' }} />}
        style={{
          width: 20,
          height: 20,
          minWidth: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(22, 119, 255, 0.3)',
          border: 'none',
          zIndex: 30
        }}
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
      />
    </NodePickerPopover>
  );
}
