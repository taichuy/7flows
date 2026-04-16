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
      type="text"
      onClick={() => onRunNode?.()}
    >
      预览
    </Button>
  );
}
