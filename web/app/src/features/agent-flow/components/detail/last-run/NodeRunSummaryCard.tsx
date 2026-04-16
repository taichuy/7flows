import { Card, Descriptions, Typography } from 'antd';

export function NodeRunSummaryCard() {
  return (
    <Card title="运行摘要">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="状态">--</Descriptions.Item>
        <Descriptions.Item label="运行时间">--</Descriptions.Item>
        <Descriptions.Item label="总 token 数">--</Descriptions.Item>
      </Descriptions>
      <Typography.Text type="secondary">
        当前版本暂未接入运行数据
      </Typography.Text>
    </Card>
  );
}
