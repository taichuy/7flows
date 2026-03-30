import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LlmProviderCredentialManager } from "@/components/workflow-node-config-form/llm-provider-credential-manager";
import type { CredentialItem } from "@/lib/get-credentials";
import { getNativeLlmProviderPreset } from "@/lib/llm-provider-presets";

function buildCredential(overrides: Partial<CredentialItem> = {}): CredentialItem {
  return {
    id: "cred-openai-1",
    name: "OpenAI Prod",
    credential_type: "openai_api_key",
    description: "OpenAI runtime key",
    status: "active",
    sensitivity_level: "L2",
    sensitive_resource_id: "resource-1",
    last_used_at: "2026-03-30T12:00:00Z",
    revoked_at: null,
    created_at: "2026-03-30T10:00:00Z",
    updated_at: "2026-03-30T11:00:00Z",
    ...overrides
  };
}

describe("LlmProviderCredentialManager", () => {
  it("renders provider-specific credential CRUD surface", () => {
    const providerPreset = getNativeLlmProviderPreset("openai");

    if (!providerPreset) {
      throw new Error("expected openai preset");
    }

    const html = renderToStaticMarkup(
      createElement(LlmProviderCredentialManager, {
        providerPreset,
        credentials: [buildCredential()],
        selectedCredentialValue: "credential://cred-openai-1",
        onSelectCredential: () => undefined
      })
    );

    expect(html).toContain("OpenAI 凭证快捷管理");
    expect(html).toContain("新建凭证");
    expect(html).toContain("更新当前");
    expect(html).toContain("吊销当前");
    expect(html).toContain("credential://cred-openai-1");
  });
});
