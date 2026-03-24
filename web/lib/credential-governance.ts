import type { SensitiveResourceItem } from "@/lib/get-sensitive-access";

export type CredentialGovernanceSummary = NonNullable<
  SensitiveResourceItem["credential_governance"]
>;

export function getCredentialGovernanceSummary(
  resource?: SensitiveResourceItem | null
): CredentialGovernanceSummary | null {
  return resource?.credential_governance ?? null;
}

export function formatCredentialGovernanceStatusLabel(
  status?: CredentialGovernanceSummary["credential_status"] | null
) {
  switch (status) {
    case "active":
      return "生效中";
    case "revoked":
      return "已吊销";
    default:
      return "状态未知";
  }
}

export function formatCredentialGovernanceLevelLabel(
  summary?: CredentialGovernanceSummary | null
) {
  return summary ? `${summary.sensitivity_level} 治理` : null;
}

export function formatCredentialGovernanceCompactSummary(
  summary?: CredentialGovernanceSummary | null
) {
  if (!summary) {
    return null;
  }

  return [
    summary.credential_name,
    formatCredentialGovernanceLevelLabel(summary),
    formatCredentialGovernanceStatusLabel(summary.credential_status)
  ].join(" · ");
}
