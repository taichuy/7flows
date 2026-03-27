import { describe, expect, it } from "vitest";

import { buildSensitiveAccessInboxEntryFixture } from "@/lib/workbench-page-test-fixtures";
import { buildSensitiveAccessInboxLegacyAuthGovernanceSnapshot } from "@/lib/sensitive-access-legacy-auth-governance";
import {
  buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture,
  buildLegacyPublishAuthModeContractFixture
} from "@/lib/workflow-publish-legacy-auth-test-fixtures";

describe("sensitive-access legacy auth governance", () => {
  it("keeps the shared publish auth contract when aggregating inbox entries", () => {
    const authModeContract = buildLegacyPublishAuthModeContractFixture({
      summary: "共享 summary 仍需保留 publish auth contract。",
      follow_up: "先切回 api_key/internal，再继续 replacement binding。"
    });

    const snapshot = buildSensitiveAccessInboxLegacyAuthGovernanceSnapshot([
      buildSensitiveAccessInboxEntryFixture({
        legacyAuthGovernance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
          auth_mode_contract: authModeContract,
          binding: {
            workflow_id: "workflow-1",
            workflow_name: "Workflow One",
            binding_id: "binding-1",
            endpoint_id: "endpoint-1",
            endpoint_name: "Endpoint One",
            workflow_version: "v1"
          }
        })
      }),
      buildSensitiveAccessInboxEntryFixture({
        legacyAuthGovernance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
          binding: {
            workflow_id: "workflow-2",
            workflow_name: "Workflow Two",
            binding_id: "binding-2",
            endpoint_id: "endpoint-2",
            endpoint_name: "Endpoint Two",
            workflow_version: "v2"
          }
        })
      })
    ]);

    expect(snapshot?.auth_mode_contract).toEqual(authModeContract);
    expect(snapshot?.workflow_count).toBe(2);
    expect(snapshot?.binding_count).toBe(2);
  });
});
