import { Card, Empty } from 'antd';

export function NodeRunIOCard() {
  return (
    <Card title="节点输入输出">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="当前版本暂未接入运行输入输出"
      />
    </Card>
  );
}
