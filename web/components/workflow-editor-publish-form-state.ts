import { useCallback, useMemo, useState } from "react";

import {
  buildWorkflowValidationNavigatorItems,
  type WorkflowValidationNavigatorItem
} from "@/lib/workflow-validation-navigation";
import { validateContractSchema } from "@/lib/workflow-contract-schema-validation";
import { pickWorkflowValidationRemediationItem } from "@/lib/workflow-validation-remediation";
import type { WorkflowPersistBlocker } from "@/components/workflow-editor-workbench/persist-blockers";
import { summarizeWorkflowPersistBlockers } from "@/components/workflow-editor-workbench/persist-blockers";

import {
  buildPublishedEndpointValidationIssues,
  type WorkflowEditorPublishValidationIssue
} from "./workflow-editor-publish-form-validation";
import {
  cloneRecord,
  createPublishedEndpointDraft,
  createUniqueEndpointId,
  isRecord,
  normalizePublishedEndpoint
} from "./workflow-editor-publish-form-shared";
import {
  buildWorkflowEditorPublishLegacyAuthValidationItem,
  groupWorkflowEditorPublishValidationIssuesByEndpoint,
  matchesWorkflowEditorPublishValidationIssue,
  type FocusedPublishValidationItem
} from "./workflow-editor-publish-validation-shared";

type WorkflowEditorPublishFormChangeHandler = (
  nextPublish: Array<Record<string, unknown>>,
  options?: { successMessage?: string }
) => void;

type UseWorkflowEditorPublishDraftStateOptions = {
  availableWorkflowVersions: string[];
  publishEndpoints: Array<Record<string, unknown>>;
  onChange: WorkflowEditorPublishFormChangeHandler;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  persistBlockers?: WorkflowPersistBlocker[];
};

