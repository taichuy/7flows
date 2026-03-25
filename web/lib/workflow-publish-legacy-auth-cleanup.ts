import type {
  WorkflowPublishedEndpointLegacyAuthModeContract,
  WorkflowPublishedEndpointItem,
  WorkflowPublishedEndpointLegacyAuthCleanupResult
} from "@/lib/get-workflow-publish";
import type { WorkflowDetail } from "@/lib/get-workflows";
import {
  buildLegacyPublishAuthModeContractSummary,
  buildLegacyPublishAuthModeFollowUp,
  resolveLegacyPublishAuthModeContract
} from "@/lib/legacy-publish-auth-contract";
import {
  appendWorkflowLibraryViewStateForWorkflow,
  resolveWorkflowLibraryViewStateForWorkflow,
} from "@/lib/workflow-library-query";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";

export type WorkflowPublishLegacyAuthCleanupExportFormat = "json" | "jsonl";

type WorkflowPublishLegacyAuthCleanupWorkflowFollowUp = {
  workflow_detail_href: string;
  workflow_detail_label: string;
  definition_issue: "legacy_publish_auth" | "missing_tool" | null;
};

type WorkflowPublishLegacyAuthCleanupBindingItem = {
  bindingId: string;
  endpointId: string;
  endpointLabel: string;
  workflowVersion: string;
  lifecycleStatus: "draft" | "published" | "offline";
  authMode: string;
  detail: string;
  workflow_follow_up: WorkflowPublishLegacyAuthCleanupWorkflowFollowUp;
};

type WorkflowPublishLegacyAuthCleanupChecklistTone = "ready" | "manual" | "inventory";

export type WorkflowPublishLegacyAuthCleanupChecklistItem = {
  key: "draft_cleanup" | "published_follow_up" | "offline_inventory";
  title: string;
  tone: WorkflowPublishLegacyAuthCleanupChecklistTone;
  toneLabel: string;
  count: number;
  detail: string;
};

export type WorkflowPublishLegacyAuthCleanupExportPayload = {
  export: {
    exported_at: string;
    format: WorkflowPublishLegacyAuthCleanupExportFormat;
    binding_count: number;
  };
  auth_mode_contract: WorkflowPublishedEndpointLegacyAuthModeContract;
  workflow: {
    workflow_id: string;
    workflow_name: string;
  };
  summary: {
    draft_candidate_count: number;
    published_blocker_count: number;
    offline_inventory_count: number;
  };
  checklist: WorkflowPublishLegacyAuthCleanupChecklistItem[];
  buckets: {
    draft_candidates: WorkflowPublishLegacyAuthCleanupBindingItem[];
    published_blockers: WorkflowPublishLegacyAuthCleanupBindingItem[];
    offline_inventory: WorkflowPublishLegacyAuthCleanupBindingItem[];
  };
};

export type WorkflowPublishLegacyAuthCleanupSurface = {
  shouldRender: boolean;
  title: string;
  description: string;
  candidateBindings: WorkflowPublishLegacyAuthCleanupBindingItem[];
  publishedBindings: WorkflowPublishLegacyAuthCleanupBindingItem[];
  offlineBindings: WorkflowPublishLegacyAuthCleanupBindingItem[];
  candidateBindingIds: string[];
  candidateSummary: string;
  blockedSummary: string;
  offlineSummary: string;
  checklistTitle: string;
  checklistDescription: string;
  checklistItems: WorkflowPublishLegacyAuthCleanupChecklistItem[];
  exportTitle: string;
  exportDescription: string;
  actionLabel: string;
  pendingLabel: string;
  idleMessage: string;
};

function buildWorkflowPublishLegacyAuthCleanupDefaultWorkflowFollowUp(
  workflowId: string
): WorkflowPublishLegacyAuthCleanupWorkflowFollowUp {
  const workflowDetailLink = buildAuthorFacingWorkflowDetailLinkSurface({
    workflowId,
    variant: "editor",
  });

  return {
    workflow_detail_href: workflowDetailLink.href,
    workflow_detail_label: workflowDetailLink.label,
    definition_issue: null,
  };
}

