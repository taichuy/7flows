import { Button, Divider, Empty, Flex, Space, Typography } from 'antd';
import type { FC } from 'react';
import { useMemo, useState } from 'react';

import { useAuthStore } from '../../../state/auth-store';

const DESIGN_MODE_PERMISSION = 'frontstage.page.design';

type FrontStagePageProps = {
  workspaceId: string;
  pageId?: string;
};

export const FrontStagePage: FC<FrontStagePageProps> = ({ workspaceId, pageId }) => {
  const actor = useAuthStore((state) => state.actor);
  const me = useAuthStore((state) => state.me);
  const [isDesignMode, setIsDesignMode] = useState(false);

  const canEnterDesignMode = useMemo(() => {
    return actor?.effective_display_role === 'root' || Boolean(me?.permissions.includes(DESIGN_MODE_PERMISSION));
  }, [actor, me]);

  const pageLabel = pageId ? `页面 ${pageId}` : '未选择 pageId（将使用默认首页）';

  return (
    <div style={{ width: '100%', padding: '24px 0', maxWidth: 1240, margin: '0 auto' }}>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 12 }}>
        <Space direction="vertical" size={0}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            前台
          </Typography.Text>
          <Typography.Title level={4} style={{ margin: 0 }}>
            空态占位 · {pageLabel}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ marginTop: 4 }}>
            Workspace：{workspaceId}
          </Typography.Text>
        </Space>

        {canEnterDesignMode ? (
          <Button
            type={isDesignMode ? 'default' : 'primary'}
            onClick={() => setIsDesignMode((current) => !current)}
          >
            {isDesignMode ? '退出设计模式' : '进入设计模式'}
          </Button>
        ) : null}
      </Flex>

      <Divider style={{ margin: '0 0 16px' }} />

      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div style={{ marginTop: 8 }}>
            {pageId ? (
              <Typography.Text>
                当前页面尚未接入区块内容，浏览态仅展示空状态。请在设计态添加页面区块与内容。
              </Typography.Text>
            ) : (
              <Typography.Text>
                当前前台未指定 pageId，后续将默认加载该工作区页面树中的首页。
              </Typography.Text>
            )}
            {canEnterDesignMode && isDesignMode ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                设计模式已开启，后续在此承载区块编排与页面树管理能力。
              </Typography.Paragraph>
            ) : null}
          </div>
        }
      />
    </div>
  );
};