export function useWorkflowEditorPublishDraftState({
  availableWorkflowVersions,
  publishEndpoints,
  onChange,
  focusedValidationItem = null,
  persistBlockers = []
}: UseWorkflowEditorPublishDraftStateOptions) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const normalizedEndpoints = useMemo(
    () => publishEndpoints.map((endpoint, index) => normalizePublishedEndpoint(endpoint, index)),
    [publishEndpoints]
  );
  const validationIssues = useMemo(
    () =>
      buildPublishedEndpointValidationIssues(normalizedEndpoints, {
        allowedWorkflowVersions: availableWorkflowVersions
      }),
    [availableWorkflowVersions, normalizedEndpoints]
  );
  const publishLegacyAuthValidationIssues = useMemo(
    () =>
      validationIssues.filter(
        (issue) => issue.category === "publish_draft" && issue.field === "authMode"
      ),
    [validationIssues]
  );
  const genericValidationIssues = useMemo(
    () => validationIssues.filter((issue) => !publishLegacyAuthValidationIssues.includes(issue)),
    [publishLegacyAuthValidationIssues, validationIssues]
  );
  const genericValidationNavigatorItems = useMemo(
    () =>
      buildWorkflowValidationNavigatorItems({ publish: normalizedEndpoints }, genericValidationIssues),
    [genericValidationIssues, normalizedEndpoints]
  );
  const genericValidationRemediationItem = useMemo(
    () => pickWorkflowValidationRemediationItem(genericValidationNavigatorItems),
    [genericValidationNavigatorItems]
  );
  const remainingGenericValidationIssues = useMemo(
    () =>
      genericValidationIssues.filter(
        (issue) =>
          !matchesWorkflowEditorPublishValidationIssue(issue, genericValidationRemediationItem)
      ),
    [genericValidationIssues, genericValidationRemediationItem]
  );
  const validationIssuesByEndpoint = useMemo(
    () => groupWorkflowEditorPublishValidationIssuesByEndpoint(validationIssues),
    [validationIssues]
  );
  const publishLegacyAuthValidationItem = useMemo(
    () =>
      buildWorkflowEditorPublishLegacyAuthValidationItem(
        normalizedEndpoints,
        publishLegacyAuthValidationIssues
      ),
    [normalizedEndpoints, publishLegacyAuthValidationIssues]
  );
  const publishPersistBlockers = useMemo(
    () => persistBlockers.filter((blocker) => blocker.id === "publish_draft"),
    [persistBlockers]
  );
  const publishPersistBlockerSummary = useMemo(
    () => summarizeWorkflowPersistBlockers(publishPersistBlockers),
    [publishPersistBlockers]
  );
  const focusedPublishValidationItem =
    focusedValidationItem?.target.scope === "publish"
      ? (focusedValidationItem as FocusedPublishValidationItem)
      : null;
  const focusedPublishEndpointExists =
    focusedPublishValidationItem !== null &&
    focusedPublishValidationItem.target.endpointIndex >= 0 &&
    focusedPublishValidationItem.target.endpointIndex < normalizedEndpoints.length;

  const commit = useCallback(
    (
      nextPublish: Array<Record<string, unknown>>,
      options?: { successMessage?: string }
    ) => {
      setFeedback(null);
      onChange(nextPublish, options);
    },
    [onChange]
  );

  const updateEndpoint = useCallback(
    (
      index: number,
      updater: (current: Record<string, unknown>) => Record<string, unknown>
    ) => {
      commit(
        publishEndpoints.map((endpoint, endpointIndex) =>
          endpointIndex === index ? updater(cloneRecord(endpoint)) : cloneRecord(endpoint)
        )
      );
    },
    [commit, publishEndpoints]
  );

  const handleAddEndpoint = useCallback(() => {
    const nextId = createUniqueEndpointId(normalizedEndpoints.map((endpoint) => endpoint.id));
    const nextEndpoint = createPublishedEndpointDraft(nextId, normalizedEndpoints.length);

    commit([...publishEndpoints.map(cloneRecord), nextEndpoint], {
      successMessage: `已新增 publish endpoint ${nextId}。`
    });
  }, [commit, normalizedEndpoints, publishEndpoints]);

  const handleDeleteEndpoint = useCallback(
    (index: number) => {
      const endpoint = normalizedEndpoints[index];
      commit(
        publishEndpoints
          .filter((_, endpointIndex) => endpointIndex !== index)
          .map(cloneRecord),
        {
          successMessage: `已移除 publish endpoint ${endpoint?.id ?? index + 1}。`
        }
      );
    },
    [commit, normalizedEndpoints, publishEndpoints]
  );

  const applySchemaField = useCallback(
    (endpointIndex: number, field: "inputSchema" | "outputSchema", value: string) => {
      const normalized = value.trim();

      if (!normalized) {
        updateEndpoint(endpointIndex, (endpoint) => {
          if (field === "inputSchema") {
            endpoint.inputSchema = {};
          } else {
            delete endpoint.outputSchema;
          }
          return endpoint;
        });
        return;
      }

      try {
        const parsed = JSON.parse(normalized) as unknown;
        if (!isRecord(parsed)) {
          throw new Error(`${field} 必须是 JSON 对象。`);
        }

        const endpoint = normalizedEndpoints[endpointIndex];
        const endpointId = endpoint?.id ?? `endpoint_${endpointIndex + 1}`;
        validateContractSchema(parsed, {
          errorPrefix: `Published endpoint '${endpointId}' ${field}`
        });

        updateEndpoint(endpointIndex, (current) => {
          current[field] = parsed;
          return current;
        });
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : `${field} 不是合法 JSON。`);
      }
    },
    [normalizedEndpoints, updateEndpoint]
  );

  return {
    feedback,
    normalizedEndpoints,
    genericValidationIssues,
    genericValidationRemediationItem,
    remainingGenericValidationIssues,
    validationIssuesByEndpoint,
    publishLegacyAuthValidationItem,
    publishPersistBlockers,
    publishPersistBlockerSummary,
    focusedPublishValidationItem,
    focusedPublishEndpointExists,
    updateEndpoint,
    handleAddEndpoint,
    handleDeleteEndpoint,
    applySchemaField
  };
}

export type WorkflowEditorPublishDraftState = ReturnType<
  typeof useWorkflowEditorPublishDraftState
>;

export type WorkflowEditorPublishDraftValidationIssue = WorkflowEditorPublishValidationIssue;
