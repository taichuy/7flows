import type {
  WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem,
  WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem,
  WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot,
  WorkflowPublishedEndpointLegacyAuthGovernanceSummary,
  WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem,
} from "@/lib/get-workflow-publish";
import {
  appendWorkflowLibraryViewStateForWorkflow,
  resolveWorkflowLibraryViewStateForWorkflow,
  type WorkflowListDefinitionIssueFilter,
} from "@/lib/workflow-library-query";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";

export type WorkflowLibraryLegacyAuthGovernanceExportFormat = "json" | "jsonl";

export type WorkflowLibraryLegacyAuthGovernanceExportWorkflowFollowUp = {
  workflow_detail_href: string;
  workflow_detail_label: string;
  definition_issue: WorkflowListDefinitionIssueFilter | null;
};

export type WorkflowLibraryLegacyAuthGovernanceExportWorkflowItem =
  WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem & {
    workflow_follow_up: WorkflowLibraryLegacyAuthGovernanceExportWorkflowFollowUp;
  };

export type WorkflowLibraryLegacyAuthGovernanceExportBindingItem =
  WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem & {
    workflow_follow_up: WorkflowLibraryLegacyAuthGovernanceExportWorkflowFollowUp;
  };

export type WorkflowLibraryLegacyAuthGovernanceExportBuckets = {
  draft_candidates: WorkflowLibraryLegacyAuthGovernanceExportBindingItem[];
  published_blockers: WorkflowLibraryLegacyAuthGovernanceExportBindingItem[];
  offline_inventory: WorkflowLibraryLegacyAuthGovernanceExportBindingItem[];
};

export type WorkflowLibraryLegacyAuthGovernanceExportPayload = {
  export: {
    exported_at: string;
    format: WorkflowLibraryLegacyAuthGovernanceExportFormat;
    workflow_count: number;
    binding_count: number;
  };
  summary: WorkflowPublishedEndpointLegacyAuthGovernanceSummary;
  checklist: WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem[];
  workflows: WorkflowLibraryLegacyAuthGovernanceExportWorkflowItem[];
  buckets: WorkflowLibraryLegacyAuthGovernanceExportBuckets;
};

function buildWorkflowLibraryLegacyAuthGovernanceDefaultWorkflowFollowUp(
  workflowId: string,
): WorkflowLibraryLegacyAuthGovernanceExportWorkflowFollowUp {
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

function buildWorkflowLibraryLegacyAuthGovernanceWorkflowFollowUp(
  workflow: WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem,
): WorkflowLibraryLegacyAuthGovernanceExportWorkflowFollowUp {
  const workflowDetailLink = buildAuthorFacingWorkflowDetailLinkSurface({
    workflowId: workflow.workflow_id,
    variant: "editor",
  });
  const viewState = resolveWorkflowLibraryViewStateForWorkflow(workflow, {
    definitionIssue: null,
  });

  return {
    workflow_detail_href: appendWorkflowLibraryViewStateForWorkflow(
      workflowDetailLink.href,
      workflow,
      viewState,
    ),
    workflow_detail_label: workflowDetailLink.label,
    definition_issue: viewState.definitionIssue,
  };
}

function buildWorkflowLibraryLegacyAuthGovernanceBindingItem(
  item: WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem,
  workflowFollowUpsById: Record<string, WorkflowLibraryLegacyAuthGovernanceExportWorkflowFollowUp>,
): WorkflowLibraryLegacyAuthGovernanceExportBindingItem {
  return {
    ...item,
    workflow_follow_up:
      workflowFollowUpsById[item.workflow_id] ??
      buildWorkflowLibraryLegacyAuthGovernanceDefaultWorkflowFollowUp(item.workflow_id),
  };
}

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "workflow-library";
}

export function shouldRenderWorkflowLibraryLegacyAuthGovernance(
  snapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null | undefined,
) {
  return Boolean(snapshot && snapshot.binding_count > 0);
}

export function buildWorkflowLibraryLegacyAuthGovernanceExportFilename(
  format: WorkflowLibraryLegacyAuthGovernanceExportFormat,
) {
  return `${slugify("workflow-library")}-legacy-publish-auth-governance.${format}`;
}

export function buildWorkflowLibraryLegacyAuthGovernanceExportPayload({
  snapshot,
  exportedAt = new Date().toISOString(),
  format = "json",
}: {
  snapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot;
  exportedAt?: string;
  format?: WorkflowLibraryLegacyAuthGovernanceExportFormat;
}): WorkflowLibraryLegacyAuthGovernanceExportPayload {
  const workflows = snapshot.workflows.map((workflow) => ({
    ...workflow,
    workflow_follow_up: buildWorkflowLibraryLegacyAuthGovernanceWorkflowFollowUp(workflow),
  }));
  const workflowFollowUpsById = Object.fromEntries(
    workflows.map((workflow) => [workflow.workflow_id, workflow.workflow_follow_up]),
  );

  return {
    export: {
      exported_at: exportedAt,
      format,
      workflow_count: snapshot.workflow_count,
      binding_count: snapshot.binding_count,
    },
    summary: snapshot.summary,
    checklist: snapshot.checklist,
    workflows,
    buckets: {
      draft_candidates: snapshot.buckets.draft_candidates.map((item) =>
        buildWorkflowLibraryLegacyAuthGovernanceBindingItem(item, workflowFollowUpsById),
      ),
      published_blockers: snapshot.buckets.published_blockers.map((item) =>
        buildWorkflowLibraryLegacyAuthGovernanceBindingItem(item, workflowFollowUpsById),
      ),
      offline_inventory: snapshot.buckets.offline_inventory.map((item) =>
        buildWorkflowLibraryLegacyAuthGovernanceBindingItem(item, workflowFollowUpsById),
      ),
    },
  };
}

export function serializeWorkflowLibraryLegacyAuthGovernanceExportJsonl(
  payload: WorkflowLibraryLegacyAuthGovernanceExportPayload,
) {
  const lines = [
    JSON.stringify(
      {
        record_type: "legacy_publish_auth_library_export",
        export: payload.export,
        summary: payload.summary,
        checklist: payload.checklist,
      },
      null,
      0,
    ),
  ];

  for (const workflow of payload.workflows) {
    lines.push(
      JSON.stringify(
        {
          record_type: "legacy_publish_auth_workflow",
          ...workflow,
        },
        null,
        0,
      ),
    );
  }

  const bucketEntries: Array<
    [
      keyof WorkflowLibraryLegacyAuthGovernanceExportBuckets,
      WorkflowLibraryLegacyAuthGovernanceExportBuckets[keyof WorkflowLibraryLegacyAuthGovernanceExportBuckets],
    ]
  > = [
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
          0,
        ),
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function buildWorkflowLibraryLegacyAuthGovernanceExportActionSurface(
  format: WorkflowLibraryLegacyAuthGovernanceExportFormat,
) {
  return {
    idleLabel: format === "json" ? "导出 JSON 清单" : "导出 JSONL 清单",
    pendingLabel: format === "json" ? "导出 JSON 中..." : "导出 JSONL 中...",
  };
}

export function buildWorkflowLibraryLegacyAuthGovernanceExportSuccessMessage(
  format: WorkflowLibraryLegacyAuthGovernanceExportFormat,
) {
  return `Workflow library legacy publish auth 治理${format.toUpperCase()}清单已开始下载。`;
}

export function buildWorkflowLibraryLegacyAuthGovernanceExportErrorMessage() {
  return "导出 workflow library legacy publish auth 治理清单失败，请重试。";
}
