import { Card, Space, Statistic, Tag, Typography } from "antd";

import type { WorkspaceSignal } from "@/components/workspace-apps-workbench/shared";

const { Paragraph, Text, Title } = Typography;

export function WorkspaceCatalogHeader({
  workspaceName,
  currentRoleLabel,
  catalogDescription,
  workspaceSignals
}: {
  workspaceName: string;
  currentRoleLabel: string;
  catalogDescription: string;
  workspaceSignals: WorkspaceSignal[];
}) {
  return (
    <section
      className="workspace-apps-stage-header"
      data-component="workspace-catalog-header"
    >
      <Card className="workspace-catalog-card" variant="borderless">
        <Space className="workspace-apps-stage-copy" orientation="vertical" size={16} style={{ width: "100%" }}>
          <Space size={8} wrap>
            <Text type="secondary">Workspace</Text>
            <Tag color="blue">{workspaceName}</Tag>
            <Tag color="gold">当前身份：{currentRoleLabel}</Tag>
          </Space>

          <div className="workspace-apps-stage-title-row">
            <div>
              <Title level={2}>应用工作台</Title>
              <Paragraph className="workspace-muted workspace-apps-stage-copy-text">
                {catalogDescription}
              </Paragraph>
            </div>
          </div>

          <Space size={12} wrap>
            {workspaceSignals.map((signal) => (
              <Card key={signal.label} size="small">
                <Statistic title={signal.label} value={signal.value} />
              </Card>
            ))}
          </Space>
        </Space>
      </Card>
    </section>
  );
}
