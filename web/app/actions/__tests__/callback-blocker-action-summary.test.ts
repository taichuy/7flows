import { describe, expect, it } from "vitest";

import { buildActionCallbackBlockerDeltaSummary } from "../callback-blocker-action-summary";
import { buildSensitiveAccessResourceFixture } from "@/lib/workbench-page-test-fixtures";

describe("callback blocker action summary", () => {
  it("把后端 primary governed resource 拼进 action blocker delta 摘要", () => {
    const summary = buildActionCallbackBlockerDeltaSummary({
      backendSummary: "阻塞变化：当前仍是 approval pending。",
      backendPrimaryResource: buildSensitiveAccessResourceFixture({
        label: "Anthropic Prod Key",
        sensitivity_level: "L3",
        source: "credential",
        credential_governance: {
          credential_id: "cred-anthropic-prod",
          credential_name: "Anthropic Prod Key",
          credential_type: "api_key",
          sensitivity_level: "L3",
          credential_status: "active",
          sensitive_resource_id: "resource-1",
          sensitive_resource_label: "Anthropic Prod Key",
          credential_ref: "credential://anthropic_api_key",
          summary: "当前命中的凭据是 Anthropic Prod Key。"
        }
      }),
      before: null,
      after: null
    });

    expect(summary).toBe(
      "阻塞变化：当前仍是 approval pending。 当前最该追踪的治理资源：Anthropic Prod Key · L3 治理 · 生效中。"
    );
  });
});
