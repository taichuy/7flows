import type { WorkflowDefinitionPreflightIssue } from "@/lib/get-workflows";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildLegacyPublishAuthModeFollowUp } from "@/lib/legacy-publish-auth-contract";
import {
  buildOperatorRecommendedNextStep,
  type OperatorRecommendedNextStep
} from "@/lib/operator-follow-up-presenters";
import {
  buildSandboxReadinessFollowUpCandidate,
  shouldPreferSharedSandboxReadinessFollowUp
} from "@/lib/system-overview-follow-up-presenters";
import {
  formatCatalogGapSummary,
  formatCatalogGapToolSummary,
  isLegacyPublishAuthModeIssue
} from "@/lib/workflow-definition-governance";
import type { WorkflowToolReferenceValidationIssue } from "@/lib/workflow-tool-reference-validation";

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
  catalogGapToolIds?: string[];
  hasLegacyPublishAuthModeIssues?: boolean;
  hasGenericPublishDraftIssues?: boolean;
};

type BuildWorkflowPersistBlockersOptions = {
  unsupportedNodeCount: number;
  unsupportedNodeSummary?: string | null;
  contractValidationSummary?: string | null;
  toolReferenceValidationIssues?: WorkflowToolReferenceValidationIssue[];
  toolReferenceValidationSummary?: string | null;
  nodeExecutionValidationSummary?: string | null;
  toolExecutionValidationSummary?: string | null;
  publishDraftValidationIssues?: WorkflowDefinitionPreflightIssue[];
  publishDraftValidationSummary?: string | null;
  hasPublishVersionValidationIssues?: boolean;
  hasLegacyPublishAuthModeIssues?: boolean;
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

function summarizeIssueMessages(issues: { message: string }[]) {
  if (issues.length === 0) {
    return null;
  }

  const head = issues
    .slice(0, 3)
    .map((issue) => issue.message)
    .join("；");
  return issues.length > 3 ? `${head}；另有 ${issues.length - 3} 项待修正。` : head;
}

function buildPublishDraftBlockerDetail({
  publishDraftValidationIssues,
  publishDraftValidationSummary,
  hasLegacyPublishAuthModeIssues
}: {
  publishDraftValidationIssues: WorkflowDefinitionPreflightIssue[];
  publishDraftValidationSummary?: string | null;
  hasLegacyPublishAuthModeIssues: boolean;
}) {
  const genericPublishDraftIssues = publishDraftValidationIssues.filter(
    (issue) => !isLegacyPublishAuthModeIssue(issue)
  );
  const genericPublishDraftSummary = summarizeIssueMessages(genericPublishDraftIssues);

  if (genericPublishDraftSummary) {
    return {
      detail: joinDetail(
        `当前 workflow definition 还有 publish draft 待修正问题：${genericPublishDraftSummary}`
      ),
      hasGenericPublishDraftIssues: true
    };
  }

  if (hasLegacyPublishAuthModeIssues) {
    return {
      detail: "当前 workflow definition 还有 legacy publish auth 待修正问题。",
      hasGenericPublishDraftIssues: false
    };
  }

  if (!publishDraftValidationSummary) {
    return null;
  }

  return {
    detail: joinDetail(
      `当前 workflow definition 还有 publish draft 待修正问题：${publishDraftValidationSummary}`
    ),
    hasGenericPublishDraftIssues: true
  };
}

function buildPublishDraftNextStep({
  hasGenericPublishDraftIssues,
  hasPublishVersionValidationIssues,
  hasLegacyPublishAuthModeIssues
}: {
  hasGenericPublishDraftIssues: boolean;
  hasPublishVersionValidationIssues: boolean;
  hasLegacyPublishAuthModeIssues: boolean;
}) {
  if (!hasGenericPublishDraftIssues && hasLegacyPublishAuthModeIssues) {
    return buildLegacyPublishAuthModeFollowUp();
  }

  if (!hasGenericPublishDraftIssues) {
    return "请先在 publish draft 表单里修正发布标识、schema、缓存或版本设置，再继续保存。";
  }

  if (hasPublishVersionValidationIssues) {
    return "如果 endpoint 要跟随本次保存版本，请把 workflowVersion 留空。";
  }

  return "请先在 publish draft 表单里修正发布标识、schema、缓存或版本设置，再继续保存。";
}

export function buildWorkflowPersistBlockers({
  unsupportedNodeCount,
  unsupportedNodeSummary,
  contractValidationSummary,
  toolReferenceValidationIssues = [],
  toolReferenceValidationSummary,
  nodeExecutionValidationSummary,
  toolExecutionValidationSummary,
  publishDraftValidationIssues = [],
  publishDraftValidationSummary,
  hasPublishVersionValidationIssues = false,
  hasLegacyPublishAuthModeIssues = false,
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
    const missingToolIds = Array.from(
      new Set(toolReferenceValidationIssues.flatMap((issue) => issue.toolIds ?? []))
    );
    const catalogGapSummary = formatCatalogGapSummary(missingToolIds, 3);
    const missingToolSummary = formatCatalogGapToolSummary(missingToolIds, 3);
    blockers.push({
      id: "tool_reference",
      label: "Catalog gap",
      detail: joinDetail(
        catalogGapSummary
          ? `当前 workflow definition 仍有 ${catalogGapSummary}：${toolReferenceValidationSummary}`
          : `当前 workflow definition 还有 tool catalog 引用待修正问题：${toolReferenceValidationSummary}`
      ),
      catalogGapToolIds: missingToolIds,
      nextStep: missingToolSummary
        ? `请先补齐 catalog gap（${missingToolSummary}）里的 tool binding / LLM Agent tool policy 后再保存。`
        : "请先修正 tool binding / LLM Agent tool policy 后再保存。"
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

  const publishDraftBlockerDetail = buildPublishDraftBlockerDetail({
    publishDraftValidationIssues,
    publishDraftValidationSummary,
    hasLegacyPublishAuthModeIssues
  });

  if (publishDraftBlockerDetail) {
    blockers.push({
      id: "publish_draft",
      label: "Publish draft",
      detail: publishDraftBlockerDetail.detail,
      hasLegacyPublishAuthModeIssues,
      hasGenericPublishDraftIssues: publishDraftBlockerDetail.hasGenericPublishDraftIssues,
      nextStep: buildPublishDraftNextStep({
        hasGenericPublishDraftIssues: publishDraftBlockerDetail.hasGenericPublishDraftIssues,
        hasPublishVersionValidationIssues,
        hasLegacyPublishAuthModeIssues
      })
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
