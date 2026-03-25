import {
  buildLegacyPublishAuthModeFollowUp,
  DEFAULT_LEGACY_PUBLISH_AUTH_MODE_CONTRACT
} from "@/lib/legacy-publish-auth-contract";
import type {
  WorkflowPublishedEndpointIssue,
  WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem,
  WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem,
  WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot,
  WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem,
  WorkflowPublishedEndpointLegacyAuthModeContract,
} from "@/lib/workflow-publish-types";

type LegacyAuthModeContractOverrides = Partial<WorkflowPublishedEndpointLegacyAuthModeContract>;

type LegacyAuthIssueOverrides = Omit<Partial<WorkflowPublishedEndpointIssue>, "auth_mode_contract"> & {
  auth_mode_contract?: LegacyAuthModeContractOverrides | null;
};

type LegacyAuthGovernanceChecklistOverrides =
  Partial<WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem>;

type LegacyAuthGovernanceDraftCleanupChecklistOverrides =
  LegacyAuthGovernanceChecklistOverrides & {
    workflow_name?: string;
  };

type LegacyAuthGovernancePublishedFollowUpChecklistOverrides =
  LegacyAuthGovernanceChecklistOverrides & {
    workflow_name?: string;
    auth_mode_contract?: LegacyAuthModeContractOverrides | null;
  };

type LegacyAuthGovernanceSinglePublishedBlockerSnapshotOverrides = {
  generated_at?: string;
  auth_mode_contract?: LegacyAuthModeContractOverrides | null;
  binding?: Partial<WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem>;
};

export function buildLegacyPublishAuthModeContractFixture(
  overrides: LegacyAuthModeContractOverrides = {}
): WorkflowPublishedEndpointLegacyAuthModeContract {
  return {
    supported_auth_modes: overrides.supported_auth_modes
      ? [...overrides.supported_auth_modes]
      : [...DEFAULT_LEGACY_PUBLISH_AUTH_MODE_CONTRACT.supported_auth_modes],
    retired_legacy_auth_modes: overrides.retired_legacy_auth_modes
      ? [...overrides.retired_legacy_auth_modes]
      : [...DEFAULT_LEGACY_PUBLISH_AUTH_MODE_CONTRACT.retired_legacy_auth_modes],
    summary: overrides.summary ?? DEFAULT_LEGACY_PUBLISH_AUTH_MODE_CONTRACT.summary,
    follow_up: overrides.follow_up ?? DEFAULT_LEGACY_PUBLISH_AUTH_MODE_CONTRACT.follow_up,
  };
}

export function buildLegacyPublishUnsupportedAuthIssueFixture(
  overrides: LegacyAuthIssueOverrides = {}
): WorkflowPublishedEndpointIssue {
  const { auth_mode_contract: authModeContractOverride, ...restOverrides } = overrides;
  const authModeContract =
    authModeContractOverride === null
      ? null
      : buildLegacyPublishAuthModeContractFixture(authModeContractOverride ?? undefined);

  return {
    category: "unsupported_auth_mode",
    message: "Legacy token auth is still persisted on this binding.",
    field: "auth_mode",
    remediation: "Switch back to api_key or internal before publishing.",
    blocks_lifecycle_publish: true,
    ...restOverrides,
    auth_mode_contract: authModeContract,
  };
}

export function buildLegacyAuthGovernanceBindingFixture(
  overrides: Partial<WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem> = {}
): WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem {
  return {
    workflow_id: "workflow-legacy-auth",
    workflow_name: "Legacy Auth workflow",
    binding_id: "binding-live",
    endpoint_id: "native-chat",
    endpoint_name: "Native Chat",
    workflow_version: "1.0.0",
    lifecycle_status: "published",
    auth_mode: "token",
    ...overrides,
  };
}

export function buildLegacyAuthGovernanceWorkflowFixture(
  overrides: Partial<WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem> = {}
): WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem {
  return {
    workflow_id: "workflow-legacy-auth",
    workflow_name: "Legacy Auth workflow",
    binding_count: 1,
    draft_candidate_count: 0,
    published_blocker_count: 1,
    offline_inventory_count: 0,
    tool_governance: {
      referenced_tool_ids: [],
      missing_tool_ids: [],
      governed_tool_count: 0,
      strong_isolation_tool_count: 0
    },
    ...overrides,
  };
}

