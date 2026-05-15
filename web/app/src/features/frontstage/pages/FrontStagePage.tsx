import { Button, Divider, Empty, Flex, Layout, Space, Typography } from 'antd';
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
  const { Sider, Content } = Layout;

  const canEnterDesignMode = useMemo(() => {
    return actor?.effective_display_role === 'root' || Boolean(me?.permissions.includes(DESIGN_MODE_PERMISSION));
  }, [actor, me]);

  const pageLabel = pageId ? `页面 ${pageId}` : '未选择 pageId（将使用默认首页）';
  const pageNodeTitle = pageId ? `当前页面：${pageId}` : '当前工作区暂无页面';

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
          <Space align="center" size={8} direction="vertical">
            <Button
              type={isDesignMode ? 'default' : 'primary'}
              onClick={() => setIsDesignMode((current) => !current)}
            >
              {isDesignMode ? '退出设计模式' : '进入设计模式'}
            </Button>
          </Space>
        ) : null}
      </Flex>

      <Divider style={{ margin: '0 0 16px' }} />

      {canEnterDesignMode && isDesignMode ? (
        <Space wrap size={8} style={{ marginBottom: 12 }}>
          <Button size="small">新增区块</Button>
          <Button size="small">页面管理</Button>
          <Button size="small">当前页面设置</Button>
          <Button size="small">JS Block 试运行</Button>
          <Button size="small">保存设计</Button>
        </Space>
      ) : null}
      <Layout style={{ background: 'transparent' }}>
        <Sider width={280} theme="light" style={{ background: 'white', borderRight: '1px solid #f0f0f0', padding: 12 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            页面管理
          </Typography.Title>
          <Divider style={{ margin: '12px 0' }} />
          {pageId ? (
            <Typography.Text>{pageNodeTitle}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">当前工作区暂未创建页面，请在设计态中创建</Typography.Text>
          )}
        </Sider>
        <Content style={{ padding: 16, background: 'white' }}>
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
                    当前前台未指定 pageId，后续将默认加载该工作区页面树里的首页。
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
        </Content>
      </Layout>
    </div>
  );
};
