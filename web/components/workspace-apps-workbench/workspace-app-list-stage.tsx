import { Button, Card, Pagination, Space, Tag, Typography } from "antd";

import type { WorkspaceAppCard } from "@/components/workspace-apps-workbench/shared";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { getWorkspaceAppSurface, getWorkspaceBadgeLabel } from "@/lib/workspace-ui";

const { Paragraph, Text, Title } = Typography;

function WorkspaceEmptyTile({
  activeModeLabel,
  onOpenCreate
}: {
  activeModeLabel: string | null;
  onOpenCreate: () => void;
}) {
  return (
    <Card
      className="workspace-app-empty-tile workspace-app-card-empty-dify workspace-catalog-card"
      data-component="workspace-app-directory-empty"
      variant="borderless"
    >
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Text type="secondary">应用列表</Text>
        <Title level={4} style={{ margin: 0 }}>
          当前筛选范围内还没有{activeModeLabel ? ` ${activeModeLabel}` : ""}应用
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          先从工作台创建入口或 Starter 开始，再进入 xyflow 补齐节点与治理细节。
        </Paragraph>
        <Space wrap>
          <Button onClick={onOpenCreate} type="primary">
            立即创建
          </Button>
          <Button href="/workspace-starters">查看 Starter</Button>
        </Space>
      </Space>
    </Card>
  );
}

function WorkspaceAppTile({
  card,
  currentUserDisplayName,
  onOpenEdit
}: {
  card: WorkspaceAppCard;
  currentUserDisplayName: string;
  onOpenEdit: (card: WorkspaceAppCard) => void;
}) {
  const appSurface = getWorkspaceAppSurface({
    followUpCount: card.followUpCount,
    healthLabel: card.healthLabel,
    missingToolCount: card.missingToolCount,
    publishCount: card.publishCount,
    status: card.status
  });
  const trackLabel = `${card.track.priority} · ${card.track.id}`;

  return (
    <Card
      className="workspace-catalog-card workspace-app-card-directory-item"
      data-component="workspace-app-card"
      extra={<Tag color={card.followUpCount > 0 ? "warning" : "default"}>{appSurface.statusLabel}</Tag>}
      title={
        <Space align="start" size={12}>
          <div className="workspace-app-icon" aria-hidden="true">
            {getWorkspaceBadgeLabel(card.name, "A")}
          </div>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {card.name}
            </Title>
            <Text type="secondary">
              {card.nodeCount} 个节点 · {currentUserDisplayName}
            </Text>
          </div>
        </Space>
      }
      variant="borderless"
    >
      <Space orientation="vertical" size={12} style={{ width: "100%" }}>
        <Space size={8} wrap>
          <Tag color="processing">{card.mode.label}</Tag>
          <Tag>{trackLabel}</Tag>
          <Tag>{appSurface.publishLabel}</Tag>
          {card.followUpCount > 0 ? <Tag color="warning">待治理 {card.followUpCount}</Tag> : null}
        </Space>

        <Paragraph style={{ marginBottom: 0 }}>{appSurface.digest}</Paragraph>
        <Paragraph style={{ marginBottom: 0 }} type="secondary">
          {card.recommendedNextStep}
        </Paragraph>

        <div className="workspace-app-card-directory-meta">
          <Text type="secondary">最近更新 {formatTimestamp(card.updatedAt)}</Text>
        </div>

        <Space className="workspace-app-card-actions" size={8} wrap>
          <Button href={card.href} type="primary">
            进入 Studio
          </Button>
          <Button onClick={() => onOpenEdit(card)}>编辑基础信息</Button>
        </Space>
      </Space>
    </Card>
  );
}

export function WorkspaceAppListStage({
  visibleAppSummary,
  filteredApps,
  paginatedApps,
  activeModeLabel,
  currentUserDisplayName,
  currentPage,
  totalPages,
  pageSize,
  onOpenCreate,
  onOpenEdit,
  onPageChange
}: {
  visibleAppSummary: string;
  filteredApps: WorkspaceAppCard[];
  paginatedApps: WorkspaceAppCard[];
  activeModeLabel: string | null;
  currentUserDisplayName: string;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onOpenCreate: () => void;
  onOpenEdit: (card: WorkspaceAppCard) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <section
      className="workspace-app-list-stage workspace-catalog-card"
      data-component="workspace-app-list-stage"
    >
      <Card variant="borderless">
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <div className="workspace-app-list-stage-header">
            <div>
              <p className="workspace-app-list-stage-summary">{visibleAppSummary}</p>
              <p className="workspace-muted workspace-app-list-stage-copy">
                卡片目录支持分页；创建与基础编辑都收口进工作台 modal。
              </p>
            </div>
            <Text type="secondary">当前仅提供进入 Studio 与编辑基础信息；删除与复制待后端契约。</Text>
          </div>

          {filteredApps.length === 0 ? (
            <WorkspaceEmptyTile activeModeLabel={activeModeLabel} onOpenCreate={onOpenCreate} />
          ) : (
            <>
              <div
                className="workspace-app-card-directory"
                data-component="workspace-app-card-directory"
                style={{
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))"
                }}
              >
                {paginatedApps.map((card) => (
                  <WorkspaceAppTile
                    card={card}
                    currentUserDisplayName={currentUserDisplayName}
                    key={card.id}
                    onOpenEdit={onOpenEdit}
                  />
                ))}
              </div>

              <div className="workspace-app-pagination-footer">
                <Text data-component="workspace-app-pagination-summary" type="secondary">
                  第 {currentPage} / {totalPages} 页 · 当前显示 {paginatedApps.length} / {filteredApps.length} 个应用
                </Text>
                {filteredApps.length > pageSize ? (
                  <Pagination
                    current={currentPage}
                    data-component="workspace-app-pagination"
                    onChange={onPageChange}
                    pageSize={pageSize}
                    showSizeChanger={false}
                    size="small"
                    total={filteredApps.length}
                  />
                ) : null}
              </div>
            </>
          )}
        </Space>
      </Card>
    </section>
  );
}
