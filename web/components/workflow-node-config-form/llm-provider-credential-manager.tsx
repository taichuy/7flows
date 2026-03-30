"use client";

import React, { useEffect, useMemo, useState } from "react";

import type { CredentialItem } from "@/lib/get-credentials";
import {
  formatCredentialTypeLabel,
  type NativeLlmProviderPreset
} from "@/lib/llm-provider-presets";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { formatCredentialRef, parseCredentialRef } from "@/components/workflow-node-config-form/credential-picker";

type MessageState = {
  tone: "success" | "error";
  text: string;
} | null;

type CredentialDraft = {
  name: string;
  description: string;
  apiKey: string;
};

const CREDENTIALS_API_PATH = "/api/credentials";

type LlmProviderCredentialManagerProps = {
  providerPreset: NativeLlmProviderPreset;
  credentials: CredentialItem[];
  selectedCredentialValue: string;
  onSelectCredential: (nextValue: string | undefined) => void;
};

function buildCreateDraft(providerPreset: NativeLlmProviderPreset): CredentialDraft {
  return {
    name: `${providerPreset.label} API Key`,
    description: `${providerPreset.label} runtime credential`,
    apiKey: ""
  };
}

function buildUpdateDraft(selectedCredential: CredentialItem | null): CredentialDraft {
  return {
    name: selectedCredential?.name ?? "",
    description: selectedCredential?.description ?? "",
    apiKey: ""
  };
}

async function readResponseDetail(response: Response): Promise<string> {
  const bodyText = await response.text().catch(() => "");
  return bodyText || `API 返回 ${response.status}`;
}

