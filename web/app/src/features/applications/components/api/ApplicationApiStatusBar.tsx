import type { ReactNode } from 'react';

import { Alert, Space, Switch, Typography } from 'antd';

import type { ApplicationApiPublication } from '../../api/public-api';

export function ApplicationApiStatusBar({
  publication,
  loading,
  onToggleEnabled,
  children
}: {
  publication: ApplicationApiPublication | null;
  loading?: boolean;
  onToggleEnabled?: (enabled: boolean) => void;
  children?: ReactNode;
}) {
  if (!publication) {
    return (
      <section className="application-api-status">
        <div className="application-api-status__header">
          <Alert
            type="warning"
            showIcon
            message="当前应用还没有已发布的公开 API 版本"
            description="发布后，应用 API Key 会自动绑定当前 active publication；公开 URL 不包含 application_id。"
          />
          <div className="application-api-status__actions">{children}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="application-api-status">
      <div className="application-api-status__header">
        <Space align="center" wrap>
          <Typography.Text strong>公开 API</Typography.Text>
          <Switch
            checked={publication.api_enabled}
            loading={loading}
            checkedChildren="启用"
            unCheckedChildren="停用"
            onChange={onToggleEnabled}
          />
          <Typography.Text type="secondary">
            active publication v{publication.version_sequence}
          </Typography.Text>
        </Space>
        <div className="application-api-status__actions">{children}</div>
      </div>
    </section>
  );
}
