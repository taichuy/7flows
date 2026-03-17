import { WorkflowPublishActivityFilterForm } from "@/components/workflow-publish-activity-panel-filter-form";
import { WorkflowPublishExportActions } from "@/components/workflow-publish-export-actions";
import {
  buildActiveFilterChips,
  buildRunStatusOptions,
  type WorkflowPublishActivityPanelProps
} from "@/components/workflow-publish-activity-panel-helpers";
import {
  WorkflowPublishActivityDetails,
  WorkflowPublishActivityInsights
} from "@/components/workflow-publish-activity-panel-sections";

function buildInvocationDetailHref(
  workflowId: string,
  bindingId: string,
  activeInvocationFilter: WorkflowPublishActivityPanelProps["activeInvocationFilter"],
  invocationId?: string | null
) {
  const searchParams = new URLSearchParams();
  searchParams.set("publish_binding", bindingId);
  if (activeInvocationFilter?.status) {
    searchParams.set("publish_status", activeInvocationFilter.status);
  }
  if (activeInvocationFilter?.requestSource) {
    searchParams.set("publish_request_source", activeInvocationFilter.requestSource);
  }
  if (activeInvocationFilter?.requestSurface) {
    searchParams.set("publish_request_surface", activeInvocationFilter.requestSurface);
  }
  if (activeInvocationFilter?.cacheStatus) {
    searchParams.set("publish_cache_status", activeInvocationFilter.cacheStatus);
  }
  if (activeInvocationFilter?.runStatus) {
    searchParams.set("publish_run_status", activeInvocationFilter.runStatus);
  }
  if (activeInvocationFilter?.apiKeyId) {
    searchParams.set("publish_api_key_id", activeInvocationFilter.apiKeyId);
  }
  if (activeInvocationFilter?.reasonCode) {
    searchParams.set("publish_reason_code", activeInvocationFilter.reasonCode);
  }
  if (activeInvocationFilter?.timeWindow && activeInvocationFilter.timeWindow !== "all") {
    searchParams.set("publish_window", activeInvocationFilter.timeWindow);
  }
  if (invocationId) {
    searchParams.set("publish_invocation", invocationId);
  }
  return `/workflows/${encodeURIComponent(workflowId)}?${searchParams.toString()}`;
}

export function WorkflowPublishActivityPanel({
  workflowId,
  tools,
  binding,
  apiKeys,
  invocationAudit,
  selectedInvocationId,
  selectedInvocationDetail,
  selectedInvocationDetailHref,
  clearInvocationDetailHref,
  rateLimitWindowAudit,
  activeInvocationFilter
}: WorkflowPublishActivityPanelProps) {
  const activeFilterChips = buildActiveFilterChips(activeInvocationFilter, apiKeys);
  const runStatusOptions = buildRunStatusOptions(invocationAudit?.facets.run_status_counts);
  const clearHref =
    clearInvocationDetailHref ?? buildInvocationDetailHref(workflowId, binding.id, activeInvocationFilter);

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
        />
      </div>

      <WorkflowPublishActivityInsights
        binding={binding}
        invocationAudit={invocationAudit}
        rateLimitWindowAudit={rateLimitWindowAudit}
        activeTimeWindow={activeInvocationFilter?.timeWindow ?? null}
      />

      <WorkflowPublishActivityDetails
        tools={tools}
        invocationAudit={invocationAudit}
        selectedInvocationId={selectedInvocationId}
        selectedInvocationDetail={selectedInvocationDetail}
        buildInvocationDetailHref={(invocationId) =>
          selectedInvocationId === invocationId && selectedInvocationDetailHref
            ? selectedInvocationDetailHref
            : buildInvocationDetailHref(workflowId, binding.id, activeInvocationFilter, invocationId)
        }
        clearInvocationDetailHref={clearHref}
      />
    </div>
  );
}
