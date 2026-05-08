import {
  HistoryOutlined,
  IssuesCloseOutlined,
  PlayCircleOutlined,
  SaveOutlined
} from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';

interface AgentFlowOverlayProps {
  applicationName: string;
  autosaveLabel: string;
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onSaveDraft: () => void;
  saveDisabled: boolean;
  saveLoading: boolean;
  onOpenDebugConsole: () => void;
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
  onOpenDebugConsole,
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
      <Space className="agent-flow-editor__overlay-status" size="small">
        <Typography.Text strong>
          {applicationName}
        </Typography.Text>
        <Tag color="green" bordered={false}>
          {autosaveLabel}
        </Tag>
        <Tag color={statusTag.color} bordered={false}>
          {statusTag.label}
        </Tag>
      </Space>
      <Space size="small">
        <Button
          aria-label="Issues"
          icon={<IssuesCloseOutlined />}
          onClick={onOpenIssues}
          title="Issues"
        />
        <Button
          aria-label="历史版本"
          icon={<HistoryOutlined />}
          onClick={onOpenHistory}
          title="历史版本"
        />
        <Button
          aria-label="预览"
          autoInsertSpace={false}
          icon={<PlayCircleOutlined />}
          onClick={onOpenDebugConsole}
          title="预览"
        >
          预览
        </Button>
        <Button
          aria-label="保存"
          autoInsertSpace={false}
          disabled={saveDisabled}
          icon={<SaveOutlined />}
          loading={saveLoading}
          onClick={onSaveDraft}
          title="保存"
        />
        <Button
          autoInsertSpace={false}
          type="primary"
          disabled={publishDisabled}
          onClick={onOpenPublish}
        >
          发布
        </Button>
      </Space>
    </div>
  );
}
