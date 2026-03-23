import React from "react";
import Link from "next/link";

import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import {
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorRecommendedNextStep
} from "@/lib/operator-follow-up-presenters";
import {
  formatSandboxReadinessDetail,
  formatSandboxReadinessHeadline,
  listSandboxAvailableClasses,
  listSandboxBlockedClasses,
  listSandboxReadinessCapabilityChips
} from "@/lib/sandbox-readiness-presenters";
import { buildSandboxReadinessFollowUpCandidate } from "@/lib/system-overview-follow-up-presenters";

type SandboxReadinessOverviewCardProps = {
  readiness?: SandboxReadinessCheck | null;
  title?: string;
  intro?: string | null;
  currentHref?: string | null;
  hideWhenHealthy?: boolean;
  hideRecommendedNextStep?: boolean;
};

export function SandboxReadinessOverviewCard({
  readiness,
  title = "Live sandbox readiness",
  intro = null,
  currentHref = null,
  hideWhenHealthy = false,
  hideRecommendedNextStep = false
}: SandboxReadinessOverviewCardProps) {
  if (!readiness) {
    return null;
  }

  const availableClasses = listSandboxAvailableClasses(readiness);
  const blockedEntries = listSandboxBlockedClasses(readiness);
  const blockedClasses = blockedEntries.map((entry) => entry.execution_class);
  const hasOperationalRisk =
    blockedClasses.length > 0 ||
    readiness.offline_backend_count > 0 ||
    readiness.degraded_backend_count > 0;

  if (hideWhenHealthy && !hasOperationalRisk) {
    return null;
  }

  const chips = Array.from(
    new Set([
      ...availableClasses.map((executionClass) => `ready ${executionClass}`),
      ...blockedClasses.map((executionClass) => `blocked ${executionClass}`),
      ...listSandboxReadinessCapabilityChips(readiness)
    ])
  );
  const toneClass =
    blockedClasses.length > 0
      ? "trace-export-blocked"
      : hasOperationalRisk
        ? "pending"
        : "healthy";
  const statusLabel =
    blockedClasses.length > 0 ? "blocked" : hasOperationalRisk ? "degraded" : "ready";
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const recommendedNextStep = buildOperatorRecommendedNextStep({
    execution: buildSandboxReadinessFollowUpCandidate(readiness, "sandbox readiness"),
    currentHref
  });

  return (
    <article className="payload-card compact-card">
      <div className="payload-card-header">
        <span className="status-meta">{title}</span>
        <span className={`event-chip ${toneClass}`}>{statusLabel}</span>
      </div>
      {intro ? <p className="section-copy entry-copy">{intro}</p> : null}
      <p className="binding-meta">{formatSandboxReadinessHeadline(readiness)}</p>
      {formatSandboxReadinessDetail(readiness) ? (
        <p className="section-copy entry-copy">{formatSandboxReadinessDetail(readiness)}</p>
      ) : null}
      {!hideRecommendedNextStep && recommendedNextStep ? (
        <div className="entry-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{operatorSurfaceCopy.recommendedNextStepTitle}</span>
            <span className="event-chip">{recommendedNextStep.label}</span>
            {recommendedNextStep.href && recommendedNextStep.href_label ? (
              <Link className="event-chip inbox-filter-link" href={recommendedNextStep.href}>
                {recommendedNextStep.href_label}
              </Link>
            ) : null}
          </div>
          <p className="section-copy entry-copy">{recommendedNextStep.detail}</p>
        </div>
      ) : null}
      {chips.length > 0 ? (
        <div className="tool-badge-row">
          {chips.map((chip) => (
            <span className="event-chip" key={`${title}-${chip}`}>
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