export function LlmProviderCredentialManager({
  providerPreset,
  credentials,
  selectedCredentialValue,
  onSelectCredential
}: LlmProviderCredentialManagerProps) {
  const [credentialItems, setCredentialItems] = useState(credentials);
  const [message, setMessage] = useState<MessageState>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createDraft, setCreateDraft] = useState(() => buildCreateDraft(providerPreset));
  const selectedCredentialId = parseCredentialRef(selectedCredentialValue);

  const providerCredentials = useMemo(
    () =>
      credentialItems.filter((credential) =>
        providerPreset.compatibleCredentialTypes.includes(credential.credential_type)
      ),
    [credentialItems, providerPreset.compatibleCredentialTypes]
  );
  const activeProviderCredentials = useMemo(
    () => providerCredentials.filter((credential) => credential.status === "active"),
    [providerCredentials]
  );
  const selectedCredential = useMemo(
    () => providerCredentials.find((credential) => credential.id === selectedCredentialId) ?? null,
    [providerCredentials, selectedCredentialId]
  );
  const [updateDraft, setUpdateDraft] = useState<CredentialDraft>(
    buildUpdateDraft(selectedCredential)
  );

  useEffect(() => {
    setCredentialItems(credentials);
  }, [credentials]);

  useEffect(() => {
    setCreateDraft(buildCreateDraft(providerPreset));
    setShowCreateForm(false);
    setShowUpdateForm(false);
    setMessage(null);
  }, [providerPreset]);

  useEffect(() => {
    setUpdateDraft(buildUpdateDraft(selectedCredential));
  }, [selectedCredential]);

  async function handleCreateCredential() {
    const apiKey = createDraft.apiKey.trim();
    if (!apiKey) {
      setMessage({ tone: "error", text: `请先写入 ${providerPreset.label} API Key。` });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(CREDENTIALS_API_PATH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: createDraft.name.trim() || `${providerPreset.label} API Key`,
          credential_type: providerPreset.credentialType,
          description: createDraft.description.trim(),
          sensitivity_level: "L2",
          data: {
            api_key: apiKey
          }
        })
      });

      if (!response.ok) {
        setMessage({ tone: "error", text: await readResponseDetail(response) });
        return;
      }

      const createdCredential = (await response.json()) as CredentialItem;
      setCredentialItems((current) => [createdCredential, ...current.filter((item) => item.id !== createdCredential.id)]);
      onSelectCredential(formatCredentialRef(createdCredential.id));
      setCreateDraft(buildCreateDraft(providerPreset));
      setShowCreateForm(false);
      setMessage({
        tone: "success",
        text: `已创建 ${providerPreset.label} 凭证，并写回 ${formatCredentialRef(createdCredential.id)}。`
      });
    } catch (error) {
      setMessage({ tone: "error", text: `创建凭证失败：${String(error)}` });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateCredential() {
    if (!selectedCredential) {
      setMessage({ tone: "error", text: "请先选择一个要更新的凭证。" });
      return;
    }

    const payload: Record<string, unknown> = {};
    if (updateDraft.name.trim() && updateDraft.name.trim() !== selectedCredential.name) {
      payload.name = updateDraft.name.trim();
    }
    if (updateDraft.description.trim() !== selectedCredential.description) {
      payload.description = updateDraft.description.trim();
    }
    if (updateDraft.apiKey.trim()) {
      payload.data = {
        api_key: updateDraft.apiKey.trim()
      };
    }

    if (Object.keys(payload).length === 0) {
      setMessage({ tone: "error", text: "请至少修改名称、描述或输入新的 API Key。" });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `${CREDENTIALS_API_PATH}/${encodeURIComponent(selectedCredential.id)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        setMessage({ tone: "error", text: await readResponseDetail(response) });
        return;
      }

      const updatedCredential = (await response.json()) as CredentialItem;
      setCredentialItems((current) =>
        current.map((item) => (item.id === updatedCredential.id ? updatedCredential : item))
      );
      setUpdateDraft(buildUpdateDraft(updatedCredential));
      setShowUpdateForm(false);
      setMessage({ tone: "success", text: `已更新凭证 ${updatedCredential.name}。` });
    } catch (error) {
      setMessage({ tone: "error", text: `更新凭证失败：${String(error)}` });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevokeCredential() {
    if (!selectedCredential) {
      setMessage({ tone: "error", text: "当前没有选中的凭证可吊销。" });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `${CREDENTIALS_API_PATH}/${encodeURIComponent(selectedCredential.id)}`,
        {
          method: "DELETE"
        }
      );

      if (!response.ok) {
        setMessage({ tone: "error", text: await readResponseDetail(response) });
        return;
      }

      const revokedCredential = (await response.json()) as CredentialItem;
      setCredentialItems((current) =>
        current.map((item) => (item.id === revokedCredential.id ? revokedCredential : item))
      );
      onSelectCredential(undefined);
      setShowUpdateForm(false);
      setMessage({
        tone: "success",
        text: `已吊销凭证 ${revokedCredential.name}，当前节点已清空 credential 引用。`
      });
    } catch (error) {
      setMessage({ tone: "error", text: `吊销凭证失败：${String(error)}` });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="payload-card compact-card" data-component="llm-provider-credential-manager">
      <div className="payload-card-header">
        <div>
          <span className="status-meta">Provider credential</span>
          <strong>{providerPreset.label} 凭证快捷管理</strong>
        </div>
        <span className="event-chip">{providerPreset.protocolLabel}</span>
      </div>
      <p className="section-copy">
        当前 provider 推荐使用 <code>{providerPreset.credentialType}</code>；也兼容历史
        <code>api_key</code> 凭证。运行时仍统一通过 <code>credential://</code> 解密注入。
      </p>

      <div className="tool-badge-row" style={{ marginTop: "0.75rem" }}>
        <button className="btn btn-sm" type="button" onClick={() => setShowCreateForm((value) => !value)}>
          {showCreateForm ? "收起新建" : "新建凭证"}
        </button>
        <button
          className="btn btn-sm"
          type="button"
          disabled={!selectedCredential}
          onClick={() => setShowUpdateForm((value) => !value)}
        >
          {showUpdateForm ? "收起更新" : "更新当前"}
        </button>
        <button
          className="btn btn-sm btn-danger"
          type="button"
          disabled={!selectedCredential || isSubmitting}
          onClick={() => void handleRevokeCredential()}
        >
          吊销当前
        </button>
      </div>

      {selectedCredential ? (
        <div className="binding-help" style={{ marginTop: "0.75rem" }}>
          <strong>{selectedCredential.name}</strong>
          <span>
            {formatCredentialTypeLabel(selectedCredential.credential_type)} · {selectedCredential.status === "active" ? "活跃" : "已吊销"}
          </span>
          <span>
            {formatCredentialRef(selectedCredential.id)}
            {selectedCredential.last_used_at
              ? ` · 最近使用 ${formatTimestamp(selectedCredential.last_used_at)}`
              : " · 还未被 runtime 使用"}
          </span>
        </div>
      ) : (
        <p className="section-copy" style={{ marginTop: "0.75rem" }}>
          当前节点还没有选中 {providerPreset.label} 凭证，可直接在这里新建后自动写回。
        </p>
      )}

      {providerCredentials.length > 0 ? (
        <div className="tool-badge-row" style={{ marginTop: "0.75rem" }}>
          {activeProviderCredentials.slice(0, 4).map((credential) => (
            <span className="event-chip" key={credential.id}>
              {credential.name}
            </span>
          ))}
          <span className="event-chip">
            {activeProviderCredentials.length} 个活跃 / {providerCredentials.length} 个总计
          </span>
        </div>
      ) : null}

      {showCreateForm ? (
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
          <label className="binding-field">
            <span className="binding-label">凭证名称</span>
            <input
              className="trace-text-input"
              value={createDraft.name}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder={`${providerPreset.label} Production`}
            />
          </label>
          <label className="binding-field">
            <span className="binding-label">描述</span>
            <input
              className="trace-text-input"
              value={createDraft.description}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="说明这把 key 供哪个 workflow / 环境使用"
            />
          </label>
          <label className="binding-field">
            <span className="binding-label">API Key</span>
            <input
              className="trace-text-input"
              type="password"
              value={createDraft.apiKey}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, apiKey: event.target.value }))
              }
              placeholder={`写入 ${providerPreset.label} API Key`}
            />
          </label>
          <button
            className="btn btn-primary"
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleCreateCredential()}
          >
            {isSubmitting ? "保存中…" : `创建 ${providerPreset.shortLabel} 凭证`}
          </button>
        </div>
      ) : null}

      {showUpdateForm && selectedCredential ? (
        <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
          <label className="binding-field">
            <span className="binding-label">凭证名称</span>
            <input
              className="trace-text-input"
              value={updateDraft.name}
              onChange={(event) =>
                setUpdateDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <label className="binding-field">
            <span className="binding-label">描述</span>
            <input
              className="trace-text-input"
              value={updateDraft.description}
              onChange={(event) =>
                setUpdateDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label className="binding-field">
            <span className="binding-label">新 API Key</span>
            <input
              className="trace-text-input"
              type="password"
              value={updateDraft.apiKey}
              onChange={(event) =>
                setUpdateDraft((current) => ({ ...current, apiKey: event.target.value }))
              }
              placeholder="如需轮换 key，请在这里输入新值"
            />
          </label>
          <button
            className="btn btn-primary"
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleUpdateCredential()}
          >
            {isSubmitting ? "更新中…" : "保存当前凭证"}
          </button>
        </div>
      ) : null}

      {message ? (
        <p className={message.tone === "error" ? "empty-state" : "section-copy"} style={{ marginTop: "0.75rem" }}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
