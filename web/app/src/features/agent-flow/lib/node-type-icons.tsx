import type { ReactNode } from 'react';

import {
  ApiOutlined,
  BlockOutlined,
  DatabaseOutlined,
  EditOutlined,
  FileTextOutlined,
  MessageOutlined,
  PlaySquareOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  ToolOutlined
} from '@ant-design/icons';

/** 节点类型图标统一源，画布节点和详情头必须使用同一套映射。 */
const NODE_TYPE_ICONS: Record<string, ReactNode> = {
  start: <PlaySquareOutlined />,
  answer: <MessageOutlined />,
  llm: <ThunderboltOutlined />,
  template_transform: <FileTextOutlined />,
  knowledge_retrieval: <SearchOutlined />,
  question_classifier: <QuestionCircleOutlined />,
  if_else: <SwapOutlined />,
  http_request: <ApiOutlined />,
  tool: <ToolOutlined />,
  data_model_list: <DatabaseOutlined />,
  data_model_get: <DatabaseOutlined />,
  data_model_create: <DatabaseOutlined />,
  data_model_update: <DatabaseOutlined />,
  data_model_delete: <DatabaseOutlined />,
  variable_assigner: <EditOutlined />,
  iteration: <SyncOutlined />,
  loop: <ReloadOutlined />,
  plugin_node: <BlockOutlined />
};

export function getAgentFlowNodeTypeIcon(nodeType: string) {
  return NODE_TYPE_ICONS[nodeType] ?? null;
}
