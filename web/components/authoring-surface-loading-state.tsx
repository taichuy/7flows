import { Card, Skeleton, Space, Spin, Typography } from "antd";

const { Paragraph, Text, Title } = Typography;

export type AuthoringSurfaceLoadingStateProps = {
  title: string;
  summary: string;
  detail: string;
};

export function AuthoringSurfaceLoadingState({
  title,
  summary,
  detail
}: AuthoringSurfaceLoadingStateProps) {
  return (
    <Card
      aria-busy="true"
      className="authoring-surface-loading-card"
      data-component="authoring-surface-loading-state"
      data-loading-ui="antd"
      style={{ width: "100%", maxWidth: 720, margin: "0 auto" }}
      styles={{ body: { padding: 32 } }}
      variant="borderless"
    >
      <Space orientation="vertical" size={24} style={{ width: "100%" }}>
        <Space align="start" size={16} style={{ width: "100%" }}>
          <Spin size="large" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text type="secondary">加载中</Text>
            <Title level={4} style={{ margin: "8px 0 0" }}>
              {title}
            </Title>
            <Paragraph style={{ margin: "8px 0 0" }} type="secondary">
              {summary}
            </Paragraph>
          </div>
        </Space>

        <Paragraph style={{ margin: 0 }} type="secondary">
          {detail}
        </Paragraph>

        <Skeleton active paragraph={{ rows: 3 }} title={{ width: "48%" }} />

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
          }}
        >
          <Skeleton active paragraph={{ rows: 2 }} title={{ width: "52%" }} />
          <Skeleton active paragraph={{ rows: 2 }} title={{ width: "44%" }} />
        </div>
      </Space>
    </Card>
  );
}
