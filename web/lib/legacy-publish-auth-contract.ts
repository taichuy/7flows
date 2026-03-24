import type { WorkflowPublishedEndpointLegacyAuthModeContract } from "@/lib/workflow-publish-types";

export const DEFAULT_LEGACY_PUBLISH_AUTH_MODE_CONTRACT: WorkflowPublishedEndpointLegacyAuthModeContract = {
  supported_auth_modes: ["api_key", "internal"],
  retired_legacy_auth_modes: ["token"],
  summary:
    "当前 publish gateway 只支持 durable authMode=api_key/internal；token 仅作为 legacy inventory 出现在治理 handoff 中。",
  follow_up:
    "先把 workflow draft endpoint 切回 api_key/internal 并保存，再补发 replacement binding，最后清理 draft/offline legacy backlog。"
};

export function resolveLegacyPublishAuthModeContract(
  contract?: WorkflowPublishedEndpointLegacyAuthModeContract | null
): WorkflowPublishedEndpointLegacyAuthModeContract {
  const supportedAuthModes = contract?.supported_auth_modes ?? [];
  const retiredLegacyAuthModes = contract?.retired_legacy_auth_modes ?? [];

  return {
    supported_auth_modes:
      supportedAuthModes.length > 0
        ? [...supportedAuthModes]
        : [...DEFAULT_LEGACY_PUBLISH_AUTH_MODE_CONTRACT.supported_auth_modes],
    retired_legacy_auth_modes:
      retiredLegacyAuthModes.length > 0
        ? [...retiredLegacyAuthModes]
        : [...DEFAULT_LEGACY_PUBLISH_AUTH_MODE_CONTRACT.retired_legacy_auth_modes],
    summary: contract?.summary?.trim() || DEFAULT_LEGACY_PUBLISH_AUTH_MODE_CONTRACT.summary,
    follow_up: contract?.follow_up?.trim() || DEFAULT_LEGACY_PUBLISH_AUTH_MODE_CONTRACT.follow_up
  };
}

export function formatLegacyPublishAuthModes(modes: string[]) {
  return modes.join(" / ");
}
