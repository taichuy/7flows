"use client";

import React, { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { UpdatePublishedEndpointLifecycleState } from "@/app/actions/publish";
import { WorkflowGovernanceHandoffCards } from "@/components/workflow-governance-handoff-cards";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowGovernanceHandoff } from "@/lib/workflow-governance-handoff";
import { buildWorkflowPublishLifecycleActionSurface } from "@/lib/workflow-publish-binding-presenters";
import type { WorkflowPublishedEndpointIssue } from "@/lib/get-workflow-publish";

type WorkflowPublishLifecycleFormProps = {
  workflowId: string;
  bindingId: string;
  currentStatus: "draft" | "published" | "offline";
  sandboxReadiness?: SandboxReadinessCheck | null;
  issues?: WorkflowPublishedEndpointIssue[];
  workflowGovernanceHandoff?: WorkflowGovernanceHandoff | null;
  action: (
    state: UpdatePublishedEndpointLifecycleState,
    formData: FormData
  ) => Promise<UpdatePublishedEndpointLifecycleState>;
};

function PublishLifecycleSubmitButton({
  label,
  pendingLabel,
  disabled = false
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button className="sync-button" type="submit" disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function WorkflowPublishLifecycleForm({
  workflowId,
  bindingId,
  currentStatus,
  sandboxReadiness,
  issues,
  workflowGovernanceHandoff = null,
  action
}: WorkflowPublishLifecycleFormProps) {
  const surface = buildWorkflowPublishLifecycleActionSurface({
    currentStatus,
    sandboxReadiness,
    issues
  });
  const hasWorkflowGovernanceHandoff = Boolean(
    workflowGovernanceHandoff?.workflowCatalogGapSummary ||
      workflowGovernanceHandoff?.legacyAuthHandoff
  );
  const initialState: UpdatePublishedEndpointLifecycleState = {
    status: "idle",
    message: "",
    workflowId,
    bindingId,
    nextStatus: surface.nextStatus
  };
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="binding-actions publish-lifecycle-form">
      <input type="hidden" name="workflowId" value={workflowId} />
      <input type="hidden" name="bindingId" value={bindingId} />
      <input type="hidden" name="nextStatus" value={surface.nextStatus} />
      {surface.preflightDescription ? (
        <p className="section-copy entry-copy">{surface.preflightDescription}</p>
      ) : null}
      {hasWorkflowGovernanceHandoff ? (
        <div className="publish-key-list">
          <div>
            <p className="entry-card-title">Workflow handoff</p>
            <p className="section-copy entry-copy">
              当前 lifecycle preflight 也直接复用 shared workflow governance handoff，避免作者在
              action disabled 后还要回 binding 顶部或 workflow detail 重新拼接 catalog gap /
              publish auth contract。
            </p>
          </div>

          <WorkflowGovernanceHandoffCards
            workflowCatalogGapSummary={workflowGovernanceHandoff?.workflowCatalogGapSummary}
            workflowCatalogGapDetail={workflowGovernanceHandoff?.workflowCatalogGapDetail}
            workflowCatalogGapHref={workflowGovernanceHandoff?.workflowCatalogGapHref}
            workflowGovernanceHref={workflowGovernanceHandoff?.workflowGovernanceHref}
            legacyAuthHandoff={workflowGovernanceHandoff?.legacyAuthHandoff}
            cardClassName="payload-card compact-card"
          />
        </div>
      ) : null}
      <PublishLifecycleSubmitButton
        label={surface.submitLabel}
        pendingLabel={surface.pendingLabel}
        disabled={surface.submitDisabled}
      />
      {state.message ? (
        <p className={`sync-message ${state.status}`}>{state.message}</p>
      ) : null}
    </form>
  );
}
