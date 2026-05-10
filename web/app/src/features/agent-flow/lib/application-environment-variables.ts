export interface AgentFlowEnvironmentVariable {
  name: string;
  value_type: string;
  value: unknown;
  description: string;
}

export const environmentVariableNodeId = 'env';

export function formatEnvironmentVariableTitle(name: string) {
  return `${environmentVariableNodeId}.${name}`;
}
