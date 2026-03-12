"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createPublishedEndpointApiKey,
  revokePublishedEndpointApiKey,
  type CreatePublishedEndpointApiKeyState,
  type RevokePublishedEndpointApiKeyState
} from "@/app/actions";
import type { PublishedEndpointApiKeyItem } from "@/lib/get-workflow-publish";
import { formatTimestamp } from "@/lib/runtime-presenters";

type WorkflowPublishApiKeyManagerProps = {
  workflowId: string;
  bindingId: string;
  apiKeys: PublishedEndpointApiKeyItem[];
};

function CreateApiKeySubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="sync-button" type="submit" disabled={pending}>
      {pending ? "创建中..." : "创建 API key"}
    </button>
  );
}

function RevokeApiKeySubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="sync-button secondary-button" type="submit" disabled={pending}>
      {pending ? "撤销中..." : "撤销"}
    </button>
  );
}

function WorkflowPublishApiKeyRevokeForm({
  workflowId,
  bindingId,
  apiKey
}: {
  workflowId: string;
  bindingId: string;
  apiKey: PublishedEndpointApiKeyItem;
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
      <RevokeApiKeySubmitButton />
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
      <p className="entry-card-title">API key governance</p>
      <p className="section-copy entry-copy">
        仅对 `auth_mode=api_key` 的 endpoint 生效。secret 只在创建后回显一次。
      </p>

      <div className="summary-strip compact-strip">
        <article className="summary-card">
          <span>Active keys</span>
          <strong>{apiKeys.length}</strong>
        </article>
        <article className="summary-card">
          <span>Last used</span>
          <strong>{formatTimestamp(apiKeys[0]?.last_used_at)}</strong>
        </article>
      </div>

      <form action={formAction} className="binding-form">
        <input type="hidden" name="workflowId" value={workflowId} />
        <input type="hidden" name="bindingId" value={bindingId} />
        <label className="binding-field">
          <span className="binding-label">Key name</span>
          <input
            className="binding-input"
            name="name"
            type="text"
            placeholder="例如 Production Gateway"
            defaultValue={state.name}
            maxLength={128}
            required
          />
        </label>
        <div className="binding-actions">
          <CreateApiKeySubmitButton />
          {state.message ? (
            <p className={`sync-message ${state.status}`}>{state.message}</p>
          ) : null}
        </div>
      </form>

      {state.secretKey ? (
        <div className="publish-secret-box">
          <p className="status-meta">One-time secret</p>
          <code className="publish-secret-value">{state.secretKey}</code>
          <p className="section-copy entry-copy">
            prefix {state.keyPrefix ?? "unknown"}。刷新页面后将无法再次查看该 secret。
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
                  <dt>Created</dt>
                  <dd>{formatTimestamp(apiKey.created_at)}</dd>
                </div>
                <div>
                  <dt>Last used</dt>
                  <dd>{formatTimestamp(apiKey.last_used_at)}</dd>
                </div>
              </dl>
              <WorkflowPublishApiKeyRevokeForm
                workflowId={workflowId}
                bindingId={bindingId}
                apiKey={apiKey}
              />
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state compact">
          当前还没有 active API key。若该 endpoint 已发布给外部系统，建议先创建独立 key 再分发。
        </p>
      )}
    </div>
  );
}
