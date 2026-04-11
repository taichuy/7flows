import { useParams } from '@tanstack/react-router';
import { Card, Descriptions, Typography } from 'antd';

import { createEmbedContext } from '@1flowse/embed-sdk';

export function EmbeddedMountPage() {
  const { embeddedAppId } = useParams({ strict: false });
  const context = createEmbedContext({
    applicationId: 'placeholder-application',
    teamId: 'placeholder-team'
  });

  return (
    <Card title="Embedded App Mount">
      <Typography.Paragraph>
        Placeholder host page for a mounted embedded static front-end.
      </Typography.Paragraph>
      <Descriptions column={1} bordered>
        <Descriptions.Item label="Embedded App ID">
          {embeddedAppId ?? 'unknown'}
        </Descriptions.Item>
        <Descriptions.Item label="Application Context">
          {context.applicationId}
        </Descriptions.Item>
        <Descriptions.Item label="Team Context">
          {context.teamId}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
