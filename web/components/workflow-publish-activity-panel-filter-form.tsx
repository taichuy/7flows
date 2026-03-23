import React from "react";

import type { PublishedEndpointApiKeyItem } from "@/lib/get-workflow-publish";
import {
  PUBLISHED_INVOCATION_CACHE_STATUSES,
  PUBLISHED_INVOCATION_REASON_CODES,
  PUBLISHED_INVOCATION_REQUEST_SURFACES,
  formatPublishedInvocationCacheStatusLabel,
  formatPublishedInvocationReasonLabel,
  formatPublishedInvocationSurfaceLabel,
  formatPublishedRunStatusLabel
} from "@/lib/published-invocation-presenters";
import {
  buildWorkflowPublishActivityHref,
  TIME_WINDOW_OPTIONS
} from "@/components/workflow-publish-activity-panel-helpers";
import type { WorkflowPublishActivityPanelProps } from "@/components/workflow-publish-activity-panel-helpers";
import type { WorkspaceStarterGovernanceQueryScope } from "@/lib/workspace-starter-governance-query";

type WorkflowPublishActivityFilterFormProps = {
  workflowId: string;
  bindingId: string;
  apiKeys: PublishedEndpointApiKeyItem[];
  activeInvocationFilter: WorkflowPublishActivityPanelProps["activeInvocationFilter"];
  runStatusOptions: string[];
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
};

export function WorkflowPublishActivityFilterForm({
  workflowId,
  bindingId,
  apiKeys,
  activeInvocationFilter,
  runStatusOptions,
  workspaceStarterGovernanceQueryScope = null
}: WorkflowPublishActivityFilterFormProps) {
  return (
    <form
      action={buildWorkflowPublishActivityHref({
        workflowId,
        workspaceStarterGovernanceQueryScope
      })}
      className="trace-filter-form governance-filter-form"
      method="get"
    >
      <input type="hidden" name="publish_binding" value={bindingId} />

      <label className="binding-field">
        <span className="binding-label">Status</span>
        <select className="binding-select" name="publish_status" defaultValue={activeInvocationFilter?.status ?? ""}>
          <option value="">全部状态</option>
          <option value="succeeded">succeeded</option>
          <option value="failed">failed</option>
          <option value="rejected">rejected</option>
        </select>
      </label>

      <label className="binding-field">
        <span className="binding-label">Request source</span>
        <select
          className="binding-select"
          name="publish_request_source"
          defaultValue={activeInvocationFilter?.requestSource ?? ""}
        >
          <option value="">全部入口</option>
          <option value="workflow">workflow</option>
          <option value="alias">alias</option>
          <option value="path">path</option>
        </select>
      </label>

      <label className="binding-field">
        <span className="binding-label">Request surface</span>
        <select
          className="binding-select"
          name="publish_request_surface"
          defaultValue={activeInvocationFilter?.requestSurface ?? ""}
        >
          <option value="">全部协议面</option>
          {PUBLISHED_INVOCATION_REQUEST_SURFACES.map((requestSurface) => (
            <option key={requestSurface} value={requestSurface}>
              {formatPublishedInvocationSurfaceLabel(requestSurface)}
            </option>
          ))}
        </select>
      </label>

      <label className="binding-field">
        <span className="binding-label">Cache status</span>
        <select
          className="binding-select"
          name="publish_cache_status"
          defaultValue={activeInvocationFilter?.cacheStatus ?? ""}
        >
          <option value="">全部缓存状态</option>
          {PUBLISHED_INVOCATION_CACHE_STATUSES.map((cacheStatus) => (
            <option key={cacheStatus} value={cacheStatus}>
              {formatPublishedInvocationCacheStatusLabel(cacheStatus)}
            </option>
          ))}
        </select>
      </label>

      <label className="binding-field">
        <span className="binding-label">Run status</span>
        <select className="binding-select" name="publish_run_status" defaultValue={activeInvocationFilter?.runStatus ?? ""}>
          <option value="">全部运行态</option>
          {runStatusOptions.map((runStatus) => (
            <option key={runStatus} value={runStatus}>
              {formatPublishedRunStatusLabel(runStatus)}
            </option>
          ))}
        </select>
      </label>

      <label className="binding-field">
        <span className="binding-label">Reason code</span>
        <select
          className="binding-select"
          name="publish_reason_code"
          defaultValue={activeInvocationFilter?.reasonCode ?? ""}
        >
          <option value="">全部原因</option>
          {PUBLISHED_INVOCATION_REASON_CODES.map((reasonCode) => (
            <option key={reasonCode} value={reasonCode}>
              {formatPublishedInvocationReasonLabel(reasonCode)}
            </option>
          ))}
        </select>
      </label>

      <label className="binding-field">
        <span className="binding-label">API key</span>
        <select
          className="binding-select"
          name="publish_api_key_id"
          defaultValue={activeInvocationFilter?.apiKeyId ?? ""}
        >
          <option value="">全部 API key</option>
          {apiKeys.map((apiKey) => (
            <option key={apiKey.id} value={apiKey.id}>
              {apiKey.name ?? apiKey.key_prefix ?? apiKey.id}
            </option>
          ))}
        </select>
      </label>

      <label className="binding-field">
        <span className="binding-label">Time window</span>
        <select
          className="binding-select"
          name="publish_window"
          defaultValue={activeInvocationFilter?.timeWindow ?? "all"}
        >
          {TIME_WINDOW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="trace-filter-actions trace-field-span">
        <button className="ghost-button" type="submit">
          Apply filters
        </button>
        <a
          className="inline-link"
          href={buildWorkflowPublishActivityHref({
            workflowId,
            bindingId,
            workspaceStarterGovernanceQueryScope
          })}
        >
          Reset
        </a>
      </div>
    </form>
  );
}