function buildWorkflowPublishLegacyAuthCleanupWorkflowFollowUp({
  workflowId,
  workflow,
}: {
  workflowId: string;
  workflow?: Pick<WorkflowDetail, "tool_governance"> | null;
}): WorkflowPublishLegacyAuthCleanupWorkflowFollowUp {
  if (!workflow) {
    return buildWorkflowPublishLegacyAuthCleanupDefaultWorkflowFollowUp(workflowId);
  }

  const workflowDetailLink = buildAuthorFacingWorkflowDetailLinkSurface({
    workflowId,
    variant: "editor",
  });
  const viewState = resolveWorkflowLibraryViewStateForWorkflow(workflow, {
    definitionIssue: null,
  });

  return {
    workflow_detail_href: appendWorkflowLibraryViewStateForWorkflow(
      workflowDetailLink.href,
      workflow,
      { definitionIssue: null }
    ),
    workflow_detail_label: workflowDetailLink.label,
    definition_issue: viewState.definitionIssue,
  };
}

function hasLegacyAuthIssue(binding: Pick<WorkflowPublishedEndpointItem, "issues">) {
  return Boolean(
    binding.issues?.some(
      (issue) => issue.category === "unsupported_auth_mode" && issue.blocks_lifecycle_publish
    )
  );
}

type WorkflowPublishedEndpointBlockingIssue = NonNullable<
  WorkflowPublishedEndpointItem["issues"]
>[number];

function resolveLegacyAuthIssue(
  binding: Pick<WorkflowPublishedEndpointItem, "issues">
): WorkflowPublishedEndpointBlockingIssue | null {
  return (
    binding.issues?.find(
      (issue) => issue.category === "unsupported_auth_mode" && issue.blocks_lifecycle_publish
    ) ?? null
  );
}

function resolveLegacyAuthCleanupContract(
  bindings: ReadonlyArray<Pick<WorkflowPublishedEndpointItem, "issues">>
) {
  return resolveLegacyPublishAuthModeContract(
    bindings
      .map((binding) => resolveLegacyAuthIssue(binding)?.auth_mode_contract ?? null)
      .find((contract) => contract != null) ?? null
  );
}

function resolveLegacyAuthBindingContract(
  binding: Pick<WorkflowPublishedEndpointItem, "issues">
) {
  return resolveLegacyPublishAuthModeContract(resolveLegacyAuthIssue(binding)?.auth_mode_contract);
}

function formatEndpointLabel(
  binding: Pick<WorkflowPublishedEndpointItem, "endpoint_id" | "endpoint_name">
) {
  return binding.endpoint_name && binding.endpoint_name !== binding.endpoint_id
    ? `${binding.endpoint_name} (${binding.endpoint_id})`
    : binding.endpoint_id;
}

function buildBindingItem(
  binding: WorkflowPublishedEndpointItem
): WorkflowPublishLegacyAuthCleanupBindingItem {
  const endpointLabel = formatEndpointLabel(binding);
  const contract = resolveLegacyAuthBindingContract(binding);
  const workflowFollowUp = buildWorkflowPublishLegacyAuthCleanupDefaultWorkflowFollowUp(
    binding.workflow_id
  );

  if (binding.lifecycle_status === "draft") {
    return {
      bindingId: binding.id,
      endpointId: binding.endpoint_id,
      endpointLabel,
      workflowVersion: binding.workflow_version,
      lifecycleStatus: "draft",
      authMode: binding.auth_mode,
      detail:
        `workflow ${binding.workflow_version} 仍是历史 legacy draft，可直接批量切到 offline。` +
        ` ${buildLegacyPublishAuthModeContractSummary(contract)}`,
      workflow_follow_up: workflowFollowUp,
    };
  }

  if (binding.lifecycle_status === "published") {
    return {
      bindingId: binding.id,
      endpointId: binding.endpoint_id,
      endpointLabel,
      workflowVersion: binding.workflow_version,
      lifecycleStatus: "published",
      authMode: binding.auth_mode,
      detail:
        "当前 binding 仍在 live publish 链路上。" +
        ` ${buildLegacyPublishAuthModeContractSummary(contract)} ` +
        buildLegacyPublishAuthModeFollowUp(contract),
      workflow_follow_up: workflowFollowUp,
    };
  }

  return {
    bindingId: binding.id,
    endpointId: binding.endpoint_id,
    endpointLabel,
    workflowVersion: binding.workflow_version,
    lifecycleStatus: "offline",
    authMode: binding.auth_mode,
    detail:
      `workflow ${binding.workflow_version} 已 offline，仅保留在治理 inventory 里。` +
      ` ${buildLegacyPublishAuthModeContractSummary(contract)}`,
    workflow_follow_up: workflowFollowUp,
  };
}

