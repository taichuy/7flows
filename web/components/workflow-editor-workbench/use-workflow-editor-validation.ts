"use client";

import { useMemo } from "react";

import type { PluginAdapterRegistryItem, PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowNodeCatalogItem } from "@/lib/get-workflow-library";
import type { WorkflowDefinitionPreflightIssue, WorkflowDetail } from "@/lib/get-workflows";
import type { WorkspaceStarterValidationIssue } from "@/lib/get-workspace-starters";
import { buildWorkflowDefinitionContractValidationIssues } from "@/lib/workflow-contract-schema-validation";
import {
  buildWorkflowPublishIdentityValidationIssues,
} from "@/lib/workflow-publish-identity-validation";
import {
  buildAllowedPublishWorkflowVersions,
  buildWorkflowPublishVersionValidationIssues
} from "@/lib/workflow-publish-version-validation";
import { buildWorkflowToolExecutionValidationIssues } from "@/lib/workflow-tool-execution-validation";
import { buildWorkflowToolReferenceValidationIssues } from "@/lib/workflow-tool-reference-validation";
import {
  buildWorkflowValidationNavigatorItems,
  type WorkflowValidationNavigatorItem
} from "@/lib/workflow-validation-navigation";
import { buildWorkflowVariableValidationIssues } from "@/lib/workflow-variable-validation";
import {
  formatUnsupportedWorkflowNodes,
  summarizeUnsupportedWorkflowNodes
} from "@/lib/workflow-node-catalog";

const PREFLIGHT_CATEGORY_LABELS: Record<string, string> = {
  schema: "contract/schema",
  node_support: "node support",
  tool_reference: "tool reference",
  tool_execution: "execution capability",
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
      const label = PREFLIGHT_CATEGORY_LABELS[category] ?? category;
      const head = categoryIssues
        .slice(0, 2)
        .map((issue) => issue.path ?? issue.field ?? issue.message)
        .join("；");
      const suffix =
        categoryIssues.length > 2
          ? `；另有 ${categoryIssues.length - 2} 项同类问题`
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
  serverValidationIssues: WorkflowDefinitionPreflightIssue[];
};

export function useWorkflowEditorValidation({
  currentDefinition,
  workflowVersion,
  historicalVersions,
  nodeCatalog,
  tools,
  adapters,
  sandboxReadiness,
  serverValidationIssues
}: UseWorkflowEditorValidationOptions) {
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
        sandboxReadiness
      ),
    [adapters, currentDefinition, sandboxReadiness, tools]
  );
  const toolExecutionValidationSummary = useMemo(
    () => summarizeIssueMessages(toolExecutionValidationIssues),
    [toolExecutionValidationIssues]
  );
  const publishVersionValidationIssues = useMemo(
    () => buildWorkflowPublishVersionValidationIssues(currentDefinition, availableWorkflowVersions),
    [availableWorkflowVersions, currentDefinition]
  );
  const publishVersionValidationSummary = useMemo(
    () => summarizeIssueMessages(publishVersionValidationIssues),
    [publishVersionValidationIssues]
  );
  const publishIdentityValidationIssues = useMemo(
    () => buildWorkflowPublishIdentityValidationIssues(currentDefinition),
    [currentDefinition]
  );
  const publishIdentityValidationSummary = useMemo(
    () => summarizeIssueMessages(publishIdentityValidationIssues),
    [publishIdentityValidationIssues]
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
  const validationNavigatorItems = useMemo<WorkflowValidationNavigatorItem[]>(() => {
    const localIssues: WorkflowDefinitionPreflightIssue[] = [
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
        field: issue.field
      })),
      ...toolExecutionValidationIssues.map((issue) => ({
        category: "tool_execution",
        message: issue.message,
        path: issue.path,
        field: issue.field
      })),
      ...publishVersionValidationIssues.map((issue) => ({
        category: "publish_version",
        message: issue.message,
        path: issue.path,
        field: issue.field
      })),
      ...publishIdentityValidationIssues.map((issue) => ({
        category: "publish_identity",
        message: issue.message,
        path: issue.path,
        field: issue.field
      })),
      ...variableValidationIssues,
      ...serverValidationIssues
    ];
    return buildWorkflowValidationNavigatorItems(currentDefinition, localIssues);
  }, [
    contractValidationIssues,
    currentDefinition,
    publishIdentityValidationIssues,
    publishVersionValidationIssues,
    serverValidationIssues,
    toolExecutionValidationIssues,
    toolReferenceValidationIssues,
    variableValidationIssues
  ]);

  const persistBlockedMessage = useMemo(
    () =>
      [
        unsupportedNodes.length > 0
          ? `当前 workflow 包含未进入执行主链的节点，暂不能保存或沉淀为 workspace starter：${unsupportedNodeSummary}。请先移除或替换这些节点，再继续保存。`
          : null,
        contractValidationSummary
          ? `当前 workflow definition 还有 contract schema 待修正问题：${contractValidationSummary}${contractValidationSummary.endsWith("。") ? "" : "。"}请先在 Node contract / publish draft 中修正后再保存。`
          : null,
        toolReferenceValidationSummary
          ? `当前 workflow definition 还有 tool catalog 引用待修正问题：${toolReferenceValidationSummary}${toolReferenceValidationSummary.endsWith("。") ? "" : "。"}请先修正 tool binding / LLM Agent tool policy 后再保存。`
          : null,
        toolExecutionValidationSummary
          ? `当前 workflow definition 还有 execution capability 待修正问题：${toolExecutionValidationSummary}${toolExecutionValidationSummary.endsWith("。") ? "" : "。"}请先对齐 adapter 绑定、execution class 与 sandbox readiness，再继续保存。`
          : null,
        publishVersionValidationSummary
          ? `当前 workflow definition 还有 publish version 引用待修正问题：${publishVersionValidationSummary}${publishVersionValidationSummary.endsWith("。") ? "" : "。"}如果 endpoint 要跟随本次保存版本，请把 workflowVersion 留空。`
          : null,
        publishIdentityValidationSummary
          ? `当前 workflow definition 还有 publish identity 待修正问题：${publishIdentityValidationSummary}${publishIdentityValidationSummary.endsWith("。") ? "" : "。"}请先调整 endpoint id / alias / path，避免发布标识冲突。`
          : null,
        variableValidationSummary
          ? `当前 workflow definition 还有 variables 待修正问题：${variableValidationSummary}${variableValidationSummary.endsWith("。") ? "" : "。"}请先修正变量名，再继续保存。`
          : null,
        serverValidationSummary
          ? `当前 persisted workflow 已出现服务器侧 definition drift：${serverValidationSummary}${serverValidationSummary.endsWith("。") ? "" : "。"}请先对齐当前工具目录、skill 引用或 sandbox readiness，再继续保存。`
          : null
      ]
        .filter(Boolean)
        .join(" "),
    [
      contractValidationSummary,
      publishIdentityValidationSummary,
      publishVersionValidationSummary,
      serverValidationSummary,
      toolExecutionValidationSummary,
      toolReferenceValidationSummary,
      unsupportedNodeSummary,
      unsupportedNodes.length,
      variableValidationSummary
    ]
  );

  return {
    availableWorkflowVersions,
    contractValidationIssues,
    publishIdentityValidationIssues,
    persistBlockedMessage,
    publishVersionValidationIssues,
    toolExecutionValidationIssues,
    toolReferenceValidationIssues,
    unsupportedNodes,
    validationNavigatorItems,
    variableValidationIssues
  };
}
