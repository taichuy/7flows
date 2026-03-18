"use client";

import { useTransition, type Dispatch, type SetStateAction } from "react";

import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";
import {
  WorkflowDefinitionPreflightError,
  type WorkflowDefinitionPreflightIssue,
  type WorkflowDetail,
  updateWorkflow,
  validateWorkflowDefinition
} from "@/lib/get-workflows";
import {
  createWorkspaceStarterTemplate,
  WorkspaceStarterValidationError
} from "@/lib/get-workspace-starters";
import { buildWorkspaceStarterPayload } from "@/lib/workspace-starter-payload";
import { inferWorkflowBusinessTrack } from "@/lib/workflow-starters";
import {
  type WorkflowValidationFocusTarget,
  type WorkflowValidationNavigatorItem
} from "@/lib/workflow-validation-navigation";

import {
  summarizePreflightIssues,
  summarizeWorkspaceStarterValidationIssues
} from "./use-workflow-editor-validation";
import type { WorkflowEditorMessageTone } from "./shared";

type UseWorkflowEditorPersistenceOptions = {
  workflowId: string;
  fallbackWorkflowName: string;
  workflowName: string;
  workflowVersion: string;
  currentDefinition: WorkflowDetail["definition"];
  currentDefinitionSignature: string;
  sandboxReadiness?: SandboxReadinessCheck | null;
  persistBlockedMessage: string;
  setPersistedWorkflowName: (name: string) => void;
  setPersistedDefinition: (definition: WorkflowDetail["definition"]) => void;
  setWorkflowVersion: (version: string) => void;
  setServerValidationIssues: Dispatch<SetStateAction<WorkflowDefinitionPreflightIssue[]>>;
  setServerValidationIssueSourceSignature: Dispatch<SetStateAction<string>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setMessageTone: Dispatch<SetStateAction<WorkflowEditorMessageTone>>;
  focusNode: (nodeId: string | null) => void;
  setValidationFocusTarget: Dispatch<SetStateAction<WorkflowValidationFocusTarget | null>>;
};

export function useWorkflowEditorPersistence({
  workflowId,
  fallbackWorkflowName,
  workflowName,
  workflowVersion,
  currentDefinition,
  currentDefinitionSignature,
  sandboxReadiness,
  persistBlockedMessage,
  setPersistedWorkflowName,
  setPersistedDefinition,
  setWorkflowVersion,
  setServerValidationIssues,
  setServerValidationIssueSourceSignature,
  setMessage,
  setMessageTone,
  focusNode,
  setValidationFocusTarget
}: UseWorkflowEditorPersistenceOptions) {
  const [isSaving, startSavingTransition] = useTransition();
  const [isSavingStarter, startSaveStarterTransition] = useTransition();

  const handleSave = () => {
    if (persistBlockedMessage) {
      setMessage(persistBlockedMessage);
      setMessageTone("error");
      return;
    }

    startSavingTransition(async () => {
      setMessage("正在保存 workflow definition...");
      setMessageTone("idle");

      try {
        const preflight = await validateWorkflowDefinition(workflowId, currentDefinition);
        const normalizedWorkflowName = workflowName.trim() || fallbackWorkflowName;
        const body = await updateWorkflow(workflowId, {
          name: normalizedWorkflowName,
          definition: preflight.definition
        });

        setPersistedWorkflowName(normalizedWorkflowName);
        setPersistedDefinition(preflight.definition);
        setWorkflowVersion(body?.version ?? workflowVersion);
        setServerValidationIssues(body?.definition_issues ?? []);
        setServerValidationIssueSourceSignature(JSON.stringify(body?.definition ?? preflight.definition));
        setMessage(`已保存 workflow，当前版本 ${body?.version ?? workflowVersion}。`);
        setMessageTone("success");
      } catch (error) {
        if (error instanceof WorkflowDefinitionPreflightError) {
          setServerValidationIssues(error.issues);
          setServerValidationIssueSourceSignature(currentDefinitionSignature);
        } else {
          setServerValidationIssues([]);
        }
        const preflightIssueSummary =
          error instanceof WorkflowDefinitionPreflightError
            ? summarizePreflightIssues(error.issues)
            : null;
        const sandboxReadinessPreflightHint =
          error instanceof WorkflowDefinitionPreflightError &&
          error.issues.some((issue) => issue.category === "tool_execution")
            ? formatSandboxReadinessPreflightHint(sandboxReadiness)
            : null;
        setMessage(
          error instanceof WorkflowDefinitionPreflightError
            ? [error.message, preflightIssueSummary, sandboxReadinessPreflightHint]
                .filter(Boolean)
                .join(" ")
            : error instanceof Error
              ? error.message
              : "无法连接后端保存 workflow，请确认 API 已启动。"
        );
        setMessageTone("error");
      }
    });
  };

  const handleNavigateValidationIssue = (item: WorkflowValidationNavigatorItem) => {
    setValidationFocusTarget(item.target);

    if (item.target.scope === "node") {
      focusNode(item.target.nodeId);
    }

    setMessage(`已定位到 ${item.target.label}，请根据提示修正后再保存。`);
    setMessageTone("error");
  };

  const handleSaveAsWorkspaceStarter = () => {
    if (persistBlockedMessage) {
      setMessage(persistBlockedMessage);
      setMessageTone("error");
      return;
    }

    const normalizedWorkflowName = workflowName.trim() || fallbackWorkflowName;
    const starterPayload = buildWorkspaceStarterPayload({
      workflowId,
      workflowName: normalizedWorkflowName,
      workflowVersion,
      businessTrack: inferWorkflowBusinessTrack(currentDefinition),
      definition: currentDefinition
    });

    startSaveStarterTransition(async () => {
      setMessage("正在保存到 workspace starter library...");
      setMessageTone("idle");

      try {
        const body = await createWorkspaceStarterTemplate(starterPayload);
        setMessage(`已保存 workspace starter：${body?.name ?? starterPayload.name}。回到创建页即可复用。`);
        setMessageTone("success");
      } catch (error) {
        const validationSummary =
          error instanceof WorkspaceStarterValidationError
            ? summarizeWorkspaceStarterValidationIssues(error.issues)
            : null;
        setMessage(
          error instanceof WorkspaceStarterValidationError
            ? validationSummary
              ? `${error.message}（${validationSummary}）`
              : error.message
            : "无法连接后端保存 workspace starter，请确认 API 已启动。"
        );
        setMessageTone("error");
      }
    });
  };

  return {
    handleNavigateValidationIssue,
    handleSave,
    handleSaveAsWorkspaceStarter,
    isSaving,
    isSavingStarter
  };
}
