import { useParams } from '@tanstack/react-router';
import { Card, Descriptions, Typography } from 'antd';

import type { EmbeddedAppManifest } from '@1flowse/embedded-contracts';

const placeholderManifest: EmbeddedAppManifest = {
  appId: 'placeholder',
  entry: 'dist/index.html',
  name: 'Embedded Placeholder',
  routePrefix: '/embedded/placeholder',
  version: '0.1.0'
};

export function EmbeddedAppDetailPage() {
  const { embeddedAppId } = useParams({ strict: false });

  return (
    <Card title="Embedded App Detail">
      <Typography.Paragraph>
        Placeholder details for one uploaded embedded application artifact.
      </Typography.Paragraph>
      <Descriptions column={1} bordered>
        <Descriptions.Item label="Embedded App ID">
          {embeddedAppId ?? placeholderManifest.appId}
        </Descriptions.Item>
        <Descriptions.Item label="Manifest Entry">
          {placeholderManifest.entry}
        </Descriptions.Item>
        <Descriptions.Item label="Route Prefix">
          {placeholderManifest.routePrefix}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
