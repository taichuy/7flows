"use client";

import React, { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  cleanupLegacyPublishedEndpointBindings,
  type CleanupLegacyPublishedEndpointBindingsState,
} from "@/app/actions/publish";
import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";
import { buildWorkflowPublishLegacyAuthCleanupSurface } from "@/lib/workflow-publish-legacy-auth-cleanup";

type WorkflowPublishLegacyAuthCleanupCardProps = {
  workflowId: string;
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

export function WorkflowPublishLegacyAuthCleanupCard({
  workflowId,
  bindings,
  action = cleanupLegacyPublishedEndpointBindings,
}: WorkflowPublishLegacyAuthCleanupCardProps) {
  const surface = buildWorkflowPublishLegacyAuthCleanupSurface(bindings);
  const initialState: CleanupLegacyPublishedEndpointBindingsState = {
    status: "idle",
    message: "",
    workflowId,
    bindingIds: surface.candidateBindingIds,
  };
  const [state, formAction] = useActionState(action, initialState);

  if (!surface.shouldRender) {
    return null;
  }

  return (
    <article className="entry-card compact-card">
      <p className="entry-card-title">{surface.title}</p>
      <p className="section-copy entry-copy">{surface.description}</p>

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
