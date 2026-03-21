import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";

import { WorkbenchEntryLink } from "@/components/workbench-entry-links";
import {
  WORKFLOW_BUSINESS_TRACKS,
  type WorkflowBusinessTrack
} from "@/lib/workflow-business-tracks";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";

import type {
  WorkspaceStarterFormState,
  WorkspaceStarterMessageTone
} from "./shared";

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
  setFormState,
  onSave,
  onTemplateMutation
}: WorkspaceStarterMetadataPanelProps) {
  const sourceWorkflowLink = selectedTemplate?.created_from_workflow_id
    ? buildAuthorFacingWorkflowDetailLinkSurface({
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
        <p className="empty-state">选中一个模板后，这里会显示可更新的元数据与来源信息。</p>
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
                  {createWorkflowHref ? (
                    <WorkbenchEntryLink
                      className="inline-link secondary"
                      linkKey="createWorkflow"
                      override={{ href: createWorkflowHref }}
                    >
                      带此 starter 回到创建页
                    </WorkbenchEntryLink>
                  ) : (
                    <span className="binding-meta">
                      当前 starter 已归档；恢复后才会重新出现在创建页。
                    </span>
                  )}
                </>
              )}
              {sourceWorkflowLink ? (
                <Link className="inline-link secondary" href={sourceWorkflowLink.href}>
                  {sourceWorkflowLink.label}
                </Link>
              ) : null}
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
              {message ??
                "更新后会直接写回 workspace starter library，创建页会立刻复用最新元数据。"}
            </p>
          </div>
        </>
      )}
    </article>
  );
}
