import { Descriptions, Result, Space, Tag, Typography } from 'antd';

import type { ApplicationDetail } from '../api/applications';
import type { ApplicationSectionKey } from '../lib/application-sections';

function renderStatusTag(status: string) {
  return <Tag color={status === 'planned' ? 'gold' : 'default'}>{status}</Tag>;
}

export function ApplicationSectionState({
  application,
  sectionKey
}: {
  application: ApplicationDetail;
  sectionKey: ApplicationSectionKey;
}) {
  if (sectionKey === 'orchestration') {
    return (
      <Space direction="vertical" size="middle">
        <Typography.Title level={4}>编排</Typography.Title>
        <Typography.Paragraph>
          这里是当前应用主编排主体的挂载位。`03` 先冻结主体种类、状态和当前草稿锚点，
          Draft / Version / Graph 在 `04` 接入。
        </Typography.Paragraph>
        <Descriptions
          bordered
          column={1}
          items={[
            {
              key: 'status',
              label: '能力状态',
              children: renderStatusTag(application.sections.orchestration.status)
            },
            {
              key: 'subject_kind',
              label: '主体种类',
              children: application.sections.orchestration.subject_kind
            },
            {
              key: 'subject_status',
              label: '主体状态',
              children: application.sections.orchestration.subject_status
            },
            {
              key: 'subject_id',
              label: '当前主体 ID',
              children: application.sections.orchestration.current_subject_id ?? '未绑定'
            },
            {
              key: 'draft_id',
              label: '当前草稿 ID',
              children: application.sections.orchestration.current_draft_id ?? '未生成'
            }
          ]}
        />
      </Space>
    );
  }

  if (sectionKey === 'api') {
    return (
      <Space direction="vertical" size="middle">
        <Typography.Title level={4}>API</Typography.Title>
        <Typography.Paragraph>
          该分区固定承接应用级凭证与对外交付契约。统一调用 URL 由
          `application_type` 冻结，应用归属由 API Key 绑定应用。
        </Typography.Paragraph>
        <Descriptions
          bordered
          column={1}
          items={[
            {
              key: 'status',
              label: '能力状态',
              children: renderStatusTag(application.sections.api.status)
            },
            {
              key: 'credential_kind',
              label: '凭证类型',
              children: application.sections.api.credential_kind
            },
            {
              key: 'routing_mode',
              label: '路由模式',
              children: application.sections.api.invoke_routing_mode
            },
            {
              key: 'path_template',
              label: '调用路径模板',
              children:
                application.sections.api.invoke_path_template ??
                '由 application_type 冻结，06B 再落地'
            },
            {
              key: 'credentials_status',
              label: '凭证生命周期',
              children: application.sections.api.credentials_status
            }
          ]}
        />
      </Space>
    );
  }

  if (sectionKey === 'monitoring') {
    return (
      <Space direction="vertical" size="middle">
        <Typography.Title level={4}>监控</Typography.Title>
        <Typography.Paragraph>
          该分区对应应用级聚合指标与 tracing / observability 配置，真实图表与配置编辑留到后续专题。
        </Typography.Paragraph>
        <Descriptions
          bordered
          column={1}
          items={[
            {
              key: 'status',
              label: '能力状态',
              children: renderStatusTag(application.sections.monitoring.status)
            },
            {
              key: 'metrics_kind',
              label: '指标对象',
              children: application.sections.monitoring.metrics_object_kind
            },
            {
              key: 'metrics_status',
              label: '指标聚合状态',
              children: application.sections.monitoring.metrics_capability_status
            },
            {
              key: 'tracing_status',
              label: 'Tracing 配置状态',
              children: application.sections.monitoring.tracing_config_status
            }
          ]}
        />
      </Space>
    );
  }

  return <Result status="info" title="未找到分区内容" />;
}
