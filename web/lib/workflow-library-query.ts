import type { WorkflowListItem } from "@/lib/get-workflows";
import {
  hasWorkflowLegacyPublishAuthIssues,
  hasWorkflowMissingToolIssues
} from "@/lib/workflow-definition-governance";

const workflowListDefinitionIssueFilters = ["legacy_publish_auth", "missing_tool"] as const;

export type WorkflowListDefinitionIssueFilter =
  (typeof workflowListDefinitionIssueFilters)[number];

export type WorkflowLibraryViewState = {
  definitionIssue: WorkflowListDefinitionIssueFilter | null;
};

function readFirstQueryValue(
  searchParams: Record<string, string | string[] | undefined> | URLSearchParams,
  key: string
) {
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key);
  }

  const value = searchParams[key];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function isWorkflowListDefinitionIssueFilter(
  value: string | null | undefined
): value is WorkflowListDefinitionIssueFilter {
  return workflowListDefinitionIssueFilters.includes(
    value as WorkflowListDefinitionIssueFilter
  );
}

export function readWorkflowLibraryViewState(
  searchParams: Record<string, string | string[] | undefined> | URLSearchParams
): WorkflowLibraryViewState {
  const rawDefinitionIssue = readFirstQueryValue(searchParams, "definition_issue")?.trim();

  return {
    definitionIssue: isWorkflowListDefinitionIssueFilter(rawDefinitionIssue)
      ? rawDefinitionIssue
      : null
  };
}

export function buildWorkflowLibrarySearchParams(
  viewState: WorkflowLibraryViewState
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (viewState.definitionIssue) {
    searchParams.set("definition_issue", viewState.definitionIssue);
  }

  return searchParams;
}

export function appendWorkflowLibraryViewState(
  href: string,
  viewState: WorkflowLibraryViewState
): string {
  const [pathname, query = ""] = href.split("?");
  const searchParams = new URLSearchParams(query);

  searchParams.delete("definition_issue");

  const workflowLibrarySearchParams = buildWorkflowLibrarySearchParams(viewState);
  workflowLibrarySearchParams.forEach((value, key) => {
    searchParams.set(key, value);
  });

  const normalizedQuery = searchParams.toString();
  return normalizedQuery ? `${pathname}?${normalizedQuery}` : pathname;
}

export function resolveWorkflowLibraryViewStateForWorkflow(
  workflow: Pick<WorkflowListItem, "tool_governance" | "definition_issues" | "legacy_auth_governance">,
  viewState: WorkflowLibraryViewState
): WorkflowLibraryViewState {
  if (viewState.definitionIssue) {
    return viewState;
  }

  return {
    ...viewState,
    definitionIssue: hasWorkflowLegacyPublishAuthIssues(workflow)
      ? "legacy_publish_auth"
      : hasWorkflowMissingToolIssues(workflow)
        ? "missing_tool"
        : null
  };
}

export function appendWorkflowLibraryViewStateForWorkflow(
  href: string,
  workflow: Pick<WorkflowListItem, "tool_governance" | "definition_issues" | "legacy_auth_governance">,
  viewState: WorkflowLibraryViewState
): string {
  return appendWorkflowLibraryViewState(
    href,
    resolveWorkflowLibraryViewStateForWorkflow(workflow, viewState)
  );
}
