import React from "react";

import { WorkflowPublishActivityFilterForm } from "@/components/workflow-publish-activity-panel-filter-form";
import { WorkflowPublishExportActions } from "@/components/workflow-publish-export-actions";
import {
  buildActiveFilterChips,
  buildRunStatusOptions,
  resolveWorkflowPublishActivityDetailLinks,
  type WorkflowPublishActivityPanelProps
} from "@/components/workflow-publish-activity-panel-helpers";
import {
  WorkflowPublishActivityDetails,
  WorkflowPublishActivityInsights
} from "@/components/workflow-publish-activity-panel-sections";

export function WorkflowPublishActivityPanel({
  workflowId,
  tools,
  binding,
  apiKeys,
  invocationAudit,
  selectedInvocationId,
  selectedInvocationDetail,
  rateLimitWindowAudit,
  activeInvocationFilter,
  callbackWaitingAutomation,
  sandboxReadiness,
  legacyAuthExportHint,
  workspaceStarterGovernanceQueryScope = null
}: WorkflowPublishActivityPanelProps) {
  const activeFilterChips = buildActiveFilterChips(activeInvocationFilter, apiKeys);
  const runStatusOptions = buildRunStatusOptions(invocationAudit?.facets.run_status_counts);
  const detailLinks = resolveWorkflowPublishActivityDetailLinks({
    workflowId,
    bindingId: binding.id,
    activeInvocationFilter,
    workspaceStarterGovernanceQueryScope
  });
  const selectedInvocationHref = selectedInvocationId
    ? detailLinks.buildInvocationDetailHref(selectedInvocationId)
    : null;

  return (
    <div className="entry-card compact-card">
      <p className="entry-card-title">Invocation governance</p>
      <p className="section-copy entry-copy">
        这里消费独立的 published invocation audit，用于回答“谁在调、有没有被限流、最近失败因为什么”。
      </p>

      <WorkflowPublishActivityFilterForm
        workflowId={workflowId}
        bindingId={binding.id}
        apiKeys={apiKeys}
        activeInvocationFilter={activeInvocationFilter}
        runStatusOptions={runStatusOptions}
        workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
      />

      {activeFilterChips.length ? (
        <div className="trace-active-filter-row">
          {activeFilterChips.map((chip) => (
            <span className="event-chip" key={chip}>
              {chip}
            </span>
          ))}
        </div>
      ) : null}

      <div className="trace-active-filter-row">
        <WorkflowPublishExportActions
          workflowId={workflowId}
          bindingId={binding.id}
          activeInvocationFilter={activeInvocationFilter}
          callbackWaitingAutomation={callbackWaitingAutomation}
          sandboxReadiness={sandboxReadiness}
        />
      </div>

      {legacyAuthExportHint ? (
        <p className="section-copy entry-copy trace-export-feedback">{legacyAuthExportHint}</p>
      ) : null}

      <WorkflowPublishActivityInsights
        binding={binding}
        invocationAudit={invocationAudit}
        rateLimitWindowAudit={rateLimitWindowAudit}
        selectedInvocationId={selectedInvocationId}
        selectedInvocationHref={selectedInvocationHref}
        selectedInvocationDetail={selectedInvocationDetail}
        callbackWaitingAutomation={callbackWaitingAutomation}
        sandboxReadiness={sandboxReadiness}
        activeTimeWindow={activeInvocationFilter?.timeWindow ?? null}
      />

      <WorkflowPublishActivityDetails
        tools={tools}
        invocationAudit={invocationAudit}
        selectedInvocationId={selectedInvocationId}
        selectedInvocationHref={selectedInvocationHref}
        selectedInvocationDetail={selectedInvocationDetail}
        callbackWaitingAutomation={callbackWaitingAutomation}
        sandboxReadiness={sandboxReadiness}
        buildInvocationDetailHref={detailLinks.buildInvocationDetailHref}
        clearInvocationDetailHref={detailLinks.clearInvocationDetailHref}
        workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
      />
    </div>
  );
}