function applyWorkflowFollowUpToBindings(
  bindings: WorkflowPublishLegacyAuthCleanupBindingItem[],
  workflowFollowUp: WorkflowPublishLegacyAuthCleanupWorkflowFollowUp
) {
  return bindings.map((binding) => ({
    ...binding,
    workflow_follow_up: workflowFollowUp,
  }));
}

function formatSummary(count: number, singular: string, emptyLabel: string) {
  if (count <= 0) {
    return emptyLabel;
  }
  return count === 1 ? `1 ${singular}` : `${count} ${singular}s`;
}

function formatBindingLabelPreview(bindings: WorkflowPublishLegacyAuthCleanupBindingItem[]) {
  if (bindings.length <= 0) {
    return "当前没有命中 binding";
  }

  const labels = bindings.slice(0, 2).map((binding) => binding.endpointLabel);
  if (bindings.length <= 2) {
    return labels.join("、");
  }

  return `${labels.join("、")} 等 ${bindings.length} 条 binding`;
}

function buildChecklistItems(
  candidateBindings: WorkflowPublishLegacyAuthCleanupBindingItem[],
  publishedBindings: WorkflowPublishLegacyAuthCleanupBindingItem[],
  offlineBindings: WorkflowPublishLegacyAuthCleanupBindingItem[],
  contract: WorkflowPublishedEndpointLegacyAuthModeContract
): WorkflowPublishLegacyAuthCleanupChecklistItem[] {
  const items: WorkflowPublishLegacyAuthCleanupChecklistItem[] = [];

  if (candidateBindings.length > 0) {
    items.push({
      key: "draft_cleanup",
      title: "先批量下线 draft legacy bindings",
      tone: "ready",
      toneLabel: "可立即执行",
      count: candidateBindings.length,
      detail:
        `先对 ${formatBindingLabelPreview(candidateBindings)} 执行批量 cleanup，把历史 draft binding 切到 offline；这一步不会动到仍在 live 的 published endpoint。`,
    });
  }

  if (publishedBindings.length > 0) {
    items.push({
      key: "published_follow_up",
      title: "再补发支持鉴权的 replacement bindings",
      tone: "manual",
      toneLabel: "人工跟进",
      count: publishedBindings.length,
      detail:
        `对 ${formatBindingLabelPreview(publishedBindings)} 这类仍在 live 的 legacy binding，${buildLegacyPublishAuthModeFollowUp(contract)}`,
    });
  }

  if (offlineBindings.length > 0) {
    items.push({
      key: "offline_inventory",
      title: "保留 offline inventory 做交接与审计",
      tone: "inventory",
      toneLabel: "仅保留审计",
      count: offlineBindings.length,
      detail:
        `像 ${formatBindingLabelPreview(offlineBindings)} 这类已 offline 的 binding 继续保留在治理 inventory；导出清单后即可用于跨版本交接、审计或 operator checklist 核对，不需要重复执行 cleanup。`,
    });
  }

  return items;
}

function slugify(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "workflow";
}

