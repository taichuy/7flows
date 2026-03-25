import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";

import { WorkbenchEntryLink } from "@/components/workbench-entry-links";
import { WorkspaceStarterFollowUpCard } from "@/components/workspace-starter-library/follow-up-card";
import type { WorkflowDefinitionToolGovernance } from "@/lib/workflow-definition-tool-governance";
import {
  WORKFLOW_BUSINESS_TRACKS,
  type WorkflowBusinessTrack
} from "@/lib/workflow-business-tracks";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import {
  buildWorkspaceStarterMetadataIdleMessage,
  type WorkspaceStarterMessageTone
} from "@/lib/workspace-starter-mutation-presenters";
import {
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  type WorkspaceStarterGovernanceQueryScope
} from "@/lib/workspace-starter-governance-query";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";

import {
  buildWorkspaceStarterEmptyStateFollowUp,
  buildWorkspaceStarterMissingToolGovernanceSurface,
  buildWorkspaceStarterTemplateFollowUpSurface,
  buildWorkspaceStarterSourceGovernancePresenter,
  resolveWorkspaceStarterCreateWorkflowActionLabel,
  type WorkspaceStarterFollowUpSurface
} from "./shared";
import type { WorkspaceStarterFormState } from "./shared";

type WorkspaceStarterMetadataPanelProps = {
  selectedTemplate: WorkspaceStarterTemplateItem | null;
  formState: WorkspaceStarterFormState | null;
  selectedTrackPriority: string | null;
  hasPendingChanges: boolean;
  isSaving: boolean;
  isMutating: boolean;
  message: string | null;
  messageTone: WorkspaceStarterMessageTone;
  createWorkflowHref: string | null;
  selectedTemplateToolGovernance?: WorkflowDefinitionToolGovernance | null;
  emptyStateFollowUp?: WorkspaceStarterFollowUpSurface | null;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
  setFormState: Dispatch<SetStateAction<WorkspaceStarterFormState | null>>;
  onSave: () => void;
  onTemplateMutation: (action: "archive" | "restore" | "delete") => void;
};

