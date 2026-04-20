import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Col, Descriptions, Empty, Row, Space, Tag, Typography } from 'antd';

import {
  fetchSettingsSystemRuntimeProfile,
  settingsSystemRuntimeQueryKey
} from '../api/system-runtime';

function getRelationshipLabel(relationship: string) {
  switch (relationship) {
    case 'same_host':
      return { color: 'green', label: '同机部署' };
    case 'split_host':
      return { color: 'blue', label: '分机部署' };
    case 'runner_unreachable':
      return { color: 'red', label: 'Runner 不可达' };
    default:
      return { color: 'default', label: relationship };
  }
}

function getReachabilityLabel(reachable: boolean) {
  return reachable
    ? { color: 'green', label: '可达' }
    : { color: 'red', label: '不可达' };
}

function formatMemory(value: number) {
  return `${value.toFixed(1)} GB`;
}

export function SystemRuntimePanel() {
  const runtimeQuery = useQuery({
    queryKey: settingsSystemRuntimeQueryKey,
    queryFn: fetchSettingsSystemRuntimeProfile
  });

  const relationshipTag = runtimeQuery.data
    ? getRelationshipLabel(runtimeQuery.data.topology.relationship)
    : null;

  return (
    <section>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Typography.Title level={4}>系统运行</Typography.Title>
          <Typography.Text type="secondary">
            查看 API Server 与 Plugin Runner 的部署关系、宿主机信息和当前解析到的运行时环境。
          </Typography.Text>
        </div>

        {runtimeQuery.isError ? (
          <Alert
            type="error"
            showIcon
            message="运行时信息加载失败"
            description={
              runtimeQuery.error instanceof Error
                ? runtimeQuery.error.message
                : '请稍后重试。'
            }
          />
        ) : null}

        {runtimeQuery.isLoading ? (
          <Alert type="info" showIcon message="正在读取系统运行信息..." />
        ) : null}

        {runtimeQuery.data ? (
          <>
            <Card>
              <Descriptions column={{ xs: 1, md: 2 }} layout="vertical">
                <Descriptions.Item label="部署关系">
                  {relationshipTag ? (
                    <Tag color={relationshipTag.color}>{relationshipTag.label}</Tag>
                  ) : null}
                </Descriptions.Item>
                <Descriptions.Item label="当前语言解析">
                  {runtimeQuery.data.locale_meta.resolved_locale}
                </Descriptions.Item>
                <Descriptions.Item label="回退语言">
                  {runtimeQuery.data.locale_meta.fallback_locale}
                </Descriptions.Item>
                <Descriptions.Item label="支持语言">
                  {runtimeQuery.data.locale_meta.supported_locales.join(', ')}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Row gutter={[16, 16]}>
              {[
                runtimeQuery.data.services.api_server,
                runtimeQuery.data.services.plugin_runner
              ].map((service) => {
                const reachability = getReachabilityLabel(service.reachable);

                return (
                  <Col xs={24} md={12} key={service.service}>
                    <Card size="small" title={service.service}>
                      <Space direction="vertical" size={8}>
                        <Space wrap size={8}>
                          <Tag color={reachability.color}>{reachability.label}</Tag>
                          {service.status ? <Tag>{service.status}</Tag> : null}
                          {service.version ? <Tag>{service.version}</Tag> : null}
                        </Space>
                        <Typography.Text type="secondary">
                          宿主指纹 {service.host_fingerprint ?? '未知'}
                        </Typography.Text>
                      </Space>
                    </Card>
                  </Col>
                );
              })}
            </Row>

            {runtimeQuery.data.hosts.length > 0 ? (
              <Row gutter={[16, 16]}>
                {runtimeQuery.data.hosts.map((host) => (
                  <Col xs={24} lg={12} key={host.host_fingerprint}>
                    <Card size="small" title={host.host_fingerprint}>
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label="平台">
                          {host.platform.os}/{host.platform.arch}
                          {host.platform.libc ? `/${host.platform.libc}` : ''}
                        </Descriptions.Item>
                        <Descriptions.Item label="Rust Target">
                          {host.platform.rust_target_triple}
                        </Descriptions.Item>
                        <Descriptions.Item label="CPU">
                          {host.cpu.logical_count} 逻辑核
                        </Descriptions.Item>
                        <Descriptions.Item label="内存">
                          总计 {formatMemory(host.memory.total_gb)}，可用{' '}
                          {formatMemory(host.memory.available_gb)}，当前进程{' '}
                          {formatMemory(host.memory.process_gb)}
                        </Descriptions.Item>
                        <Descriptions.Item label="服务">
                          {host.services.join(', ')}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </Col>
                ))}
              </Row>
            ) : (
              <Empty description="当前没有可展示的宿主机信息" />
            )}
          </>
        ) : null}
      </Space>
    </section>
  );
}