export function buildWorkflowPublishLegacyAuthCleanupSurface(
  bindings: WorkflowPublishedEndpointItem[]
): WorkflowPublishLegacyAuthCleanupSurface {
  const candidateBindings: WorkflowPublishLegacyAuthCleanupBindingItem[] = [];
  const publishedBindings: WorkflowPublishLegacyAuthCleanupBindingItem[] = [];
  const offlineBindings: WorkflowPublishLegacyAuthCleanupBindingItem[] = [];
  const authModeContract = resolveLegacyAuthCleanupContract(bindings);

  for (const binding of bindings) {
    if (!hasLegacyAuthIssue(binding)) {
      continue;
    }

    const item = buildBindingItem(binding);
    if (item.lifecycleStatus === "draft") {
      candidateBindings.push(item);
      continue;
    }

    if (item.lifecycleStatus === "published") {
      publishedBindings.push(item);
      continue;
    }

    offlineBindings.push(item);
  }

  const checklistItems = buildChecklistItems(
    candidateBindings,
    publishedBindings,
    offlineBindings,
    authModeContract
  );

  return {
    shouldRender:
      candidateBindings.length > 0 || publishedBindings.length > 0 || offlineBindings.length > 0,
    title: "Legacy publish auth cleanup",
    description:
      "publish auth 不再承诺 token 后，publish 面板要把历史 binding backlog 变成可治理事实：draft legacy binding 可以批量下线，仍在 published 的 legacy binding 则继续显式保留为人工 follow-up。",
    candidateBindings,
    publishedBindings,
    offlineBindings,
    candidateBindingIds: candidateBindings.map((binding) => binding.bindingId),
    candidateSummary: formatSummary(
      candidateBindings.length,
      "draft cleanup candidate",
      "No draft cleanup candidates"
    ),
    blockedSummary: formatSummary(
      publishedBindings.length,
      "published blocker",
      "No live published blockers"
    ),
    offlineSummary: formatSummary(
      offlineBindings.length,
      "offline inventory item",
      "No offline inventory items"
    ),
    checklistTitle: "Operator checklist",
    checklistDescription:
      "把 legacy publish auth backlog 拆成可立即执行、需要人工跟进和仅保留审计三类动作，避免 bulk cleanup 后再次丢失跨版本上下文。",
    checklistItems,
    exportTitle: "Governance export",
    exportDescription:
      "导出当前 workflow 的 legacy publish auth 治理清单，便于交接、审计或在 workflow library/detail 之外继续跟进。",
    actionLabel: "批量下线 legacy draft bindings",
    pendingLabel: "批量 cleanup 中...",
    idleMessage:
      candidateBindings.length > 0
        ? "批量动作只会处理 draft legacy binding；published legacy binding 仍需先补发新版 binding。"
        : "当前没有可批量下线的 legacy draft binding。"
  };
}

export function buildWorkflowPublishLegacyAuthCleanupExportFilename(
  workflowName: string,
  format: WorkflowPublishLegacyAuthCleanupExportFormat
) {
  return `${slugify(workflowName)}-legacy-publish-auth-governance.${format}`;
}

export function buildWorkflowPublishLegacyAuthCleanupExportPayload({
  workflowId,
  workflowName,
  workflow = null,
  bindings,
  exportedAt = new Date().toISOString(),
}: {
  workflowId: string;
  workflowName: string;
  workflow?: Pick<WorkflowDetail, "tool_governance"> | null;
  bindings: WorkflowPublishedEndpointItem[];
  exportedAt?: string;
}): WorkflowPublishLegacyAuthCleanupExportPayload {
  const surface = buildWorkflowPublishLegacyAuthCleanupSurface(bindings);
  const workflowFollowUp = buildWorkflowPublishLegacyAuthCleanupWorkflowFollowUp({
    workflowId,
    workflow,
  });

  return {
    export: {
      exported_at: exportedAt,
      format: "json",
      binding_count: bindings.length,
    },
    auth_mode_contract: resolveLegacyAuthCleanupContract(bindings),
    workflow: {
      workflow_id: workflowId,
      workflow_name: workflowName,
    },
    summary: {
      draft_candidate_count: surface.candidateBindings.length,
      published_blocker_count: surface.publishedBindings.length,
      offline_inventory_count: surface.offlineBindings.length,
    },
    checklist: surface.checklistItems,
    buckets: {
      draft_candidates: applyWorkflowFollowUpToBindings(
        surface.candidateBindings,
        workflowFollowUp
      ),
      published_blockers: applyWorkflowFollowUpToBindings(
        surface.publishedBindings,
        workflowFollowUp
      ),
      offline_inventory: applyWorkflowFollowUpToBindings(surface.offlineBindings, workflowFollowUp),
    },
  };
}

