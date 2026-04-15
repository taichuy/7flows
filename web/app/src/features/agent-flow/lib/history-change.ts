import {
  classifyDocumentChange,
  type FlowAuthoringDocument
} from '@1flowse/flow-schema';

export function buildVersionSummary(
  before: FlowAuthoringDocument,
  after: FlowAuthoringDocument
): string {
  const beforeIds = new Set(before.graph.nodes.map((node) => node.id));
  const afterIds = new Set(after.graph.nodes.map((node) => node.id));
  const added = after.graph.nodes.filter((node) => !beforeIds.has(node.id));
  const removed = before.graph.nodes.filter((node) => !afterIds.has(node.id));

  if (added.length > 0) {
    return `新增 ${added.map((node) => node.alias).join('、')}`;
  }

  if (removed.length > 0) {
    return `删除 ${removed.map((node) => node.alias).join('、')}`;
  }

  return classifyDocumentChange(before, after) === 'logical'
    ? '更新节点配置'
    : '更新画布布局';
}
