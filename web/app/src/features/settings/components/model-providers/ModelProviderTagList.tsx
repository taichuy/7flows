import { Tag, Typography } from 'antd';

export function ModelProviderTagList({
  modelIds,
  emptyText = '未设置'
}: {
  modelIds: string[];
  emptyText?: string;
}) {
  if (modelIds.length === 0) {
    return <Typography.Text type="secondary">{emptyText}</Typography.Text>;
  }

  return (
    <div className="model-provider-panel__model-tag-list">
      {modelIds.map((modelId) => (
        <Tag
          key={modelId}
          bordered={false}
          className="model-provider-panel__model-tag"
        >
          {modelId}
        </Tag>
      ))}
    </div>
  );
}
