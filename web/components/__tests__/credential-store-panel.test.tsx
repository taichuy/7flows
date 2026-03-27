import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CredentialStorePanel } from "@/components/credential-store-panel";
import type { CredentialAuditItem, CredentialItem } from "@/lib/get-credentials";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: () => [{ status: "idle", message: "", credentialId: "" }, vi.fn(), false]
  };
});

function buildCredential(overrides: Partial<CredentialItem> = {}): CredentialItem {
  return {
    id: "cred-1",
    name: "OpenAI Key",
    credential_type: "api_key",
    description: "Runtime credential",
    status: "active",
    sensitivity_level: "L2",
    sensitive_resource_id: "resource-1",
    last_used_at: "2026-03-24T18:00:00Z",
    revoked_at: null,
    created_at: "2026-03-24T17:00:00Z",
    updated_at: "2026-03-24T17:30:00Z",
    ...overrides
  };
}

function buildAudit(overrides: Partial<CredentialAuditItem> = {}): CredentialAuditItem {
  return {
    id: "audit-1",
    credential_id: "cred-1",
    credential_name: "OpenAI Key",
    credential_type: "api_key",
    action: "decrypted",
    actor_type: "tool",
    actor_id: "search-tool",
    run_id: "run-1",
    node_run_id: "node-1",
    summary: "tool:search-tool 在运行时解密了字段 api_key。",
    metadata: { field_names: ["api_key"] },
    created_at: "2026-03-24T18:05:00Z",
    ...overrides
  };
}

describe("CredentialStorePanel", () => {
  it("renders recent credential audit activity under the store table", () => {
    const html = renderToStaticMarkup(
      createElement(CredentialStorePanel, {
        credentials: [buildCredential()],
        activity: [buildAudit()]
      })
    );

    expect(html).toContain("最近审计活动");
    expect(html).toContain("L2 治理");
    expect(html).toContain("tool:search-tool 在运行时解密了字段 api_key。");
    expect(html).toContain("run run-1");
    expect(html).toContain("解密");
  });
});
