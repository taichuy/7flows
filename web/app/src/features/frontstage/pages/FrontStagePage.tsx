import { Empty } from 'antd';
import type { FC } from 'react';

type FrontStagePageProps = {
  workspaceId: string;
  pageId?: string;
};

export const FrontStagePage: FC<FrontStagePageProps> = ({ workspaceId, pageId }) => {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <>
          前台路由接入完成，待接入页面树与区块编排。<br />
          Workspace: {workspaceId}
          {pageId ? `，Page: ${pageId}` : '（未指定 pageId）'}
        </>
      }
    />
  );
};
