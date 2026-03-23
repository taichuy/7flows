"use client";

import { useState } from "react";

import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import {
  buildWorkflowLibraryLegacyAuthGovernanceExportActionSurface,
  buildWorkflowLibraryLegacyAuthGovernanceExportErrorMessage,
  buildWorkflowLibraryLegacyAuthGovernanceExportFilename,
  buildWorkflowLibraryLegacyAuthGovernanceExportPayload,
  buildWorkflowLibraryLegacyAuthGovernanceExportSuccessMessage,
  serializeWorkflowLibraryLegacyAuthGovernanceExportJsonl,
  type WorkflowLibraryLegacyAuthGovernanceExportFormat,
} from "@/lib/workflow-library-legacy-auth-governance";

const EXPORT_FORMATS: WorkflowLibraryLegacyAuthGovernanceExportFormat[] = ["json", "jsonl"];

type ExportFeedback = {
  status: "success" | "error";
  message: string;
};

type WorkflowLibraryLegacyAuthGovernanceExportActionsProps = {
  snapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot;
};

export function WorkflowLibraryLegacyAuthGovernanceExportActions({
  snapshot,
}: WorkflowLibraryLegacyAuthGovernanceExportActionsProps) {
  const [activeExportFormat, setActiveExportFormat] =
    useState<WorkflowLibraryLegacyAuthGovernanceExportFormat | null>(null);
  const [feedback, setFeedback] = useState<ExportFeedback | null>(null);

  function handleExport(format: WorkflowLibraryLegacyAuthGovernanceExportFormat) {
    setActiveExportFormat(format);

    try {
      const payload = buildWorkflowLibraryLegacyAuthGovernanceExportPayload({
        snapshot,
        format,
      });
      const content =
        format === "json"
          ? JSON.stringify(payload, null, 2)
          : serializeWorkflowLibraryLegacyAuthGovernanceExportJsonl(payload);
      const blob = new Blob([content], {
        type: format === "json" ? "application/json" : "application/x-ndjson",
      });

      triggerDownload(blob, buildWorkflowLibraryLegacyAuthGovernanceExportFilename(format));
      setFeedback({
        status: "success",
        message: buildWorkflowLibraryLegacyAuthGovernanceExportSuccessMessage(format),
      });
    } catch {
      setFeedback({
        status: "error",
        message: buildWorkflowLibraryLegacyAuthGovernanceExportErrorMessage(),
      });
    } finally {
      setActiveExportFormat(null);
    }
  }

  return (
    <>
      {EXPORT_FORMATS.map((format) => {
        const actionSurface = buildWorkflowLibraryLegacyAuthGovernanceExportActionSurface(format);

        return (
          <button
            className="activity-link action-link-button"
            disabled={activeExportFormat !== null}
            key={format}
            onClick={() => handleExport(format)}
            type="button"
          >
            {activeExportFormat === format ? actionSurface.pendingLabel : actionSurface.idleLabel}
          </button>
        );
      })}

      {feedback ? <p className={`sync-message ${feedback.status}`}>{feedback.message}</p> : null}
    </>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}
