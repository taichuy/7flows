import { CloseOutlined } from '@ant-design/icons';
import { Button, Space, Typography } from 'antd';
import type { ReactNode } from 'react';

import { SchemaDockPanel } from '../../../../shared/schema-ui/overlay-shell/SchemaDockPanel';

interface AgentFlowDockPanelProps {
  actions?: ReactNode;
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  title: string;
  onClose: () => void;
}

export function AgentFlowDockPanel({
  actions,
  bodyClassName,
  children,
  className,
  closeLabel,
  title,
  onClose
}: AgentFlowDockPanelProps) {
  const shellSchema = {
    schemaVersion: '1.0.0',
    shellType: 'dock_panel',
    title
  } as const;

  return (
    <SchemaDockPanel
      bodyClassName={['agent-flow-editor__dock-panel-body', bodyClassName]
        .filter(Boolean)
        .join(' ')}
      className={['agent-flow-editor__dock-panel', className]
        .filter(Boolean)
        .join(' ')}
      headerless
      schema={shellSchema}
    >
      <div className="agent-flow-editor__dock-panel-header">
        <div className="agent-flow-editor__dock-panel-title">
          <Typography.Text strong>{title}</Typography.Text>
        </div>
        <Space size={4} wrap>
          {actions}
          <Button
            aria-label={closeLabel ?? `关闭${title}`}
            icon={<CloseOutlined />}
            size="small"
            type="text"
            onClick={onClose}
          />
        </Space>
      </div>
      {children}
    </SchemaDockPanel>
  );
}
