import { Button, Space, Tag, Typography } from 'antd';

interface AgentFlowOverlayProps {
  applicationName: string;
  autosaveLabel: string;
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onOpenIssues: () => void;
  onOpenHistory: () => void;
  onOpenPublish: () => void;
  publishDisabled: boolean;
}

export function AgentFlowOverlay({
  applicationName,
  autosaveLabel,
  autosaveStatus,
  onOpenIssues,
  onOpenHistory,
  onOpenPublish,
  publishDisabled
}: AgentFlowOverlayProps) {
  const statusTag = {
    idle: { color: 'default', label: '空闲' },
    saving: { color: 'blue', label: '正在保存' },
    saved: { color: 'green', label: '已保存' },
    error: { color: 'red', label: '保存失败' }
  }[autosaveStatus];

  return (
    <div className="agent-flow-editor__overlay">
      <div>
        <Typography.Title className="agent-flow-editor__title" level={4}>
          {applicationName}
        </Typography.Title>
        <Space size="small">
          <Tag color="green">{autosaveLabel}</Tag>
          <Tag color={statusTag.color}>{statusTag.label}</Tag>
        </Space>
      </div>
      <Space size="small">
        <Button onClick={onOpenIssues}>Issues</Button>
        <Button onClick={onOpenHistory}>历史版本</Button>
        <Button disabled={publishDisabled} onClick={onOpenPublish}>
          发布配置
        </Button>
      </Space>
    </div>
  );
}
