"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createPublishedEndpointApiKey,
  revokePublishedEndpointApiKey,
  type CreatePublishedEndpointApiKeyState,
  type RevokePublishedEndpointApiKeyState
} from "@/app/actions/publish";
import type { PublishedEndpointApiKeyItem } from "@/lib/get-workflow-publish";
import { formatTimestamp } from "@/lib/runtime-presenters";
import {
  buildWorkflowPublishApiKeyManagerSurface,
  buildWorkflowPublishApiKeySecretReceiptCopy
} from "@/lib/workflow-publish-binding-presenters";

type WorkflowPublishApiKeyManagerProps = {
  workflowId: string;
  bindingId: string;
  apiKeys: PublishedEndpointApiKeyItem[];
};

function CreateApiKeySubmitButton({
  label,
  pendingLabel
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

function RevokeApiKeySubmitButton({
  label,
  pendingLabel
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className="sync-button secondary-button" type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function WorkflowPublishApiKeyRevokeForm({
  workflowId,
  bindingId,
  apiKey,
  revokeButtonLabel,
  revokePendingLabel
}: {
  workflowId: string;
  bindingId: string;
  apiKey: PublishedEndpointApiKeyItem;
  revokeButtonLabel: string;
  revokePendingLabel: string;
}) {
  const initialState: RevokePublishedEndpointApiKeyState = {
    status: "idle",
    message: "",
    workflowId,
    bindingId,
    keyId: apiKey.id
  };
  const [state, formAction] = useActionState(
    revokePublishedEndpointApiKey,
    initialState
  );

  return (
    <form action={formAction} className="binding-actions">
      <input type="hidden" name="workflowId" value={workflowId} />
      <input type="hidden" name="bindingId" value={bindingId} />
      <input type="hidden" name="keyId" value={apiKey.id} />
      <input type="hidden" name="keyName" value={apiKey.name} />
      <RevokeApiKeySubmitButton label={revokeButtonLabel} pendingLabel={revokePendingLabel} />
      {state.message ? (
        <p className={`sync-message ${state.status}`}>{state.message}</p>
      ) : null}
    </form>
  );
}

export function WorkflowPublishApiKeyManager({
  workflowId,
  bindingId,
  apiKeys
}: WorkflowPublishApiKeyManagerProps) {
  const surface = buildWorkflowPublishApiKeyManagerSurface(apiKeys);
  const initialState: CreatePublishedEndpointApiKeyState = {
    status: "idle",
    message: "",
    workflowId,
    bindingId,
    name: "",
    secretKey: null,
    keyPrefix: null
  };
  const [state, formAction] = useActionState(
    createPublishedEndpointApiKey,
    initialState
  );

  return (
    <div className="entry-card compact-card">
      <p className="entry-card-title">{surface.title}</p>
      <p className="section-copy entry-copy">{surface.description}</p>

      <div className="summary-strip compact-strip">
        {surface.summaryCards.map((card) => (
          <article className="summary-card" key={card.key}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <form action={formAction} className="binding-form">
        <input type="hidden" name="workflowId" value={workflowId} />
        <input type="hidden" name="bindingId" value={bindingId} />
        <label className="binding-field">
          <span className="binding-label">{surface.nameFieldLabel}</span>
          <input
            className="binding-input"
            name="name"
            type="text"
            placeholder={surface.namePlaceholder}
            defaultValue={state.name}
            maxLength={128}
            required
          />
        </label>
        <div className="binding-actions">
          <CreateApiKeySubmitButton
            label={surface.createButtonLabel}
            pendingLabel={surface.createPendingLabel}
          />
          {state.message ? (
            <p className={`sync-message ${state.status}`}>{state.message}</p>
          ) : null}
        </div>
      </form>

      {state.secretKey ? (
        <div className="publish-secret-box">
          <p className="status-meta">{surface.secretLabel}</p>
          <code className="publish-secret-value">{state.secretKey}</code>
          <p className="section-copy entry-copy">
            {buildWorkflowPublishApiKeySecretReceiptCopy(state.keyPrefix)}
          </p>
        </div>
      ) : null}

      {apiKeys.length ? (
        <div className="publish-key-list">
          {apiKeys.map((apiKey) => (
            <article className="payload-card compact-card" key={apiKey.id}>
              <div className="payload-card-header">
                <span className="status-meta">{apiKey.name}</span>
                <span className="event-chip">{apiKey.key_prefix}</span>
              </div>
              <dl className="compact-meta-list publish-key-meta">
                <div>
                  <dt>{surface.createdLabel}</dt>
                  <dd>{formatTimestamp(apiKey.created_at)}</dd>
                </div>
                <div>
                  <dt>{surface.lastUsedLabel}</dt>
                  <dd>{formatTimestamp(apiKey.last_used_at)}</dd>
                </div>
              </dl>
              <WorkflowPublishApiKeyRevokeForm
                workflowId={workflowId}
                bindingId={bindingId}
                apiKey={apiKey}
                revokeButtonLabel={surface.revokeButtonLabel}
                revokePendingLabel={surface.revokePendingLabel}
              />
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state compact">{surface.emptyState}</p>
      )}
    </div>
  );
}