export function WorkspaceStarterMetadataPanel({
  selectedTemplate,
  formState,
  selectedTrackPriority,
  hasPendingChanges,
  isSaving,
  isMutating,
  message,
  messageTone,
  createWorkflowHref,
  selectedTemplateToolGovernance = null,
  emptyStateFollowUp = null,
  workspaceStarterGovernanceQueryScope = null,
  setFormState,
  onSave,
  onTemplateMutation
}: WorkspaceStarterMetadataPanelProps) {
  const sourceGovernanceKind = selectedTemplate
    ? buildWorkspaceStarterSourceGovernancePresenter(selectedTemplate).kind
    : null;
  const createWorkflowActionLabel = selectedTemplate
    ? resolveWorkspaceStarterCreateWorkflowActionLabel({
        governanceKind: sourceGovernanceKind,
        createWorkflowHref,
        archived: selectedTemplate.archived
      }) ?? "带此 starter 回到创建页"
    : "带此 starter 回到创建页";
  const missingToolGovernanceSurface = selectedTemplate
    ? buildWorkspaceStarterMissingToolGovernanceSurface({
        template: selectedTemplate,
        missingToolIds: selectedTemplateToolGovernance?.missingToolIds ?? [],
        workspaceStarterGovernanceQueryScope
      })
    : null;
  const metadataFollowUpSurface = buildWorkspaceStarterTemplateFollowUpSurface({
    template: selectedTemplate,
    createWorkflowHref,
    workspaceStarterGovernanceQueryScope
  });
  const resolvedMetadataFollowUpSurface = missingToolGovernanceSurface ?? metadataFollowUpSurface;
  const metadataCreateWorkflowLabel =
    (!missingToolGovernanceSurface && resolvedMetadataFollowUpSurface?.entryKey === "createWorkflow"
      ? resolvedMetadataFollowUpSurface.entryOverride?.label?.trim()
      : null) ?? createWorkflowActionLabel;
  const resolvedEmptyStateFollowUp =
    emptyStateFollowUp ??
    (createWorkflowHref
      ? buildWorkspaceStarterEmptyStateFollowUp({
          sourceGovernancePrimaryFollowUp: null,
          createWorkflowHref
        })
      : {
          label: "先从左侧选择 starter",
          headline: "当前还没有聚焦中的 workspace starter。",
          detail: "先从左侧列表选择一个 starter，这里会显示可更新的元数据与来源信息。",
          focusTemplateId: null,
          focusLabel: null
        });
  const sourceWorkflowLink =
    !missingToolGovernanceSurface && selectedTemplate?.created_from_workflow_id
    ? workspaceStarterGovernanceQueryScope
      ? buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
          workflowId: selectedTemplate.created_from_workflow_id,
          viewState: workspaceStarterGovernanceQueryScope,
          variant: "source"
        })
      : buildAuthorFacingWorkflowDetailLinkSurface({
          workflowId: selectedTemplate.created_from_workflow_id,
          variant: "source"
        })
    : null;

  return (
    <article className="diagnostic-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Detail</p>
          <h2>Starter metadata</h2>
        </div>
      </div>

      {!selectedTemplate || !formState ? (
        <>
          <p className="empty-state">选中一个模板后，这里会显示可更新的元数据与来源信息。</p>
          <WorkspaceStarterFollowUpCard
            detail={resolvedEmptyStateFollowUp.detail}
            headline={resolvedEmptyStateFollowUp.headline}
            label={resolvedEmptyStateFollowUp.label}
            primaryResourceSummary={resolvedEmptyStateFollowUp.primaryResourceSummary}
            actions={
              resolvedEmptyStateFollowUp.entryKey ? (
                <WorkbenchEntryLink
                  className="inline-link"
                  linkKey={resolvedEmptyStateFollowUp.entryKey}
                  override={resolvedEmptyStateFollowUp.entryOverride}
                />
              ) : null
            }
          />
        </>
      ) : (
        <>
          <div className="summary-strip compact-strip">
            <div className="summary-card">
              <span>Priority</span>
              <strong>{selectedTrackPriority ?? "-"}</strong>
            </div>
            <div className="summary-card">
              <span>Status</span>
              <strong>{selectedTemplate.archived ? "Archived" : "Active"}</strong>
            </div>
            <div className="summary-card">
              <span>Nodes</span>
              <strong>{selectedTemplate.definition.nodes?.length ?? 0}</strong>
            </div>
            <div className="summary-card">
              <span>Edges</span>
              <strong>{selectedTemplate.definition.edges?.length ?? 0}</strong>
            </div>
          </div>

          {resolvedMetadataFollowUpSurface ? (
            <WorkspaceStarterFollowUpCard
              headline={resolvedMetadataFollowUpSurface.headline}
              label={resolvedMetadataFollowUpSurface.label}
              detail={resolvedMetadataFollowUpSurface.detail}
              primaryResourceSummary={resolvedMetadataFollowUpSurface.primaryResourceSummary}
              actions={
                missingToolGovernanceSurface ? (
                  resolvedMetadataFollowUpSurface.entryKey ? (
                    <WorkbenchEntryLink
                      className="inline-link secondary"
                      linkKey={resolvedMetadataFollowUpSurface.entryKey}
                      override={resolvedMetadataFollowUpSurface.entryOverride}
                    />
                  ) : null
                ) : (
                  <>
                    {createWorkflowHref && metadataCreateWorkflowLabel ? (
                      <WorkbenchEntryLink
                        className="inline-link secondary"
                        linkKey="createWorkflow"
                        override={{ href: createWorkflowHref }}
                      >
                        {metadataCreateWorkflowLabel}
                      </WorkbenchEntryLink>
                    ) : null}
                    {sourceWorkflowLink ? (
                      <Link className="inline-link secondary" href={sourceWorkflowLink.href}>
                        {sourceWorkflowLink.label}
                      </Link>
                    ) : null}
                  </>
                )
              }
            />
          ) : null}

          <div className="binding-form">
            <label className="binding-field">
              <span className="binding-label">Template name</span>
              <input
                className="trace-text-input"
                value={formState.name}
                onChange={(event) =>
                  setFormState((current) =>
                    current ? { ...current, name: event.target.value } : current
                  )
                }
              />
            </label>

            <label className="binding-field">
              <span className="binding-label">Business track</span>
              <select
                className="binding-select"
                value={formState.businessTrack}
                onChange={(event) =>
                  setFormState((current) =>
                    current
                      ? {
                          ...current,
                          businessTrack: event.target.value as WorkflowBusinessTrack
                        }
                      : current
                  )
                }
              >
                {WORKFLOW_BUSINESS_TRACKS.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.priority} · {track.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="binding-field">
              <span className="binding-label">Default workflow name</span>
              <input
                className="trace-text-input"
                value={formState.defaultWorkflowName}
                onChange={(event) =>
                  setFormState((current) =>
                    current ? { ...current, defaultWorkflowName: event.target.value } : current
                  )
                }
              />
            </label>

            <label className="binding-field">
              <span className="binding-label">Description</span>
              <textarea
                className="governance-textarea"
                value={formState.description}
                onChange={(event) =>
                  setFormState((current) =>
                    current ? { ...current, description: event.target.value } : current
                  )
                }
              />
            </label>

            <label className="binding-field">
              <span className="binding-label">Workflow focus</span>
              <textarea
                className="governance-textarea"
                value={formState.workflowFocus}
                onChange={(event) =>
                  setFormState((current) =>
                    current ? { ...current, workflowFocus: event.target.value } : current
                  )
                }
              />
            </label>

            <label className="binding-field">
              <span className="binding-label">Recommended next step</span>
              <textarea
                className="governance-textarea"
                value={formState.recommendedNextStep}
                onChange={(event) =>
                  setFormState((current) =>
                    current ? { ...current, recommendedNextStep: event.target.value } : current
                  )
                }
              />
            </label>

            <label className="binding-field">
              <span className="binding-label">Tags</span>
              <input
                className="trace-text-input"
                value={formState.tagsText}
                onChange={(event) =>
                  setFormState((current) =>
                    current ? { ...current, tagsText: event.target.value } : current
                  )
                }
                placeholder="使用逗号分隔标签"
              />
            </label>

            <div className="binding-actions">
              <button
                className="sync-button"
                type="button"
                onClick={onSave}
                disabled={!hasPendingChanges || isSaving}
              >
                {isSaving ? "保存中..." : "保存元数据"}
              </button>
              {selectedTemplate.archived ? (
                <button
                  className="sync-button secondary"
                  type="button"
                  onClick={() => onTemplateMutation("restore")}
                  disabled={isMutating}
                >
                  {isMutating ? "处理中..." : "恢复模板"}
                </button>
              ) : (
                <>
                  <button
                    className="sync-button secondary"
                    type="button"
                    onClick={() => onTemplateMutation("archive")}
                    disabled={isMutating}
                >
                  {isMutating ? "处理中..." : "归档模板"}
                </button>
                  {!createWorkflowHref ? (
                    <span className="binding-meta">
                      当前 starter 已归档；恢复后才会重新出现在创建页。
                    </span>
                  ) : null}
                </>
              )}
              <button
                className="inline-link secondary"
                type="button"
                onClick={() => onTemplateMutation("delete")}
                disabled={isMutating}
              >
                永久删除
              </button>
            </div>

            <p className={`sync-message ${messageTone}`}>
              {message ?? buildWorkspaceStarterMetadataIdleMessage()}
            </p>
          </div>
        </>
      )}
    </article>
  );
}
