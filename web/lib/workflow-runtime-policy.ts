export const WORKFLOW_EXECUTION_CLASS_OPTIONS = [
  "inline",
  "subprocess",
  "sandbox",
  "microvm"
] as const;

export const WORKFLOW_EXECUTION_NETWORK_POLICY_OPTIONS = [
  "inherit",
  "restricted",
  "isolated"
] as const;

export const WORKFLOW_EXECUTION_FILESYSTEM_POLICY_OPTIONS = [
  "inherit",
  "readonly_tmp",
  "ephemeral"
] as const;

export const WORKFLOW_EXECUTION_DEPENDENCY_MODE_OPTIONS = [
  "builtin",
  "dependency_ref",
  "backend_managed"
] as const;

export type WorkflowExecutionClass =
  (typeof WORKFLOW_EXECUTION_CLASS_OPTIONS)[number];

export type WorkflowExecutionNetworkPolicy =
  (typeof WORKFLOW_EXECUTION_NETWORK_POLICY_OPTIONS)[number];

export type WorkflowExecutionFilesystemPolicy =
  (typeof WORKFLOW_EXECUTION_FILESYSTEM_POLICY_OPTIONS)[number];

export type WorkflowExecutionDependencyMode =
  (typeof WORKFLOW_EXECUTION_DEPENDENCY_MODE_OPTIONS)[number];

export type WorkflowExecutionPolicy = {
  class: WorkflowExecutionClass;
  profile?: string;
  timeoutMs?: number;
  networkPolicy?: WorkflowExecutionNetworkPolicy;
  filesystemPolicy?: WorkflowExecutionFilesystemPolicy;
  dependencyMode?: WorkflowExecutionDependencyMode;
  builtinPackageSet?: string;
  dependencyRef?: string;
  backendExtensions?: Record<string, unknown>;
};

export type WorkflowRetryPolicy = {
  maxAttempts?: number;
  backoffSeconds?: number;
  backoffMultiplier?: number;
};

export type WorkflowJoinPolicy = {
  mode?: "any" | "all";
  requiredNodeIds?: string[];
  onUnmet?: "skip" | "fail";
  mergeStrategy?: "error" | "overwrite" | "keep_first" | "append";
};

export type WorkflowNodeRuntimePolicy = {
  execution?: WorkflowExecutionPolicy;
  retry?: WorkflowRetryPolicy;
  join?: WorkflowJoinPolicy;
  [key: string]: unknown;
};

export function resolveDefaultExecutionClass(nodeType: string): WorkflowExecutionClass {
  return nodeType === "sandbox_code" ? "sandbox" : "inline";
}