export function buildWorkflowPublishLegacyAuthExportHint(
  surface: Pick<
    WorkflowPublishLegacyAuthCleanupSurface,
    "shouldRender" | "candidateBindings" | "publishedBindings" | "offlineBindings"
  >
) {
  if (!surface.shouldRender) {
    return null;
  }

  return (
    "导出的 published invocation JSON / JSONL 也会附带当前 workflow 的 legacy publish auth handoff：" +
    `draft ${surface.candidateBindings.length} / ` +
    `published ${surface.publishedBindings.length} / ` +
    `offline ${surface.offlineBindings.length}。`
  );
}

export function serializeWorkflowPublishLegacyAuthCleanupExportJsonl(
  payload: WorkflowPublishLegacyAuthCleanupExportPayload
) {
  const lines = [
    JSON.stringify(
      {
        record_type: "legacy_publish_auth_governance_export",
        export: payload.export,
        auth_mode_contract: payload.auth_mode_contract,
        workflow: payload.workflow,
        summary: payload.summary,
        checklist: payload.checklist,
      },
      null,
      0
    ),
  ];

  const bucketEntries: Array<[
    "draft_candidates" | "published_blockers" | "offline_inventory",
    WorkflowPublishLegacyAuthCleanupBindingItem[]
  ]> = [
    ["draft_candidates", payload.buckets.draft_candidates],
    ["published_blockers", payload.buckets.published_blockers],
    ["offline_inventory", payload.buckets.offline_inventory],
  ];

  for (const [bucket, items] of bucketEntries) {
    for (const item of items) {
      lines.push(
        JSON.stringify(
          {
            record_type: "legacy_publish_auth_binding",
            bucket,
            ...item,
          },
          null,
          0
        )
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function buildWorkflowPublishLegacyAuthCleanupExportActionSurface(
  format: WorkflowPublishLegacyAuthCleanupExportFormat
) {
  return {
    idleLabel: format === "json" ? "导出 JSON 清单" : "导出 JSONL 清单",
    pendingLabel: format === "json" ? "导出 JSON 中..." : "导出 JSONL 中...",
  };
}

export function buildWorkflowPublishLegacyAuthCleanupExportSuccessMessage(
  format: WorkflowPublishLegacyAuthCleanupExportFormat
) {
  return `Legacy publish auth 治理${format.toUpperCase()}清单已开始下载。`;
}

export function buildWorkflowPublishLegacyAuthCleanupExportErrorMessage() {
  return "导出 legacy publish auth 治理清单失败，请重试。";
}

export function buildWorkflowPublishLegacyAuthCleanupValidationMessage() {
  return "缺少可批量下线的 legacy auth draft binding。";
}

export function buildWorkflowPublishLegacyAuthCleanupFallbackErrorMessage() {
  return "批量清理 legacy publish auth draft binding 失败。";
}

export function buildWorkflowPublishLegacyAuthCleanupNetworkErrorMessage() {
  return "无法连接后端执行 legacy publish auth 批量清理，请确认 API 已启动。";
}

export function buildWorkflowPublishLegacyAuthCleanupSuccessMessage(
  result: WorkflowPublishedEndpointLegacyAuthCleanupResult
) {
  if (result.updated_count <= 0) {
    return "没有可批量下线的 legacy auth draft binding。";
  }

  if (result.skipped_count > 0) {
    return `已批量下线 ${result.updated_count} 条 legacy auth draft binding；另外 ${result.skipped_count} 条仍需逐项处理。`;
  }

  return `已批量下线 ${result.updated_count} 条 legacy auth draft binding。`;
}
