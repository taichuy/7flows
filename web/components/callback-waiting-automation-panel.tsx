import React from "react";
import Link from "next/link";

import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import type {
  CallbackWaitingAutomationCheck,
  RecentRunEventCheck
} from "@/lib/get-system-overview";
import {
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorRecommendedNextStep
} from "@/lib/operator-follow-up-presenters";
import { formatTimestamp } from "@/lib/runtime-presenters";
import {
  buildCallbackWaitingAutomationFollowUpCandidate,
  buildCallbackWaitingAutomationSystemFollowUp
} from "@/lib/system-overview-follow-up-presenters";

type CallbackWaitingAutomationPanelProps = {
  automation: CallbackWaitingAutomationCheck;
  recentEvents?: RecentRunEventCheck[];
};

const statusLabelMap: Record<string, string> = {
  configured: "configured",
  partial: "partial",
  disabled: "disabled"
};

const statusClassMap: Record<string, string> = {
  configured: "healthy",
  partial: "degraded",
  disabled: "failed"
};

const schedulerHealthLabelMap: Record<string, string> = {
  healthy: "healthy",
  degraded: "degraded",
  failed: "failed",
  disabled: "disabled",
  unknown: "unknown"
};

const stepHealthClassMap: Record<string, string> = {
  healthy: "healthy",
  running: "degraded",
  stale: "degraded",
  failed: "failed",
  disabled: "muted",
  unknown: "muted"
};

export function CallbackWaitingAutomationPanel({
  automation,
  recentEvents = []
}: CallbackWaitingAutomationPanelProps) {
  const enabledSteps = automation.steps.filter((step) => step.enabled);
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const followUpSurface = buildCallbackWaitingAutomationSystemFollowUp(automation, {
    recentEvents
  });
  const recommendedNextStep = buildOperatorRecommendedNextStep({
    callback: buildCallbackWaitingAutomationFollowUpCandidate(
      automation,
      "callback recovery"
    )
  });

  return (
    <article className="diagnostic-panel panel-span">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Callback waiting</p>
          <h2>Background recovery automation</h2>
        </div>
        <p className="section-copy">
          把 `WAITING_CALLBACK` 的后台补偿配置直接暴露给 operator，避免链路已经落地，
          但首页仍看不出 stale ticket cleanup 和 due resume monitor 是否真的打开。
        </p>
      </div>

      <div className="summary-strip">
        <article className="summary-card">
          <span>Automation status</span>
          <strong>{statusLabelMap[automation.status] ?? automation.status}</strong>
        </article>
        <article className="summary-card">
          <span>Enabled steps</span>
          <strong>{enabledSteps.length} / {automation.steps.length}</strong>
        </article>
        <article className="summary-card">
          <span>Scheduler health</span>
          <strong>
            {schedulerHealthLabelMap[automation.scheduler_health_status] ??
              automation.scheduler_health_status}
          </strong>
        </article>
        <article className="summary-card">
          <span>Scheduler required</span>
          <strong>{automation.scheduler_required ? "yes" : "no"}</strong>
        </article>
      </div>

      {recommendedNextStep ? (
        <div>
          <OperatorRecommendedNextStepCard
            recommendedNextStep={recommendedNextStep}
            surfaceCopy={operatorSurfaceCopy}
          />
          {followUpSurface?.traceLink ? (
            <div className="event-type-strip">
              <Link className="event-chip inbox-filter-link" href={followUpSurface.traceLink.href}>
                {followUpSurface.traceLink.label}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="activity-list">
        {automation.steps.map((step) => (
          <article className="activity-row" key={step.key}>
            <div className="activity-header">
              <div>
                <h3>{step.label}</h3>
                <p>
                  {step.task} · source {step.source}
                  {typeof step.interval_seconds === "number"
                    ? ` · every ${step.interval_seconds}s`
                    : " · no active schedule"}
                </p>
              </div>
              <span
                className={`health-pill ${stepHealthClassMap[step.scheduler_health.health_status] ?? (step.enabled ? "healthy" : "failed")}`}
              >
                {step.enabled
                  ? step.scheduler_health.health_status
                  : "disabled"}
              </span>
            </div>
            <p className="activity-copy">{step.detail}</p>
            <p className="activity-copy">
              {step.scheduler_health.detail}
              {step.scheduler_health.last_finished_at
                ? ` 最近完成于 ${formatTimestamp(step.scheduler_health.last_finished_at)}。`
                : step.scheduler_health.last_started_at
                  ? ` 最近启动于 ${formatTimestamp(step.scheduler_health.last_started_at)}。`
                  : ""}
            </p>
            {step.enabled ? (
              <p className="activity-copy">
                latest status {step.scheduler_health.last_status ?? "N/A"} · matched {step.scheduler_health.matched_count} · affected {step.scheduler_health.affected_count}
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <div className="event-type-strip">
        <span className={`event-chip ${statusClassMap[automation.status] ?? ""}`}>
          {statusLabelMap[automation.status] ?? automation.status}
        </span>
        <span
          className={`event-chip ${stepHealthClassMap[automation.scheduler_health_status] ?? ""}`}
        >
          scheduler {schedulerHealthLabelMap[automation.scheduler_health_status] ?? automation.scheduler_health_status}
        </span>
        {automation.scheduler_required ? (
          <span className="event-chip">needs separate scheduler</span>
        ) : null}
      </div>

      <p className="section-copy compact">{automation.detail}</p>
      <p className="section-copy compact">{automation.scheduler_health_detail}</p>
    </article>
  );
}
