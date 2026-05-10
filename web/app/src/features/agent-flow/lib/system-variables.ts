import type { FlowNodeOutputDocument } from '@1flowbase/flow-schema';

export interface AgentFlowSystemVariable extends FlowNodeOutputDocument {
  description: string;
}

export const systemVariableNodeId = 'sys';

export const agentFlowSystemVariables = [
  {
    key: 'conversation_id',
    title: 'sys.conversation_id',
    valueType: 'string',
    description: '会话 ID'
  },
  {
    key: 'dialog_count',
    title: 'sys.dialog_count',
    valueType: 'number',
    description: '会话次数'
  },
  {
    key: 'user_id',
    title: 'sys.user_id',
    valueType: 'string',
    description: '用户 ID'
  },
  {
    key: 'app_id',
    title: 'sys.app_id',
    valueType: 'string',
    description: '应用 ID'
  },
  {
    key: 'workflow_id',
    title: 'sys.workflow_id',
    valueType: 'string',
    description: '工作流 ID'
  },
  {
    key: 'workflow_run_id',
    title: 'sys.workflow_run_id',
    valueType: 'string',
    description: '工作流运行 ID'
  }
] satisfies AgentFlowSystemVariable[];
