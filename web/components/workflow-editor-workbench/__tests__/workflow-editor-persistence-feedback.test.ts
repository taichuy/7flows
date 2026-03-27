import { describe, expect, it } from "vitest";

import { buildWorkflowPersistBlockedFeedbackMessage } from "@/components/workflow-editor-workbench/workflow-editor-persistence-feedback";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

describe("buildWorkflowPersistBlockedFeedbackMessage", () => {
  it("reuses the focused remediation title and suggestion when save is blocked", () => {
    const validationNavigatorItems: WorkflowValidationNavigatorItem[] = [
      {
        key: "publish-auth-mode",
        category: "publish_draft",
        message: "Public Search 当前不能使用 authMode = token。",
        hasLegacyPublishAuthModeIssues: true,
        target: {
          scope: "publish",
          endpointIndex: 0,
          fieldPath: "authMode",
          label: "Publish · Public Search"
        }
      }
    ];

    const message = buildWorkflowPersistBlockedFeedbackMessage({
      persistBlockerSummary: "当前保存会被 1 类问题阻断：Publish draft。",
      persistBlockedMessage: "blocked",
      validationNavigatorItems
    });

    expect(message).toContain("当前保存会被 1 类问题阻断：Publish draft。");
    expect(message).toContain("已定位到 Publish · Public Search · Auth mode。");
    expect(message).toContain("先把 workflow draft endpoint 切回 api_key/internal 并保存");
    expect(message).not.toContain("blocked");
  });

  it("falls back to summary-focused copy when no remediation item is available", () => {
    expect(
      buildWorkflowPersistBlockedFeedbackMessage({
        persistBlockerSummary: "当前保存会被 2 类问题阻断：Execution capability / Publish draft。",
        persistBlockedMessage: "blocked",
        validationNavigatorItems: []
      })
    ).toBe("当前保存会被 2 类问题阻断：Execution capability / Publish draft。 已定位到首个阻断点。");
  });

  it("falls back to the original blocked message when no summary exists", () => {
    expect(
      buildWorkflowPersistBlockedFeedbackMessage({
        persistBlockedMessage: "当前 workflow definition 无法保存。",
        validationNavigatorItems: []
      })
    ).toBe("当前 workflow definition 无法保存。");
  });
});
