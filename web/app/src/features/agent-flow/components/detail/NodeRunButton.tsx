import { CaretRightOutlined } from '@ant-design/icons';
import { Button } from 'antd';

export function NodeRunButton({
  onRunNode,
  loading = false
}: {
  onRunNode?: (() => void) | undefined;
  loading?: boolean;
}) {
  return (
    <Button
      aria-label="运行当前节点"
      disabled={!onRunNode || loading}
      icon={<CaretRightOutlined />}
      loading={loading}
      type="text"
      onClick={() => onRunNode?.()}
    />
  );
}
