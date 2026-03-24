"use client";

import React, { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  cleanupLegacyPublishedEndpointBindings,
  type CleanupLegacyPublishedEndpointBindingsState,
} from "@/app/actions/publish";
import { LegacyPublishAuthContractCard } from "@/components/legacy-publish-auth-contract-card";
import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";
import {
  buildWorkflowPublishLegacyAuthCleanupExportActionSurface,
  buildWorkflowPublishLegacyAuthCleanupExportErrorMessage,
  buildWorkflowPublishLegacyAuthCleanupExportFilename,
  buildWorkflowPublishLegacyAuthCleanupExportPayload,
  buildWorkflowPublishLegacyAuthCleanupExportSuccessMessage,
  buildWorkflowPublishLegacyAuthCleanupSurface,
  serializeWorkflowPublishLegacyAuthCleanupExportJsonl,
  type WorkflowPublishLegacyAuthCleanupExportFormat,
} from "@/lib/workflow-publish-legacy-auth-cleanup";

type WorkflowPublishLegacyAuthCleanupCardProps = {
  workflowId: string;
  workflowName?: string;
  bindings: WorkflowPublishedEndpointItem[];
  action?: (
    state: CleanupLegacyPublishedEndpointBindingsState,
    formData: FormData
  ) => Promise<CleanupLegacyPublishedEndpointBindingsState>;
};

function CleanupSubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className="sync-button" type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

const EXPORT_FORMATS: WorkflowPublishLegacyAuthCleanupExportFormat[] = ["json", "jsonl"];

export function WorkflowPublishLegacyAuthCleanupCard({
  workflowId,
  workflowName = workflowId,
  bindings,
  action = cleanupLegacyPublishedEndpointBindings,
}: WorkflowPublishLegacyAuthCleanupCardProps) {
  const surface = buildWorkflowPublishLegacyAuthCleanupSurface(bindings);
  const exportPayload = useMemo(
    () => buildWorkflowPublishLegacyAuthCleanupExportPayload({ workflowId, workflowName, bindings }),
    [bindings, workflowId, workflowName]
  );
  const initialState: CleanupLegacyPublishedEndpointBindingsState = {
    status: "idle",
    message: "",
    workflowId,
    bindingIds: surface.candidateBindingIds,
  };
  const [state, formAction] = useActionState(action, initialState);
  const [activeExportFormat, setActiveExportFormat] =
    useState<WorkflowPublishLegacyAuthCleanupExportFormat | null>(null);
  const [exportFeedback, setExportFeedback] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  if (!surface.shouldRender) {
    return null;
  }

  function handleExport(format: WorkflowPublishLegacyAuthCleanupExportFormat) {
    setActiveExportFormat(format);
    setExportFeedback(null);

    try {
      const payload = {
        ...exportPayload,
        export: {
          ...exportPayload.export,
          exported_at: new Date().toISOString(),
          format,
        },
      };
      const content =
        format === "json"
          ? JSON.stringify(payload, null, 2)
          : serializeWorkflowPublishLegacyAuthCleanupExportJsonl(payload);
      const blob = new Blob([content], {
        type:
          format === "json"
            ? "application/json;charset=utf-8"
            : "application/x-ndjson;charset=utf-8",
      });

      triggerDownload(blob, buildWorkflowPublishLegacyAuthCleanupExportFilename(workflowName, format));
      setExportFeedback({
        status: "success",
        message: buildWorkflowPublishLegacyAuthCleanupExportSuccessMessage(format),
      });
    } catch {
      setExportFeedback({
        status: "error",
        message: buildWorkflowPublishLegacyAuthCleanupExportErrorMessage(),
      });
    } finally {
      setActiveExportFormat(null);
    }
  }

  return (
    <article className="entry-card compact-card">
      <p className="entry-card-title">{surface.title}</p>
      <p className="section-copy entry-copy">{surface.description}</p>

      <LegacyPublishAuthContractCard />

      <div className="summary-strip compact-strip">
        <article className="summary-card">
          <span>Draft candidates</span>
          <strong>{surface.candidateSummary}</strong>
        </article>
        <article className="summary-card">
          <span>Published blockers</span>
          <strong>{surface.blockedSummary}</strong>
        </article>
        <article className="summary-card">
          <span>Offline inventory</span>
          <strong>{surface.offlineSummary}</strong>
        </article>
      </div>

      {surface.candidateBindings.length > 0 ? (
        <div className="publish-key-list">
          {surface.candidateBindings.map((binding) => (
            <article className="payload-card compact-card" key={binding.bindingId}>
              <div className="payload-card-header">
                <span className="status-meta">Draft cleanup candidate</span>
                <span className="event-chip">workflow {binding.workflowVersion}</span>
              </div>
              <p className="binding-meta">{binding.endpointLabel}</p>
              <p className="section-copy entry-copy">{binding.detail}</p>
            </article>
          ))}
        </div>
      ) : null}

      {surface.publishedBindings.length > 0 ? (
        <div className="publish-key-list">
          {surface.publishedBindings.map((binding) => (
            <article className="payload-card compact-card" key={binding.bindingId}>
              <div className="payload-card-header">
                <span className="status-meta">Published blocker</span>
                <span className="event-chip">workflow {binding.workflowVersion}</span>
              </div>
              <p className="binding-meta">{binding.endpointLabel}</p>
              <p className="section-copy entry-copy">{binding.detail}</p>
            </article>
          ))}
        </div>
      ) : null}

      {surface.offlineBindings.length > 0 ? (
        <div className="event-type-strip">
          {surface.offlineBindings.map((binding) => (
            <span className="event-chip" key={binding.bindingId}>
              {binding.endpointLabel} · workflow {binding.workflowVersion} · offline
            </span>
          ))}
        </div>
      ) : null}

      {surface.checklistItems.length > 0 ? (
        <div className="publish-key-list">
          <div>
            <p className="entry-card-title">{surface.checklistTitle}</p>
            <p className="section-copy entry-copy">{surface.checklistDescription}</p>
          </div>

          {surface.checklistItems.map((item) => (
            <article className="payload-card compact-card" key={item.key}>
              <div className="payload-card-header">
                <span className="status-meta">{item.toneLabel}</span>
                <span className="event-chip">{item.count} items</span>
              </div>
              <p className="binding-meta">{item.title}</p>
              <p className="section-copy entry-copy">{item.detail}</p>
            </article>
          ))}
        </div>
      ) : null}

      <div className="binding-actions">
        <div>
          <p className="entry-card-title">{surface.exportTitle}</p>
          <p className="section-copy entry-copy">{surface.exportDescription}</p>
        </div>

        {EXPORT_FORMATS.map((format) => {
          const actionSurface = buildWorkflowPublishLegacyAuthCleanupExportActionSurface(format);

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
      </div>

      {exportFeedback ? (
        <p className={`sync-message ${exportFeedback.status}`}>{exportFeedback.message}</p>
      ) : null}

      <form action={formAction} className="binding-actions publish-lifecycle-form">
        <input type="hidden" name="workflowId" value={workflowId} />
        {surface.candidateBindingIds.map((bindingId) => (
          <input key={bindingId} type="hidden" name="bindingId" value={bindingId} />
        ))}
        <p className="section-copy entry-copy">{surface.idleMessage}</p>
        {surface.candidateBindingIds.length > 0 ? (
          <CleanupSubmitButton
            label={surface.actionLabel}
            pendingLabel={surface.pendingLabel}
          />
        ) : null}
        {state.message ? (
          <p className={`sync-message ${state.status}`}>{state.message}</p>
        ) : null}
      </form>
    </article>
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
