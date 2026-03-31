import {
  buildWorkflowValidationNavigatorItems,
  type WorkflowValidationNavigatorItem
} from "@/lib/workflow-validation-navigation";

import type { WorkflowPublishedEndpointDraft } from "./workflow-editor-publish-form-shared";
import type { WorkflowEditorPublishValidationIssue } from "./workflow-editor-publish-form-validation";

export type FocusedPublishValidationItem = WorkflowValidationNavigatorItem & {
  target: Extract<WorkflowValidationNavigatorItem["target"], { scope: "publish" }>;
};

export function buildWorkflowEditorPublishLegacyAuthValidationItem(
  endpoints: WorkflowPublishedEndpointDraft[],
  issues: WorkflowEditorPublishValidationIssue[]
) {
  return (
    buildWorkflowValidationNavigatorItems(
      { publish: endpoints },
      issues.map((issue) => ({
        category: issue.category,
        message: issue.message,
        path: issue.path,
        field: issue.field,
        hasLegacyPublishAuthModeIssues: true
      }))
    )[0] ?? null
  );
}

export function groupWorkflowEditorPublishValidationIssuesByEndpoint(
  issues: WorkflowEditorPublishValidationIssue[]
) {
  const issuesByEndpoint = new Map<string, WorkflowEditorPublishValidationIssue[]>();

  for (const issue of issues) {
    const nextIssues = issuesByEndpoint.get(issue.endpointKey) ?? [];
    nextIssues.push(issue);
    issuesByEndpoint.set(issue.endpointKey, nextIssues);
  }

  return issuesByEndpoint;
}

export function matchesWorkflowEditorPublishValidationIssue(
  issue: WorkflowEditorPublishValidationIssue,
  item: WorkflowValidationNavigatorItem | null
) {
  if (!item || item.target.scope !== "publish" || issue.category !== item.category) {
    return false;
  }

  const fieldPath = item.target.fieldPath?.trim();
  if (fieldPath) {
    return issue.path === `publish.${item.target.endpointIndex}.${fieldPath}`;
  }

  return issue.message === item.message;
}
