"use client";

import { useActionState, useState } from "react";

import {
  createCredential,
  revokeCredential,
  type CreateCredentialState,
  type RevokeCredentialState,
} from "@/app/actions/credentials";
import type { CredentialItem } from "@/lib/get-credentials";
import { formatTimestamp } from "@/lib/runtime-presenters";

type Props = {
  credentials: CredentialItem[];
};

const initialCreateState: CreateCredentialState = {
  status: "idle",
  message: "",
  credentialId: "",
};

const initialRevokeState: RevokeCredentialState = {
  status: "idle",
  message: "",
  credentialId: "",
};

export function CredentialStorePanel({ credentials }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);
  const [createState, createAction, createPending] = useActionState(
    createCredential,
    initialCreateState
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeCredential,
    initialRevokeState
  );

  const visible = showRevoked
    ? credentials
    : credentials.filter((c) => c.status === "active");
  const activeCount = credentials.filter((c) => c.status === "active").length;
  const revokedCount = credentials.filter(
    (c) => c.status === "revoked"
  ).length;

  return (
    <section className="card" style={{ marginTop: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0 }}>
          凭证存储{" "}
          <span style={{ fontSize: "0.85em", opacity: 0.7 }}>
            ({activeCount} 活跃
            {revokedCount > 0 ? ` / ${revokedCount} 已吊销` : ""})
          </span>
        </h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {revokedCount > 0 && (
            <button
              className="btn btn-sm"
              onClick={() => setShowRevoked(!showRevoked)}
            >
              {showRevoked ? "隐藏已吊销" : "显示已吊销"}
            </button>
          )}
          <button
            className="btn btn-sm btn-primary"
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? "取消" : "新建凭证"}
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateCredentialForm
          state={createState}
          action={createAction}
          pending={createPending}
          onSuccess={() => setShowCreate(false)}
        />
      )}

      {(createState.status === "success" || revokeState.status === "success") && (
        <div
          className="flash flash-success"
          style={{ marginTop: "0.75rem" }}
        >
          {createState.status === "success"
            ? createState.message
            : revokeState.message}
        </div>
      )}

      {visible.length === 0 ? (
        <p style={{ marginTop: "1rem", opacity: 0.6 }}>
          暂无凭证。点击"新建凭证"添加 API Key、Token 等敏感信息。
        </p>
      ) : (
        <table className="data-table" style={{ marginTop: "1rem" }}>
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>状态</th>
              <th>最后使用</th>
              <th>创建时间</th>
              <th>引用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((cred) => (
              <tr key={cred.id}>
                <td>
                  <strong>{cred.name}</strong>
                  {cred.description && (
                    <div
                      style={{
                        fontSize: "0.8em",
                        opacity: 0.7,
                        maxWidth: "20ch",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cred.description}
                    </div>
                  )}
                </td>
                <td>
                  <code>{cred.credential_type}</code>
                </td>
                <td>
                  <span
                    className={
                      cred.status === "active"
                        ? "badge badge-green"
                        : "badge badge-red"
                    }
                  >
                    {cred.status === "active" ? "活跃" : "已吊销"}
                  </span>
                </td>
                <td>
                  {cred.last_used_at
                    ? formatTimestamp(cred.last_used_at)
                    : "—"}
                </td>
                <td>{formatTimestamp(cred.created_at)}</td>
                <td>
                  <code
                    style={{
                      fontSize: "0.75em",
                      userSelect: "all",
                      wordBreak: "break-all",
                    }}
                  >
                    credential://{cred.id}
                  </code>
                </td>
                <td>
                  {cred.status === "active" && (
                    <form action={revokeAction}>
                      <input
                        type="hidden"
                        name="credentialId"
                        value={cred.id}
                      />
                      <button
                        className="btn btn-sm btn-danger"
                        type="submit"
                        disabled={revokePending}
                      >
                        吊销
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {revokeState.status === "error" && (
        <div className="flash flash-error" style={{ marginTop: "0.5rem" }}>
          {revokeState.message}
        </div>
      )}
    </section>
  );
}

function CreateCredentialForm({
  state,
  action,
  pending,
  onSuccess,
}: {
  state: CreateCredentialState;
  action: (payload: FormData) => void;
  pending: boolean;
  onSuccess: () => void;
}) {
  const [dataText, setDataText] = useState('{\n  "api_key": ""\n}');

  if (state.status === "success") {
    onSuccess();
  }

  return (
    <form
      action={action}
      style={{
        marginTop: "1rem",
        padding: "1rem",
        border: "1px solid var(--border-muted, #333)",
        borderRadius: "8px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
        }}
      >
        <label>
          <span style={{ fontSize: "0.85em" }}>名称</span>
          <input
            name="name"
            required
            placeholder="My OpenAI Key"
            className="input"
            style={{ width: "100%" }}
          />
        </label>
        <label>
          <span style={{ fontSize: "0.85em" }}>类型</span>
          <input
            name="credentialType"
            required
            placeholder="api_key"
            className="input"
            style={{ width: "100%" }}
          />
        </label>
      </div>
      <label style={{ display: "block", marginTop: "0.75rem" }}>
        <span style={{ fontSize: "0.85em" }}>描述 (可选)</span>
        <input
          name="description"
          placeholder="用途说明"
          className="input"
          style={{ width: "100%" }}
        />
      </label>
      <label style={{ display: "block", marginTop: "0.75rem" }}>
        <span style={{ fontSize: "0.85em" }}>
          数据 (JSON key-value，值将加密存储)
        </span>
        <textarea
          name="data"
          required
          className="input"
          style={{
            width: "100%",
            minHeight: "4rem",
            fontFamily: "monospace",
            fontSize: "0.85em",
          }}
          value={dataText}
          onChange={(e) => setDataText(e.target.value)}
        />
      </label>

      {state.status === "error" && (
        <div className="flash flash-error" style={{ marginTop: "0.5rem" }}>
          {state.message}
        </div>
      )}

      <div style={{ marginTop: "0.75rem" }}>
        <button
          className="btn btn-primary"
          type="submit"
          disabled={pending}
        >
          {pending ? "创建中…" : "创建凭证"}
        </button>
      </div>
    </form>
  );
}
