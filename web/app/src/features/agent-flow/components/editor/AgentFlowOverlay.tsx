import { Button, Space, Tag, Typography } from 'antd';

interface AgentFlowOverlayProps {
  applicationName: string;
  autosaveLabel: string;
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onSaveDraft: () => void;
  saveDisabled: boolean;
  saveLoading: boolean;
  onOpenIssues: () => void;
  onOpenHistory: () => void;
  onOpenPublish: () => void;
  publishDisabled: boolean;
}

export function AgentFlowOverlay({
  applicationName,
  autosaveLabel,
  autosaveStatus,
  onSaveDraft,
  saveDisabled,
  saveLoading,
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
      <div className="agent-flow-editor__overlay-status" style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Text strong style={{ marginRight: 12, fontSize: 16 }}>
          {applicationName}
        </Typography.Text>
        <Tag color="green" bordered={false}>{autosaveLabel}</Tag>
        <Tag color={statusTag.color} bordered={false}>{statusTag.label}</Tag>
      </div>
      <Space size="small">
        <Button onClick={onOpenIssues}>Issues</Button>
        <Button onClick={onOpenHistory}>历史版本</Button>
        <Button
          autoInsertSpace={false}
          disabled={saveDisabled}
          loading={saveLoading}
          onClick={onSaveDraft}
        >
          保存
        </Button>
        <Button type="primary" disabled={publishDisabled} onClick={onOpenPublish}>
          发布配置
        </Button>
      </Space>
    </div>
  );
}