export function buildLegacyAuthGovernanceDraftCleanupChecklistFixture(
  overrides: LegacyAuthGovernanceDraftCleanupChecklistOverrides = {}
): WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem {
  const { workflow_name = "Legacy Auth workflow", count = 1, detail, ...restOverrides } = overrides;

  return {
    key: "draft_cleanup",
    title: "先批量下线 draft legacy bindings",
    tone: "ready",
    tone_label: "可立即执行",
    count,
    detail:
      detail ??
      `先对 ${workflow_name} 里的 ${count} 条 draft legacy binding 执行批量 cleanup；这一步不会动到仍在 live 的 published endpoint。`,
    ...restOverrides,
  };
}

export function buildLegacyAuthGovernancePublishedFollowUpChecklistFixture(
  overrides: LegacyAuthGovernancePublishedFollowUpChecklistOverrides = {}
): WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem {
  const {
    workflow_name = "Legacy Auth workflow",
    count = 1,
    detail,
    auth_mode_contract: authModeContractOverride,
    ...restOverrides
  } = overrides;
  const authModeContract = buildLegacyPublishAuthModeContractFixture(
    authModeContractOverride ?? undefined
  );

  return {
    key: "published_follow_up",
    title: "再补发支持鉴权的 replacement bindings",
    tone: "manual",
    tone_label: "人工跟进",
    count,
    detail:
      detail ??
      `对 ${workflow_name} 这类仍在 live 的 legacy binding，${buildLegacyPublishAuthModeFollowUp(authModeContract)}`,
    ...restOverrides,
  };
}

export function buildLegacyAuthGovernanceSnapshotFixture(
  overrides: Partial<WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot> = {}
): WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot {
  const { auth_mode_contract: authModeContractOverride, ...restOverrides } = overrides;

  return {
    generated_at: "2026-03-24T08:00:00Z",
    workflow_count: 0,
    binding_count: 0,
    summary: {
      draft_candidate_count: 0,
      published_blocker_count: 0,
      offline_inventory_count: 0,
    },
    checklist: [],
    workflows: [],
    buckets: {
      draft_candidates: [],
      published_blockers: [],
      offline_inventory: [],
    },
    ...restOverrides,
    auth_mode_contract: authModeContractOverride
      ? buildLegacyPublishAuthModeContractFixture(authModeContractOverride)
      : buildLegacyPublishAuthModeContractFixture(),
  };
}

export function buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture(
  overrides: LegacyAuthGovernanceSinglePublishedBlockerSnapshotOverrides = {}
): WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot {
  const {
    generated_at = "2026-03-24T08:49:00Z",
    auth_mode_contract: authModeContractOverride,
    binding: bindingOverrides,
  } = overrides;
  const binding = buildLegacyAuthGovernanceBindingFixture(bindingOverrides ?? {});
  const workflow = buildLegacyAuthGovernanceWorkflowFixture({
    workflow_id: binding.workflow_id,
    workflow_name: binding.workflow_name,
  });

  return buildLegacyAuthGovernanceSnapshotFixture({
    generated_at,
    workflow_count: 1,
    binding_count: 1,
    summary: {
      draft_candidate_count: 0,
      published_blocker_count: 1,
      offline_inventory_count: 0,
    },
    checklist: [
      buildLegacyAuthGovernancePublishedFollowUpChecklistFixture({
        workflow_name: workflow.workflow_name,
        auth_mode_contract: authModeContractOverride ?? undefined,
      }),
    ],
    workflows: [workflow],
    buckets: {
      draft_candidates: [],
      published_blockers: [binding],
      offline_inventory: [],
    },
    auth_mode_contract: authModeContractOverride
      ? buildLegacyPublishAuthModeContractFixture(authModeContractOverride)
      : undefined,
  });
}
