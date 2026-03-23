import type {
  WorkflowPublishedEndpointLegacyAuthGovernanceBuckets,
  WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem,
  WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot,
  WorkflowPublishedEndpointLegacyAuthGovernanceSummary,
  WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem,
} from "@/lib/get-workflow-publish";

export type WorkflowLibraryLegacyAuthGovernanceExportFormat = "json" | "jsonl";

export type WorkflowLibraryLegacyAuthGovernanceExportPayload = {
  export: {
    exported_at: string;
    format: WorkflowLibraryLegacyAuthGovernanceExportFormat;
    workflow_count: number;
    binding_count: number;
  };
  summary: WorkflowPublishedEndpointLegacyAuthGovernanceSummary;
  checklist: WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem[];
  workflows: WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem[];
  buckets: WorkflowPublishedEndpointLegacyAuthGovernanceBuckets;
};

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
  return {
    export: {
      exported_at: exportedAt,
      format,
      workflow_count: snapshot.workflow_count,
      binding_count: snapshot.binding_count,
    },
    summary: snapshot.summary,
    checklist: snapshot.checklist,
    workflows: snapshot.workflows,
    buckets: snapshot.buckets,
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
    [keyof WorkflowPublishedEndpointLegacyAuthGovernanceBuckets, WorkflowPublishedEndpointLegacyAuthGovernanceBuckets[keyof WorkflowPublishedEndpointLegacyAuthGovernanceBuckets]]
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
