import { describe, expect, it } from "vitest";

import { buildLegacyPublishAuthGovernanceSurfaceCopy } from "@/lib/legacy-publish-auth-governance-presenters";

describe("legacy publish auth governance presenters", () => {
  it("keeps the cross-entry legacy auth handoff copy on a shared contract", () => {
    expect(buildLegacyPublishAuthGovernanceSurfaceCopy()).toEqual({
      title: "Legacy publish auth handoff",
      description:
        "publish activity export、run diagnostics 和 invocation detail 现在共享同一份 workflow 级 legacy publish auth artifact，避免 operator 在 audit 入口重新拼 draft cleanup / published blocker checklist。",
      workflowFollowUpTitle: "Workflow follow-up",
      workflowFollowUpFallback:
        "回到 workflow detail 继续处理 draft cleanup / published blocker；当前 publish audit detail 与 export 现在共享同一份 workflow handoff。"
    });
  });
});
