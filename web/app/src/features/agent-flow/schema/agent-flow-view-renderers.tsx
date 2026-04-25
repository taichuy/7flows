import {
  ApiOutlined,
  BlockOutlined,
  BookOutlined,
  EditOutlined,
  FileTextOutlined,
  HomeOutlined,
  PlaySquareOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  CloudOutlined
} from '@ant-design/icons';
import { Button, Card, Empty, Select, Space, Switch, Typography } from 'antd';

import type {
  SchemaViewRenderer,
  SchemaViewRendererProps
} from '../../../shared/schema-ui/registry/create-renderer-registry';
import { NodeRunIOCard } from '../components/detail/last-run/NodeRunIOCard';
import { NodeRunMetadataCard } from '../components/detail/last-run/NodeRunMetadataCard';
import { NodeRunSummaryCard } from '../components/detail/last-run/NodeRunSummaryCard';
import type { NodeLastRun } from '../api/runtime';
import { getLlmModelProvider } from '../lib/llm-node-config';

function getNode(adapter: SchemaViewRendererProps['adapter']) {
  return adapter.getDerived('node') as
    | {
        id: string;
        type: string;
        alias: string;
        description?: string;
        config: Record<string, unknown>;
        outputs: Array<{ key: string; title: string; valueType: string }>;
      }
    | null
    | undefined;
}

/** 节点类型 → 图标映射 */
const NODE_TYPE_ICONS: Record<string, React.ReactNode> = {
  start: <PlaySquareOutlined />,
  llm: <ThunderboltOutlined />,
  template_transform: <FileTextOutlined />,
  knowledge_retrieval: <SearchOutlined />,
  question_classifier: <QuestionCircleOutlined />,
  if_else: <SwapOutlined />,
  http_request: <ApiOutlined />,
  tool: <ToolOutlined />,
  variable_assigner: <EditOutlined />,
  iteration: <SyncOutlined />,
  loop: <ReloadOutlined />,
  plugin_node: <BlockOutlined />
};

function renderSummaryView({ adapter, block }: SchemaViewRendererProps) {
  const node = getNode(adapter);
  const meta = adapter.getDerived('definitionMeta') as
    | { summary?: string; helpHref?: string | null }
    | null
    | undefined;

  if (!node) {
    return null;
  }

  return (
    <Card
      extra={
        meta?.helpHref ? (
          <Typography.Link href={meta.helpHref} target="_blank">
            <Space size={4}>
              <BookOutlined />
              帮助文档
            </Space>
          </Typography.Link>
        ) : null
      }
      title={block.title ?? '节点说明'}
    >
      <Typography.Paragraph>
        {meta?.summary ?? node.description ?? '暂无节点说明'}
      </Typography.Paragraph>
    </Card>
  );
}

function renderCardEyebrowView({ adapter }: SchemaViewRendererProps) {
  const node = getNode(adapter);
  const typeLabel = String(adapter.getDerived('typeLabel') ?? node?.type ?? 'Node');
  const issueCount = Number(adapter.getDerived('issueCount') ?? 0);

  if (!node) {
    return null;
  }

  const typeIcon = NODE_TYPE_ICONS[node.type];
  const displayLabel = node.alias === typeLabel ? 'Node' : typeLabel;

  return (
    <div className="agent-flow-node-card__eyebrow">
      <span className="agent-flow-node-card__eyebrow-left">
        {typeIcon ? <span className="agent-flow-node-card__type-icon">{typeIcon}</span> : null}
        <span className="agent-flow-node-card__type-label">{displayLabel}</span>
      </span>
      {issueCount > 0 ? <span className="agent-flow-node-card__badge">{issueCount}</span> : null}
    </div>
  );
}

function renderCardTitleView({ adapter }: SchemaViewRendererProps) {
  const node = getNode(adapter);

  return node ? <div className="agent-flow-node-card__title">{node.alias}</div> : null;
}

