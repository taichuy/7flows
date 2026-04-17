import { CaretRightOutlined } from '@ant-design/icons';
import { Button } from 'antd';

export function NodeRunButton({
  onRunNode
}: {
  onRunNode?: (() => void) | undefined;
}) {
  return (
    <Button
      aria-label="运行当前节点"
      disabled={!onRunNode}
      icon={<CaretRightOutlined />}
      type="text"
      onClick={() => onRunNode?.()}
    />
  );
}
