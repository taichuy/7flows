import { useQuery } from '@tanstack/react-query';
import { Empty, Result } from 'antd';

import {
  fetchNodeLastRun,
  nodeLastRunQueryKey
} from '../../../api/runtime';
import { NodeRunIOCard } from '../last-run/NodeRunIOCard';
import { NodeRunMetadataCard } from '../last-run/NodeRunMetadataCard';
import { NodeRunSummaryCard } from '../last-run/NodeRunSummaryCard';

export function NodeLastRunTab({
  applicationId,
  nodeId
}: {
  applicationId?: string;
  nodeId?: string;
}) {
  const lastRunQuery = useQuery({
    queryKey: nodeLastRunQueryKey(applicationId ?? 'unknown', nodeId ?? 'unknown'),
    queryFn: () => fetchNodeLastRun(applicationId!, nodeId!),
    enabled: Boolean(applicationId && nodeId)
  });

  if (lastRunQuery.isPending) {
    return <Result status="info" title="正在加载上次运行" />;
  }

  if (!lastRunQuery.data) {
    return (
      <Empty
        description="当前节点还没有运行记录"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  return (
    <div className="agent-flow-node-detail__last-run">
      <NodeRunSummaryCard lastRun={lastRunQuery.data} />
      <NodeRunIOCard lastRun={lastRunQuery.data} />
      <NodeRunMetadataCard lastRun={lastRunQuery.data} />
    </div>
  );
}
