import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import {
  buildOperatorRecommendedNextStep,
  type OperatorRecommendedNextStep
} from "@/lib/operator-follow-up-presenters";
import {
  buildSandboxReadinessFollowUpCandidate,
  shouldPreferSharedSandboxReadinessFollowUp
} from "@/lib/system-overview-follow-up-presenters";

export type WorkflowPersistBlocker = {
  id:
    | "unsupported_nodes"
    | "contract_schema"
    | "tool_reference"
    | "node_execution"
    | "tool_execution"
    | "publish_draft"
    | "variables"
    | "server_drift";
  label: string;
  detail: string;
  nextStep: string;
};

type BuildWorkflowPersistBlockersOptions = {
  unsupportedNodeCount: number;
  unsupportedNodeSummary?: string | null;
  contractValidationSummary?: string | null;
  toolReferenceValidationSummary?: string | null;
  nodeExecutionValidationSummary?: string | null;
  toolExecutionValidationSummary?: string | null;
  publishDraftValidationSummary?: string | null;
  hasPublishVersionValidationIssues?: boolean;
  variableValidationSummary?: string | null;
  serverValidationSummary?: string | null;
  hasServerToolExecutionIssues?: boolean;
  hasServerNodeExecutionIssues?: boolean;
  sandboxReadinessPreflightHint?: string | null;
};

function ensureSentence(text: string | null | undefined) {
  const normalized = text?.trim();
  if (!normalized) {
    return null;
  }

  return /[。！？.!?]$/.test(normalized) ? normalized : `${normalized}。`;
}

function joinDetail(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => ensureSentence(part))
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

export function buildWorkflowPersistBlockers({
  unsupportedNodeCount,
  unsupportedNodeSummary,
  contractValidationSummary,
  toolReferenceValidationSummary,
  nodeExecutionValidationSummary,
  toolExecutionValidationSummary,
  publishDraftValidationSummary,
  hasPublishVersionValidationIssues = false,
  variableValidationSummary,
  serverValidationSummary,
  hasServerToolExecutionIssues = false,
  hasServerNodeExecutionIssues = false,
  sandboxReadinessPreflightHint
}: BuildWorkflowPersistBlockersOptions): WorkflowPersistBlocker[] {
  const blockers: WorkflowPersistBlocker[] = [];

  if (unsupportedNodeCount > 0) {
    blockers.push({
      id: "unsupported_nodes",
      label: "Unsupported nodes",
      detail: joinDetail(
        `当前 workflow 包含未进入执行主链的节点：${unsupportedNodeSummary ?? "仍有 planned / unknown 节点"}`
      ),
      nextStep: "请先移除或替换这些节点，再继续保存。"
    });
  }

  if (contractValidationSummary) {
    blockers.push({
      id: "contract_schema",
      label: "Contract schema",
      detail: joinDetail(
        `当前 workflow definition 还有 contract schema 待修正问题：${contractValidationSummary}`
      ),
      nextStep: "请先在 Node contract / publish draft 中修正后再保存。"
    });
  }

  if (toolReferenceValidationSummary) {
    blockers.push({
      id: "tool_reference",
      label: "Tool bindings",
      detail: joinDetail(
        `当前 workflow definition 还有 tool catalog 引用待修正问题：${toolReferenceValidationSummary}`
      ),
      nextStep: "请先修正 tool binding / LLM Agent tool policy 后再保存。"
    });
  }

  if (nodeExecutionValidationSummary) {
    blockers.push({
      id: "node_execution",
      label: "Node execution",
      detail: joinDetail(
        `当前 workflow definition 还有 node execution 待修正问题：${nodeExecutionValidationSummary}`
      ),
      nextStep: "请先把节点 execution class 调回当前实现支持范围，再继续保存。"
    });
  }

  if (toolExecutionValidationSummary) {
    blockers.push({
      id: "tool_execution",
      label: "Execution capability",
      detail: joinDetail(
        `当前 workflow definition 还有 execution capability 待修正问题：${toolExecutionValidationSummary}`,
        sandboxReadinessPreflightHint
      ),
      nextStep: "请先对齐 adapter 绑定、execution class 与 sandbox readiness，再继续保存。"
    });
  }

  if (publishDraftValidationSummary) {
    blockers.push({
      id: "publish_draft",
      label: "Publish draft",
      detail: joinDetail(
        `当前 workflow definition 还有 publish draft 待修正问题：${publishDraftValidationSummary}`
      ),
      nextStep: hasPublishVersionValidationIssues
        ? "如果 endpoint 要跟随本次保存版本，请把 workflowVersion 留空。"
        : "请先在 publish draft 表单里修正发布标识、schema、缓存或版本设置，再继续保存。"
    });
  }

  if (variableValidationSummary) {
    blockers.push({
      id: "variables",
      label: "Variables",
      detail: joinDetail(
        `当前 workflow definition 还有 variables 待修正问题：${variableValidationSummary}`
      ),
      nextStep: "请先修正变量名，再继续保存。"
    });
  }

  if (serverValidationSummary) {
    blockers.push({
      id: "server_drift",
      label: "Persisted drift",
      detail: joinDetail(
        `当前 persisted workflow 已出现服务器侧 definition drift：${serverValidationSummary}`,
        hasServerToolExecutionIssues ? sandboxReadinessPreflightHint : null
      ),
      nextStep: hasServerNodeExecutionIssues
        ? "请先把节点 execution class 调回当前实现支持范围，再继续保存。"
        : "请先对齐当前工具目录、skill 引用或 sandbox readiness，再继续保存。"
    });
  }

  return blockers;
}

export function formatWorkflowPersistBlockedMessage(blockers: WorkflowPersistBlocker[]) {
  return blockers.map((blocker) => `${blocker.detail} ${blocker.nextStep}`.trim()).join(" ");
}

export function summarizeWorkflowPersistBlockers(blockers: WorkflowPersistBlocker[]) {
  if (blockers.length === 0) {
    return null;
  }

  const summary = blockers
    .slice(0, 3)
    .map((blocker) => blocker.label)
    .join(" / ");
  return blockers.length > 3
    ? `当前保存会被 ${blockers.length} 类问题阻断：${summary} 等。`
    : `当前保存会被 ${blockers.length} 类问题阻断：${summary}。`;
}

export function buildWorkflowPersistBlockerRecommendedNextStep(
  blockers: WorkflowPersistBlocker[],
  sandboxReadiness?: Pick<
    SandboxReadinessCheck,
    | "affected_run_count"
    | "affected_workflow_count"
    | "primary_blocker_kind"
    | "recommended_action"
  > | null,
  currentHref?: string | null
): OperatorRecommendedNextStep | null {
  if (blockers.length === 0) {
    return null;
  }

  const shouldUseSharedSandboxReadiness = shouldPreferSharedSandboxReadinessFollowUp({
    blockedExecution: blockers.some((blocker) => blocker.id === "tool_execution"),
    signals: blockers.flatMap((blocker) => [blocker.label, blocker.detail, blocker.nextStep])
  });

  if (!shouldUseSharedSandboxReadiness) {
    return null;
  }

  return buildOperatorRecommendedNextStep({
    execution: buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness"),
    currentHref
  });
}
