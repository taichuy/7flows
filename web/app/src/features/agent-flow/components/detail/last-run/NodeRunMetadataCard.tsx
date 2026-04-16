import { Card, Descriptions } from 'antd';

export function NodeRunMetadataCard() {
  return (
    <Card title="元数据">
      <Descriptions column={1} size="small">
        <Descriptions.Item label="状态">--</Descriptions.Item>
        <Descriptions.Item label="执行人">N/A</Descriptions.Item>
        <Descriptions.Item label="开始时间">--</Descriptions.Item>
        <Descriptions.Item label="运行时间">--</Descriptions.Item>
        <Descriptions.Item label="总 token 数">--</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
