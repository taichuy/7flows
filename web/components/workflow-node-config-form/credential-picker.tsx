"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { getApiBaseUrl } from "@/lib/api-base-url";

export type CredentialOption = {
  id: string;
  name: string;
  credential_type: string;
  status?: "active" | "revoked";
};

type CredentialPickerProps = {
  /** Current value — may be "credential://{id}" or a plain string. */
  value: string;
  /** Called when the user picks a credential or clears the selection. */
  onChange: (nextValue: string | undefined) => void;
  /** Label shown above the picker. */
  label: string;
  /** Optional hint text below the picker. */
  hint?: string;
  /** Optional filter — only show credentials of this type. */
  credentialType?: string;
  /** Optional filter — allow multiple credential types. */
  credentialTypes?: string[];
  /** Placeholder when nothing is selected. */
  placeholder?: string;
  /** Server-provided credential snapshot to avoid client-side refetch on every inspector mount. */
  credentials?: CredentialOption[];
  /** Optional empty-state copy when no credential matches the provider filter. */
  emptyStateCopy?: string;
};

const CREDENTIAL_PREFIX = "credential://";

export function parseCredentialRef(value: string): string | null {
  if (typeof value === "string" && value.startsWith(CREDENTIAL_PREFIX)) {
    const id = value.slice(CREDENTIAL_PREFIX.length).trim();
    return id || null;
  }
  return null;
}

export function formatCredentialRef(credentialId: string): string {
  return `${CREDENTIAL_PREFIX}${credentialId}`;
}

export function CredentialPicker({
  value,
  onChange,
  label,
  hint,
  credentialType,
  credentialTypes,
  placeholder = "选择凭证",
  credentials,
  emptyStateCopy = "暂无可用凭证，请先创建对应厂商凭证。"
}: CredentialPickerProps) {
  const [loadedCredentials, setLoadedCredentials] = useState<CredentialOption[]>(credentials ?? []);
  const [loading, setLoading] = useState(credentials === undefined);

  useEffect(() => {
    if (credentials) {
      setLoadedCredentials(credentials);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/credentials`, {
          cache: "no-store"
        });
        if (!res.ok) {
          setLoadedCredentials([]);
          return;
        }
        const items = (await res.json()) as CredentialOption[];
        if (!cancelled) {
          setLoadedCredentials(items);
        }
      } catch {
        if (!cancelled) {
          setLoadedCredentials([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [credentials]);

  const allowedCredentialTypes = useMemo(() => {
    if (credentialTypes && credentialTypes.length > 0) {
      return new Set(credentialTypes);
    }
    if (credentialType) {
      return new Set([credentialType]);
    }
    return null;
  }, [credentialType, credentialTypes]);

  const filteredCredentials = allowedCredentialTypes
    ? loadedCredentials.filter((credential) => allowedCredentialTypes.has(credential.credential_type))
    : loadedCredentials;

  const currentCredId = parseCredentialRef(value);
  const currentCredName = currentCredId
    ? filteredCredentials.find((c) => c.id === currentCredId)?.name ?? currentCredId
    : null;

  const handleSelect = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedId = event.target.value;
      if (!selectedId) {
        onChange(undefined);
      } else {
        onChange(`${CREDENTIAL_PREFIX}${selectedId}`);
      }
    },
    [onChange]
  );

  return (
    <div className="binding-field">
      <span className="binding-label">{label}</span>
      {loading ? (
        <span className="section-copy">加载凭证列表...</span>
      ) : filteredCredentials.length === 0 ? (
        <span className="section-copy">{emptyStateCopy}</span>
      ) : (
        <select
          className="binding-select"
          value={currentCredId ?? ""}
          onChange={handleSelect}
        >
          <option value="">{placeholder}</option>
          {filteredCredentials.map((cred) => (
            <option key={cred.id} value={cred.id}>
              {cred.name} ({cred.credential_type})
            </option>
          ))}
        </select>
      )}
      {currentCredName && !currentCredId ? null : null}
      {value && !currentCredId && value !== "" ? (
        <small className="section-copy">
          当前值 <code>{value}</code> 不是 credential:// 引用，将作为明文传递。
        </small>
      ) : null}
      {hint ? <small className="section-copy">{hint}</small> : null}
    </div>
  );
}
