import { buildLegacyPublishAuthModeContractSummary } from "@/lib/legacy-publish-auth-contract";
import type {
  WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot,
  WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem
} from "@/lib/workflow-publish-types";

export type LegacyPublishAuthGovernanceSurfaceCopy = {
  title: string;
  description: string;
  workflowFollowUpTitle: string;
  workflowFollowUpFallback: string;
};

export type LegacyPublishAuthWorkflowHandoff = {
  bindingChipLabel: string;
  statusChipLabel: string;
  detail: string;
  workflowSummary: WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem;
};

export function buildLegacyPublishAuthGovernanceSurfaceCopy(): LegacyPublishAuthGovernanceSurfaceCopy {
  return {
    title: "Legacy publish auth handoff",
    description:
      "publish activity export、run diagnostics 和 invocation detail 现在共享同一份 workflow 级 legacy publish auth artifact，避免 operator 在 audit 入口重新拼 draft cleanup / published blocker checklist。",
    workflowFollowUpTitle: "Workflow follow-up",
    workflowFollowUpFallback:
      "回到 workflow detail 继续处理 draft cleanup / published blocker；当前 publish audit detail 与 export 现在共享同一份 workflow handoff。"
  };
}

export function buildLegacyPublishAuthWorkflowHandoff(
  snapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null | undefined,
  workflowId: string
): LegacyPublishAuthWorkflowHandoff | null {
  if (!snapshot || snapshot.binding_count <= 0) {
    return null;
  }

  const workflowSummary =
    snapshot.workflows.find((item) => item.workflow_id === workflowId) ??
    snapshot.workflows[0] ??
    null;
  if (!workflowSummary || workflowSummary.binding_count <= 0) {
    return null;
  }

  return {
    bindingChipLabel: `${workflowSummary.binding_count} legacy bindings`,
    statusChipLabel:
      workflowSummary.published_blocker_count > 0
        ? "publish auth blocker"
        : "legacy auth cleanup",
    detail:
      `当前 workflow 仍有 ${workflowSummary.draft_candidate_count} 条 draft cleanup、` +
      `${workflowSummary.published_blocker_count} 条 published blocker、` +
      `${workflowSummary.offline_inventory_count} 条 offline inventory。` +
      buildLegacyPublishAuthModeContractSummary(snapshot.auth_mode_contract),
    workflowSummary
  };
}
