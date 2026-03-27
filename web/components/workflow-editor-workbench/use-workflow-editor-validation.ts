"use client";

import { useMemo } from "react";

import type { PluginAdapterRegistryItem, PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  SandboxBackendCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";
import type { WorkflowNodeCatalogItem } from "@/lib/get-workflow-library";
import type { WorkflowDefinitionPreflightIssue, WorkflowDetail } from "@/lib/get-workflows";
import type { WorkspaceStarterValidationIssue } from "@/lib/get-workspace-starters";
import {
  buildLegacyPublishAuthModeContractSummary,
} from "@/lib/legacy-publish-auth-contract";
import {
  formatToolReferenceIssueSummary,
  isLegacyPublishAuthModeIssue
} from "@/lib/workflow-definition-governance";
import { buildWorkflowDefinitionContractValidationIssues } from "@/lib/workflow-contract-schema-validation";
import { buildAllowedPublishWorkflowVersions } from "@/lib/workflow-publish-version-validation";
import {
  buildWorkflowNodeExecutionValidationIssues,
  buildWorkflowToolExecutionValidationIssues
} from "@/lib/workflow-tool-execution-validation";
import { buildWorkflowToolReferenceValidationIssues } from "@/lib/workflow-tool-reference-validation";
import {
  buildWorkflowValidationNavigatorItems,
  type WorkflowValidationNavigatorItem,
  type WorkflowValidationNavigatorIssue
} from "@/lib/workflow-validation-navigation";
import { buildWorkflowVariableValidationIssues } from "@/lib/workflow-variable-validation";
import {
  formatUnsupportedWorkflowNodes,
  summarizeUnsupportedWorkflowNodes
} from "@/lib/workflow-node-catalog";
import { buildPublishedEndpointValidationIssues } from "@/components/workflow-editor-publish-form-validation";
import { normalizePublishedEndpoint } from "@/components/workflow-editor-publish-form-shared";
import {
  buildWorkflowPersistBlockers,
  formatWorkflowPersistBlockedMessage
} from "./persist-blockers";

const PREFLIGHT_CATEGORY_LABELS: Record<string, string> = {
  schema: "contract/schema",
  node_support: "node support",
  node_execution: "node execution",
  tool_reference: "tool catalog reference",
  tool_execution: "execution capability",
  publish_draft: "publish draft",
  publish_identity: "publish identity",
  publish_version: "publish version",
  starter_portability: "starter portability",
  variables: "variables"
};

function summarizeIssueMessages(issues: { message: string }[]) {
  if (issues.length === 0) {
    return null;
  }

  const head = issues
    .slice(0, 3)
    .map((issue) => issue.message)
    .join("；");
  return issues.length > 3 ? `${head}；另有 ${issues.length - 3} 项待修正。` : head;
}

export function summarizeWorkspaceStarterValidationIssues(
  issues: WorkspaceStarterValidationIssue[]
): string | null {
  if (issues.length === 0) {
    return null;
  }

  const grouped = new Map<string, WorkspaceStarterValidationIssue[]>();
  issues.forEach((issue) => {
    const existing = grouped.get(issue.category);
    if (existing) {
      existing.push(issue);
      return;
    }
    grouped.set(issue.category, [issue]);
  });

  return Array.from(grouped.entries())
    .map(([category, categoryIssues]) => {
      if (category === "tool_reference") {
        return (
          formatToolReferenceIssueSummary(categoryIssues, {
            fallbackLabel: PREFLIGHT_CATEGORY_LABELS[category] ?? category,
            maxVisibleToolIds: 3
          }) ?? (PREFLIGHT_CATEGORY_LABELS[category] ?? category)
        );
      }

      const label = PREFLIGHT_CATEGORY_LABELS[category] ?? category;
      return `${label} ${categoryIssues.length} 项`;
    })
    .join("；");
}

export function summarizePreflightIssues(
  issues: WorkflowDefinitionPreflightIssue[]
): string | null {
  if (issues.length === 0) {
    return null;
  }

  const grouped = new Map<string, WorkflowDefinitionPreflightIssue[]>();
  issues.forEach((issue) => {
    const existing = grouped.get(issue.category);
    if (existing) {
      existing.push(issue);
      return;
    }
    grouped.set(issue.category, [issue]);
  });

  return Array.from(grouped.entries())
    .map(([category, categoryIssues]) => {
      if (category === "tool_reference") {
        return (
          formatToolReferenceIssueSummary(categoryIssues, {
            fallbackLabel: PREFLIGHT_CATEGORY_LABELS[category] ?? category,
            maxVisibleToolIds: 3
          }) ?? (PREFLIGHT_CATEGORY_LABELS[category] ?? category)
        );
      }

      const label = PREFLIGHT_CATEGORY_LABELS[category] ?? category;
      const descriptions = Array.from(
        new Set(
          categoryIssues.map((issue) =>
            isLegacyPublishAuthModeIssue(issue)
              ? buildLegacyPublishAuthModeContractSummary()
              : issue.path ?? issue.field ?? issue.message
          )
        )
      );
      const head = descriptions
        .slice(0, 2)
        .join("；");
      const suffix =
        categoryIssues.length > descriptions.slice(0, 2).length
          ? `；另有 ${categoryIssues.length - descriptions.slice(0, 2).length} 项同类问题`
          : "";
      return head ? `${label}：${head}${suffix}` : `${label} ${categoryIssues.length} 项`;
    })
    .join(" | ");
}

type UseWorkflowEditorValidationOptions = {
  currentDefinition: WorkflowDetail["definition"];
  workflowVersion: string;
  historicalVersions: string[];
  nodeCatalog: WorkflowNodeCatalogItem[];
  tools: PluginToolRegistryItem[];
  adapters: PluginAdapterRegistryItem[];
  sandboxReadiness?: SandboxReadinessCheck | null;
  sandboxBackends?: SandboxBackendCheck[] | null;
  serverValidationIssues: WorkflowDefinitionPreflightIssue[];
};

export function buildWorkflowEditorPublishDraftIssues(
  definition: WorkflowDetail["definition"],
  allowedWorkflowVersions: string[]
) {
  if (!Array.isArray(definition.publish)) {
    return [] as WorkflowDefinitionPreflightIssue[];
  }

  const normalizedEndpoints = definition.publish.map((endpoint, index) =>
    normalizePublishedEndpoint(toRecord(endpoint), index)
  );

  return buildPublishedEndpointValidationIssues(normalizedEndpoints, {
    allowedWorkflowVersions
  }).map((issue) => ({
    category: issue.category,
    message: issue.message,
    path: issue.path,
    field: issue.field
  }));
}

export function useWorkflowEditorValidation({
  currentDefinition,
  workflowVersion,
  historicalVersions,
  nodeCatalog,
  tools,
  adapters,
  sandboxReadiness,
  sandboxBackends,
  serverValidationIssues
}: UseWorkflowEditorValidationOptions) {
  const sandboxReadinessPreflightHint = useMemo(
    () => formatSandboxReadinessPreflightHint(sandboxReadiness),
    [sandboxReadiness]
  );
  const unsupportedNodes = useMemo(
    () => summarizeUnsupportedWorkflowNodes(nodeCatalog, currentDefinition.nodes ?? []),
    [currentDefinition.nodes, nodeCatalog]
  );
  const unsupportedNodeSummary = useMemo(
    () => formatUnsupportedWorkflowNodes(unsupportedNodes),
    [unsupportedNodes]
  );
  const contractValidationIssues = useMemo(
    () => buildWorkflowDefinitionContractValidationIssues(currentDefinition),
    [currentDefinition]
  );
  const contractValidationSummary = useMemo(
    () => summarizeIssueMessages(contractValidationIssues),
    [contractValidationIssues]
  );
  const availableWorkflowVersions = useMemo(
    () =>
      buildAllowedPublishWorkflowVersions({
        workflowVersion,
        historicalVersions
      }),
    [historicalVersions, workflowVersion]
  );
  const toolReferenceValidationIssues = useMemo(
    () => buildWorkflowToolReferenceValidationIssues(currentDefinition, tools),
    [currentDefinition, tools]
  );
  const toolReferenceValidationSummary = useMemo(
    () => summarizeIssueMessages(toolReferenceValidationIssues),
    [toolReferenceValidationIssues]
  );
  const toolExecutionValidationIssues = useMemo(
    () =>
      buildWorkflowToolExecutionValidationIssues(
        currentDefinition,
        tools,
        adapters,
        {
          sandboxReadiness,
          sandboxBackends
        }
      ),
    [adapters, currentDefinition, sandboxBackends, sandboxReadiness, tools]
  );
  const toolExecutionValidationSummary = useMemo(
    () => summarizeIssueMessages(toolExecutionValidationIssues),
    [toolExecutionValidationIssues]
  );
  const nodeExecutionValidationIssues = useMemo(
    () => buildWorkflowNodeExecutionValidationIssues(currentDefinition),
    [currentDefinition]
  );
  const nodeExecutionValidationSummary = useMemo(
    () => summarizeIssueMessages(nodeExecutionValidationIssues),
    [nodeExecutionValidationIssues]
  );
  const publishDraftValidationIssues = useMemo(
    () => buildWorkflowEditorPublishDraftIssues(currentDefinition, availableWorkflowVersions),
    [availableWorkflowVersions, currentDefinition]
  );
  const publishDraftValidationSummary = useMemo(
    () => summarizeIssueMessages(publishDraftValidationIssues),
    [publishDraftValidationIssues]
  );
  const hasPublishVersionValidationIssues = useMemo(
    () =>
      publishDraftValidationIssues.some(
        (issue) =>
          issue.category === "publish_version" || issue.field === "workflowVersion"
      ),
    [publishDraftValidationIssues]
  );
  const hasLegacyPublishAuthModeIssues = useMemo(
    () => publishDraftValidationIssues.some((issue) => isLegacyPublishAuthModeIssue(issue)),
    [publishDraftValidationIssues]
  );
  const variableValidationIssues = useMemo(
    () => buildWorkflowVariableValidationIssues(currentDefinition),
    [currentDefinition]
  );
  const variableValidationSummary = useMemo(
    () => summarizeIssueMessages(variableValidationIssues),
    [variableValidationIssues]
  );
  const serverValidationSummary = useMemo(
    () => summarizeIssueMessages(serverValidationIssues),
    [serverValidationIssues]
  );
  const hasServerToolExecutionIssues = useMemo(
    () => serverValidationIssues.some((issue) => issue.category === "tool_execution"),
    [serverValidationIssues]
  );
  const hasServerNodeExecutionIssues = useMemo(
    () => serverValidationIssues.some((issue) => issue.category === "node_execution"),
    [serverValidationIssues]
  );
  const validationNavigatorItems = useMemo<WorkflowValidationNavigatorItem[]>(() => {
    const localIssues: WorkflowValidationNavigatorIssue[] = [
      ...contractValidationIssues.map((issue) => ({
        category: "schema",
        message: issue.message,
        path: issue.path,
        field: issue.field
      })),
      ...toolReferenceValidationIssues.map((issue) => ({
        category: "tool_reference",
        message: issue.message,
        path: issue.path,
        field: issue.field,
        catalogGapToolIds: issue.toolIds
      })),
      ...nodeExecutionValidationIssues.map((issue) => ({
        category: "node_execution",
        message: issue.message,
        path: issue.path,
        field: issue.field
      })),
      ...toolExecutionValidationIssues.map((issue) => ({
        category: "tool_execution",
        message: issue.message,
        path: issue.path,
        field: issue.field
      })),
      ...publishDraftValidationIssues.map((issue) => ({
        category: issue.category,
        message: issue.message,
        path: issue.path,
        field: issue.field,
        hasLegacyPublishAuthModeIssues: isLegacyPublishAuthModeIssue(issue)
      })),
      ...variableValidationIssues,
      ...serverValidationIssues
    ];
    return buildWorkflowValidationNavigatorItems(currentDefinition, localIssues);
  }, [
    contractValidationIssues,
    currentDefinition,
    nodeExecutionValidationIssues,
    publishDraftValidationIssues,
    serverValidationIssues,
    toolExecutionValidationIssues,
    toolReferenceValidationIssues,
    variableValidationIssues
  ]);

  const persistBlockers = useMemo(
    () =>
      buildWorkflowPersistBlockers({
        unsupportedNodeCount: unsupportedNodes.length,
        unsupportedNodeSummary,
        contractValidationSummary,
        toolReferenceValidationIssues,
        toolReferenceValidationSummary,
        nodeExecutionValidationSummary,
        toolExecutionValidationSummary,
        publishDraftValidationIssues,
        publishDraftValidationSummary,
        hasPublishVersionValidationIssues,
        hasLegacyPublishAuthModeIssues,
        variableValidationSummary,
        serverValidationSummary,
        hasServerToolExecutionIssues,
        hasServerNodeExecutionIssues,
        sandboxReadinessPreflightHint
      }),
    [
      contractValidationSummary,
      hasPublishVersionValidationIssues,
      hasLegacyPublishAuthModeIssues,
      hasServerNodeExecutionIssues,
      hasServerToolExecutionIssues,
      nodeExecutionValidationSummary,
      publishDraftValidationIssues,
      publishDraftValidationSummary,
      sandboxReadinessPreflightHint,
      serverValidationSummary,
      toolExecutionValidationSummary,
      toolReferenceValidationIssues,
      toolReferenceValidationSummary,
      unsupportedNodeSummary,
      unsupportedNodes.length,
      variableValidationSummary
    ]
  );
  const persistBlockedMessage = useMemo(
    () => formatWorkflowPersistBlockedMessage(persistBlockers),
    [persistBlockers]
  );

  return {
    availableWorkflowVersions,
    contractValidationIssues,
    nodeExecutionValidationIssues,
    persistBlockers,
    publishDraftValidationIssues,
    persistBlockedMessage,
    toolExecutionValidationIssues,
    toolReferenceValidationIssues,
    unsupportedNodes,
    validationNavigatorItems,
    variableValidationIssues
  };
}

function toRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