function renderCardModelView({ adapter }: SchemaViewRendererProps) {
  const node = getNode(adapter);

  if (!node || node.type !== 'llm') {
    return null;
  }

  const modelProvider = getLlmModelProvider(node.config);
  const providerCode = modelProvider.provider_code.trim();
  const model = modelProvider.model_id.trim();

  return (
    <div className="agent-flow-node-card__model agent-flow-node-card__model--llm">
      <span className="agent-flow-node-card__model-provider" aria-hidden="true">
        <CloudOutlined />
      </span>
      <span className="agent-flow-node-card__model-content">
        <span className="agent-flow-node-card__model-provider-label">
          {modelProvider.provider_label || providerCode || '模型供应商未选择'}
        </span>
        <span className="agent-flow-node-card__model-label">
          {modelProvider.model_label || model || '选择模型'}
        </span>
      </span>
    </div>
  );
}

function renderCardDescriptionView({ adapter }: SchemaViewRendererProps) {
  const node = getNode(adapter);
  const description = node?.description?.trim();

  return description ? <div className="agent-flow-node-card__description">{description}</div> : null;
}

function renderOutputContractView({ adapter, block }: SchemaViewRendererProps) {
  const node = getNode(adapter);
  const outputs = (adapter.getValue('config.output_contract') as Array<{
    key: string;
    title: string;
    valueType: string;
  }>) ?? node?.outputs ?? [];

  if (!node) {
    return null;
  }

  const title = node.type === 'start' ? '输入字段' : '输出变量';
  const subtitle = node.type === 'start' ? '设置的输入可在工作流程中使用' : '节点产出的数据字段';

  return (
    <div className="agent-flow-node-detail__section">
      <div className="agent-flow-node-detail__section-header">
        <Typography.Title level={5} className="agent-flow-node-detail__section-title">
          {block.title ?? title}
        </Typography.Title>
        <Button type="text" icon={<PlusOutlined />} size="small" aria-label="新增输出变量" />
      </div>
      <Typography.Text
        className="agent-flow-node-detail__section-subtitle"
        style={{ display: 'block', textAlign: 'center', marginBottom: 16 }}
      >
        {subtitle}
      </Typography.Text>
      {outputs.length > 0 ? (
        <div className="agent-flow-node-detail__list">
          {outputs.map((output) => (
            <div key={output.key} className="agent-flow-node-detail__list-item">
              <div className="agent-flow-node-detail__list-item-left">
                <span className="agent-flow-node-detail__list-item-icon">{'{x}'}</span>
                <span className="agent-flow-node-detail__list-item-name">{output.key}</span>
              </div>
              <span className="agent-flow-node-detail__list-item-type">{output.valueType}</span>
            </div>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无字段" />
      )}
    </div>
  );
}

function renderPolicyGroupView({ adapter }: SchemaViewRendererProps) {
  const retryEnabled = Boolean(adapter.getValue('config.retry_enabled'));
  const errorPolicy = (adapter.getValue('config.error_policy') as string | undefined) ?? 'none';

  const errorPolicyOptions = [
    {
      value: 'none',
      label: '无',
      description: '当发生异常且未处理时，节点将停止运行'
    },
    {
      value: 'default_value',
      label: '默认值',
      description: '当发生异常时，指定默认输出内容。'
    },
    {
      value: 'error_branch',
      label: '异常分支',
      description: '当发生异常时，将执行异常分支'
    }
  ] satisfies Array<{ value: string; label: string; description: string }>;

  return (
    <div className="agent-flow-node-detail__policies">
      <div className="agent-flow-node-detail__policy-row" data-testid="node-policy-row">
        <Typography.Text className="agent-flow-node-detail__policy-label">
          失败重试
        </Typography.Text>
        <Switch
          aria-label="失败重试"
          checked={retryEnabled}
          className="agent-flow-node-detail__policy-control"
          onChange={(checked) => adapter.setValue('config.retry_enabled', checked)}
        />
      </div>
      <div
        className="agent-flow-node-detail__policy-row agent-flow-node-detail__policy-row--select"
        data-testid="node-policy-row"
      >
        <Typography.Text className="agent-flow-node-detail__policy-label">
          异常处理
        </Typography.Text>
        <div
          className="agent-flow-node-detail__policy-select-shell agent-flow-node-detail__policy-select-shell--compact"
          data-testid="node-policy-error"
        >
          <Select
            aria-label="异常处理"
            className="agent-flow-node-detail__policy-control agent-flow-node-detail__policy-select"
            options={errorPolicyOptions}
            optionRender={(option) => {
              const policy = option.data as (typeof errorPolicyOptions)[number];

              return (
                <div className="agent-flow-node-detail__policy-option">
                  <div className="agent-flow-node-detail__policy-option-title">
                    {policy.label}
                  </div>
                  <div className="agent-flow-node-detail__policy-option-description">
                    {policy.description}
                  </div>
                </div>
              );
            }}
            classNames={{
              popup: {
                root: 'agent-flow-node-detail__policy-dropdown'
              }
            }}
            popupMatchSelectWidth={false}
            value={errorPolicy}
            onChange={(value) => adapter.setValue('config.error_policy', value)}
          />
        </div>
      </div>
    </div>
  );
}

function renderRelationsView({ adapter, block }: SchemaViewRendererProps) {
  const node = getNode(adapter);
  const downstreamNodes = (adapter.getDerived('downstreamNodes') as Array<{
    id: string;
    alias: string;
  }>) ?? [];

  if (!node) {
    return null;
  }

  return (
    <div className="agent-flow-node-detail__section">
      <Typography.Title level={5} className="agent-flow-node-detail__section-title">
        {block.title ?? '下一步'}
      </Typography.Title>
      <Typography.Text className="agent-flow-node-detail__section-subtitle">
        添加此工作流程中的下一个节点
      </Typography.Text>
      <div className="agent-flow-node-detail__relation-list" style={{ marginTop: 12 }}>
        <div className="agent-flow-node-detail__relation-source">
          <HomeOutlined />
        </div>
        <div className="agent-flow-node-detail__relation-line" />
        <div className="agent-flow-node-detail__relation-nodes">
          {downstreamNodes.map((downstreamNode) => (
            <div key={downstreamNode.id} className="agent-flow-node-detail__relation-item">
              <div className="agent-flow-node-detail__relation-item-icon">
                <HomeOutlined style={{ fontSize: 12 }} />
              </div>
              {downstreamNode.alias}
            </div>
          ))}
          <div
            className="agent-flow-node-detail__relation-add"
            onClick={() => adapter.dispatch('openNodePicker', { nodeId: node.id })}
          >
            <PlusOutlined /> 添加并行节点
          </div>
        </div>
      </div>
    </div>
  );
}

function renderRuntimeSummaryView({ adapter, block }: SchemaViewRendererProps) {
  const lastRun = adapter.getDerived('lastRun') as NodeLastRun | null | undefined;

  return (
    lastRun ? <NodeRunSummaryCard lastRun={lastRun} /> : (
      <Card title={block.title ?? '运行摘要'}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前节点还没有运行记录" />
      </Card>
    )
  );
}

function renderRuntimeIoView({ adapter, block }: SchemaViewRendererProps) {
  const lastRun = adapter.getDerived('lastRun') as NodeLastRun | null | undefined;

  return (
    lastRun ? <NodeRunIOCard lastRun={lastRun} /> : (
      <Card title={block.title ?? '运行输入输出'}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无运行输入输出" />
      </Card>
    )
  );
}

function renderRuntimeMetadataView({ adapter, block }: SchemaViewRendererProps) {
  const lastRun = adapter.getDerived('lastRun') as NodeLastRun | null | undefined;

  return (
    lastRun ? <NodeRunMetadataCard lastRun={lastRun} /> : (
      <Card title={block.title ?? '运行元数据'}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无运行元数据" />
      </Card>
    )
  );
}

export const agentFlowViewRenderers = {
  card_eyebrow: renderCardEyebrowView,
  card_title: renderCardTitleView,
  card_model: renderCardModelView,
  card_description: renderCardDescriptionView,
  summary: renderSummaryView,
  output_contract: renderOutputContractView,
  policy_group: renderPolicyGroupView,
  relations: renderRelationsView,
  runtime_summary: renderRuntimeSummaryView,
  runtime_io: renderRuntimeIoView,
  runtime_metadata: renderRuntimeMetadataView
} satisfies Record<string, SchemaViewRenderer>;
