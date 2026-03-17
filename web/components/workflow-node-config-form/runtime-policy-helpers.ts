"use client";

import type {
  WorkflowExecutionClass,
  WorkflowExecutionDependencyMode,
  WorkflowExecutionFilesystemPolicy,
  WorkflowExecutionNetworkPolicy
} from "@/lib/workflow-runtime-policy";
import {
  WORKFLOW_EXECUTION_CLASS_OPTIONS,
  WORKFLOW_EXECUTION_DEPENDENCY_MODE_OPTIONS,
  WORKFLOW_EXECUTION_FILESYSTEM_POLICY_OPTIONS,
  WORKFLOW_EXECUTION_NETWORK_POLICY_OPTIONS,
  resolveDefaultExecutionClass
} from "@/lib/workflow-runtime-policy";
import {
  cloneRecord,
  toRecord
} from "@/components/workflow-node-config-form/shared";

type ExecutionPolicyViewModel = {
  className: WorkflowExecutionClass;
  defaultClass: WorkflowExecutionClass;
  profile: string;
  timeoutMs?: number;
  networkPolicy: WorkflowExecutionNetworkPolicy;
  filesystemPolicy: WorkflowExecutionFilesystemPolicy;
  explicit: boolean;
};

export function readExecutionPolicy(
  runtimePolicy: Record<string, unknown>,
  nodeType: string
): ExecutionPolicyViewModel {
  const execution = toRecord(runtimePolicy.execution);
  const defaultClass = resolveDefaultExecutionClass(nodeType);

  return {
    className: isExecutionClass(execution?.class) ? execution.class : defaultClass,
    defaultClass,
    profile: typeof execution?.profile === "string" ? execution.profile : "",
    timeoutMs: typeof execution?.timeoutMs === "number" ? execution.timeoutMs : undefined,
    networkPolicy: isExecutionNetworkPolicy(execution?.networkPolicy)
      ? execution.networkPolicy
      : "inherit",
    filesystemPolicy: isExecutionFilesystemPolicy(execution?.filesystemPolicy)
      ? execution.filesystemPolicy
      : "inherit",
    explicit: Boolean(execution)
  };
}

export function normalizeExecutionPolicy(
  execution: Record<string, unknown>,
  nodeType: string
) {
  const defaultClass = resolveDefaultExecutionClass(nodeType);
  const className = isExecutionClass(execution.class) ? execution.class : defaultClass;
  const profile = typeof execution.profile === "string" ? execution.profile.trim() : "";
  const timeoutMs =
    typeof execution.timeoutMs === "number"
      ? Math.max(1, Math.round(execution.timeoutMs))
      : undefined;
  const networkPolicy = isExecutionNetworkPolicy(execution.networkPolicy)
    ? execution.networkPolicy
    : "inherit";
  const filesystemPolicy = isExecutionFilesystemPolicy(execution.filesystemPolicy)
    ? execution.filesystemPolicy
    : "inherit";
  const dependencyMode = isExecutionDependencyMode(execution.dependencyMode)
    ? execution.dependencyMode
    : undefined;
  const builtinPackageSet =
    dependencyMode === "builtin" && typeof execution.builtinPackageSet === "string"
      ? execution.builtinPackageSet.trim()
      : "";
  const dependencyRef =
    dependencyMode === "dependency_ref" && typeof execution.dependencyRef === "string"
      ? execution.dependencyRef.trim()
      : "";
  const backendExtensions =
    execution.backendExtensions &&
    typeof execution.backendExtensions === "object" &&
    !Array.isArray(execution.backendExtensions)
      ? (execution.backendExtensions as Record<string, unknown>)
      : undefined;

  const hasAdditionalSettings =
    Boolean(profile) ||
    timeoutMs !== undefined ||
    networkPolicy !== "inherit" ||
    filesystemPolicy !== "inherit" ||
    dependencyMode !== undefined ||
    Boolean(builtinPackageSet) ||
    Boolean(dependencyRef) ||
    Boolean(backendExtensions && Object.keys(backendExtensions).length > 0);

  if (!hasAdditionalSettings && className === defaultClass) {
    return undefined;
  }

  const normalizedExecution: Record<string, unknown> = {
    class: className
  };
  if (profile) {
    normalizedExecution.profile = profile;
  }
  if (timeoutMs !== undefined) {
    normalizedExecution.timeoutMs = timeoutMs;
  }
  if (networkPolicy !== "inherit") {
    normalizedExecution.networkPolicy = networkPolicy;
  }
  if (filesystemPolicy !== "inherit") {
    normalizedExecution.filesystemPolicy = filesystemPolicy;
  }
  if (dependencyMode) {
    normalizedExecution.dependencyMode = dependencyMode;
  }
  if (builtinPackageSet) {
    normalizedExecution.builtinPackageSet = builtinPackageSet;
  }
  if (dependencyRef) {
    normalizedExecution.dependencyRef = dependencyRef;
  }
  if (backendExtensions && Object.keys(backendExtensions).length > 0) {
    normalizedExecution.backendExtensions = backendExtensions;
  }
  return normalizedExecution;
}

export function normalizeRuntimePolicy(runtimePolicy: Record<string, unknown>) {
  const nextPolicy = cloneRecord(runtimePolicy);
  delete nextPolicy.maxAttempts;
  delete nextPolicy.backoffSeconds;
  delete nextPolicy.backoffMultiplier;

  if (toRecord(nextPolicy.retry) && Object.keys(toRecord(nextPolicy.retry) ?? {}).length === 0) {
    delete nextPolicy.retry;
  }
  if (
    toRecord(nextPolicy.execution) &&
    Object.keys(toRecord(nextPolicy.execution) ?? {}).length === 0
  ) {
    delete nextPolicy.execution;
  }
  if (toRecord(nextPolicy.join) && Object.keys(toRecord(nextPolicy.join) ?? {}).length === 0) {
    delete nextPolicy.join;
  }

  return nextPolicy;
}

export function commitRuntimePolicy(
  runtimePolicy: Record<string, unknown>,
  onChange: (nextRuntimePolicy: Record<string, unknown> | undefined) => void
) {
  const nextPolicy = normalizeRuntimePolicy(runtimePolicy);
  onChange(Object.keys(nextPolicy).length > 0 ? nextPolicy : undefined);
}

function isExecutionClass(value: unknown): value is WorkflowExecutionClass {
  return (
    typeof value === "string" &&
    WORKFLOW_EXECUTION_CLASS_OPTIONS.includes(value as WorkflowExecutionClass)
  );
}

function isExecutionNetworkPolicy(value: unknown): value is WorkflowExecutionNetworkPolicy {
  return (
    typeof value === "string" &&
    WORKFLOW_EXECUTION_NETWORK_POLICY_OPTIONS.includes(
      value as WorkflowExecutionNetworkPolicy
    )
  );
}

function isExecutionFilesystemPolicy(
  value: unknown
): value is WorkflowExecutionFilesystemPolicy {
  return (
    typeof value === "string" &&
    WORKFLOW_EXECUTION_FILESYSTEM_POLICY_OPTIONS.includes(
      value as WorkflowExecutionFilesystemPolicy
      )
  );
}

function isExecutionDependencyMode(value: unknown): value is WorkflowExecutionDependencyMode {
  return (
    typeof value === "string" &&
    WORKFLOW_EXECUTION_DEPENDENCY_MODE_OPTIONS.includes(
      value as WorkflowExecutionDependencyMode
    )
  );
}
