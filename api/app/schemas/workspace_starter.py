from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.explanations import SignalFollowUpExplanation

WorkflowBusinessTrack = Literal[
    "应用新建编排",
    "编排节点能力",
    "Dify 插件兼容",
    "API 调用开放",
]
WorkspaceStarterHistoryAction = Literal[
    "created",
    "updated",
    "archived",
    "restored",
    "refreshed",
    "rebased",
]
WorkspaceStarterBulkAction = Literal[
    "archive",
    "restore",
    "refresh",
    "rebase",
    "delete",
]
WorkspaceStarterBulkSkipReason = Literal[
    "not_found",
    "already_archived",
    "not_archived",
    "no_source_workflow",
    "source_workflow_missing",
    "source_workflow_invalid",
    "delete_requires_archive",
    "already_aligned",
    "name_drift_only",
]
WorkspaceStarterBulkPreviewReason = Literal[
    "not_found",
    "already_archived",
    "not_archived",
    "no_source_workflow",
    "source_workflow_missing",
    "source_workflow_invalid",
    "delete_requires_archive",
    "already_aligned",
    "name_drift_only",
]
WorkspaceStarterSourceRecommendedAction = Literal[
    "refresh",
    "rebase",
    "none",
]


class WorkspaceStarterTemplateBase(BaseModel):
    workspace_id: str = Field(default="default", min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    description: str = ""
    business_track: WorkflowBusinessTrack
    default_workflow_name: str = Field(min_length=1, max_length=128)
    workflow_focus: str = ""
    recommended_next_step: str = ""
    tags: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def normalize_tags(self) -> WorkspaceStarterTemplateBase:
        normalized_tags: list[str] = []
        for tag in self.tags:
            normalized = tag.strip()
            if normalized and normalized not in normalized_tags:
                normalized_tags.append(normalized)
        self.tags = normalized_tags
        return self


class WorkspaceStarterTemplateCreate(WorkspaceStarterTemplateBase):
    definition: dict[str, Any] = Field(default_factory=dict)
    created_from_workflow_id: str | None = Field(default=None, min_length=1, max_length=36)
    created_from_workflow_version: str | None = Field(
        default=None, min_length=1, max_length=32
    )


class WorkspaceStarterTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = None
    business_track: WorkflowBusinessTrack | None = None
    default_workflow_name: str | None = Field(default=None, min_length=1, max_length=128)
    workflow_focus: str | None = None
    recommended_next_step: str | None = None
    tags: list[str] | None = None
    definition: dict[str, Any] | None = None

    @model_validator(mode="after")
    def ensure_update_payload(self) -> WorkspaceStarterTemplateUpdate:
        if not any(
            value is not None
            for value in (
                self.name,
                self.description,
                self.business_track,
                self.default_workflow_name,
                self.workflow_focus,
                self.recommended_next_step,
                self.tags,
                self.definition,
            )
        ):
            raise ValueError("At least one field must be provided.")
        return self


class WorkspaceStarterTemplateItem(WorkspaceStarterTemplateBase):
    id: str
    definition: dict[str, Any] = Field(default_factory=dict)
    created_from_workflow_id: str | None = None
    created_from_workflow_version: str | None = None
    archived: bool = False
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    source_governance: WorkspaceStarterSourceGovernance | None = None


class WorkspaceStarterHistoryItem(BaseModel):
    id: str
    template_id: str
    workspace_id: str
    action: WorkspaceStarterHistoryAction
    summary: str
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class WorkspaceStarterSourceDiffEntry(BaseModel):
    id: str
    label: str
    status: Literal["added", "removed", "changed"]
    changed_fields: list[str] = Field(default_factory=list)
    template_facts: list[str] = Field(default_factory=list)
    source_facts: list[str] = Field(default_factory=list)


class WorkspaceStarterSourceDiffSummary(BaseModel):
    template_count: int
    source_count: int
    added_count: int
    removed_count: int
    changed_count: int


class WorkspaceStarterSourceActionDecision(BaseModel):
    recommended_action: WorkspaceStarterSourceRecommendedAction
    status_label: str
    summary: str
    can_refresh: bool = False
    can_rebase: bool = False
    fact_chips: list[str] = Field(default_factory=list)


WorkspaceStarterSourceGovernanceKind = Literal[
    "no_source",
    "missing_source",
    "synced",
    "drifted",
]


class WorkspaceStarterSourceGovernance(BaseModel):
    kind: WorkspaceStarterSourceGovernanceKind
    status_label: str
    summary: str
    source_workflow_id: str | None = None
    source_workflow_name: str | None = None
    template_version: str | None = None
    source_version: str | None = None
    action_decision: WorkspaceStarterSourceActionDecision | None = None
    outcome_explanation: SignalFollowUpExplanation | None = None


class WorkspaceStarterSourceGovernanceCounts(BaseModel):
    no_source: int = 0
    missing_source: int = 0
    synced: int = 0
    drifted: int = 0


class WorkspaceStarterSourceGovernanceScopeSummary(BaseModel):
    workspace_id: str
    total_count: int = 0
    attention_count: int = 0
    counts: WorkspaceStarterSourceGovernanceCounts = Field(
        default_factory=WorkspaceStarterSourceGovernanceCounts
    )
    chips: list[str] = Field(default_factory=list)
    summary: str
    follow_up_template_ids: list[str] = Field(default_factory=list)


class WorkspaceStarterSourceDiff(BaseModel):
    template_id: str
    workspace_id: str
    source_workflow_id: str
    source_workflow_name: str
    template_version: str | None = None
    source_version: str
    template_default_workflow_name: str
    source_default_workflow_name: str
    workflow_name_changed: bool = False
    changed: bool = False
    rebase_fields: list[str] = Field(default_factory=list)
    node_summary: WorkspaceStarterSourceDiffSummary
    edge_summary: WorkspaceStarterSourceDiffSummary
    sandbox_dependency_summary: WorkspaceStarterSourceDiffSummary
    node_entries: list[WorkspaceStarterSourceDiffEntry] = Field(default_factory=list)
    edge_entries: list[WorkspaceStarterSourceDiffEntry] = Field(default_factory=list)
    sandbox_dependency_entries: list[WorkspaceStarterSourceDiffEntry] = Field(
        default_factory=list
    )
    action_decision: WorkspaceStarterSourceActionDecision


class WorkspaceStarterBulkPreviewRequest(BaseModel):
    workspace_id: str = Field(default="default", min_length=1, max_length=64)
    template_ids: list[str] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def normalize_template_ids(self) -> WorkspaceStarterBulkPreviewRequest:
        normalized_ids: list[str] = []
        for template_id in self.template_ids:
            normalized = template_id.strip()
            if normalized and normalized not in normalized_ids:
                normalized_ids.append(normalized)

        if not normalized_ids:
            raise ValueError("At least one template_id must be provided.")

        self.template_ids = normalized_ids
        return self


class WorkspaceStarterBulkPreviewCandidateItem(BaseModel):
    template_id: str
    name: str | None = None
    archived: bool = False
    source_workflow_id: str | None = None
    source_workflow_version: str | None = None
    action_decision: WorkspaceStarterSourceActionDecision | None = None
    sandbox_dependency_changes: WorkspaceStarterSourceDiffSummary | None = None
    sandbox_dependency_nodes: list[str] = Field(default_factory=list)


class WorkspaceStarterBulkPreviewBlockedItem(BaseModel):
    template_id: str
    name: str | None = None
    archived: bool = False
    reason: WorkspaceStarterBulkPreviewReason
    detail: str
    source_workflow_id: str | None = None
    source_workflow_version: str | None = None
    action_decision: WorkspaceStarterSourceActionDecision | None = None
    sandbox_dependency_changes: WorkspaceStarterSourceDiffSummary | None = None
    sandbox_dependency_nodes: list[str] = Field(default_factory=list)


class WorkspaceStarterBulkPreviewReasonSummary(BaseModel):
    reason: WorkspaceStarterBulkPreviewReason
    count: int
    detail: str


class WorkspaceStarterBulkActionPreview(BaseModel):
    action: WorkspaceStarterBulkAction
    candidate_count: int
    blocked_count: int
    candidate_items: list[WorkspaceStarterBulkPreviewCandidateItem] = Field(
        default_factory=list
    )
    blocked_items: list[WorkspaceStarterBulkPreviewBlockedItem] = Field(
        default_factory=list
    )
    blocked_reason_summary: list[WorkspaceStarterBulkPreviewReasonSummary] = Field(
        default_factory=list
    )


class WorkspaceStarterBulkPreviewSet(BaseModel):
    archive: WorkspaceStarterBulkActionPreview
    restore: WorkspaceStarterBulkActionPreview
    refresh: WorkspaceStarterBulkActionPreview
    rebase: WorkspaceStarterBulkActionPreview
    delete: WorkspaceStarterBulkActionPreview


class WorkspaceStarterBulkPreview(BaseModel):
    workspace_id: str
    requested_count: int
    previews: WorkspaceStarterBulkPreviewSet


class WorkspaceStarterBulkActionRequest(BaseModel):
    workspace_id: str = Field(default="default", min_length=1, max_length=64)
    action: WorkspaceStarterBulkAction
    template_ids: list[str] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def normalize_template_ids(self) -> WorkspaceStarterBulkActionRequest:
        normalized_ids: list[str] = []
        for template_id in self.template_ids:
            normalized = template_id.strip()
            if normalized and normalized not in normalized_ids:
                normalized_ids.append(normalized)

        if not normalized_ids:
            raise ValueError("At least one template_id must be provided.")

        self.template_ids = normalized_ids
        return self


class WorkspaceStarterBulkSkippedItem(BaseModel):
    template_id: str
    name: str | None = None
    archived: bool = False
    reason: WorkspaceStarterBulkSkipReason
    detail: str
    source_workflow_id: str | None = None
    source_workflow_version: str | None = None
    action_decision: WorkspaceStarterSourceActionDecision | None = None
    sandbox_dependency_changes: WorkspaceStarterSourceDiffSummary | None = None
    sandbox_dependency_nodes: list[str] = Field(default_factory=list)


class WorkspaceStarterBulkSkippedSummary(BaseModel):
    reason: WorkspaceStarterBulkSkipReason
    count: int
    detail: str


class WorkspaceStarterBulkDeletedItem(BaseModel):
    template_id: str
    name: str | None = None


WorkspaceStarterBulkReceiptOutcome = Literal["updated", "deleted", "skipped"]


class WorkspaceStarterBulkReceiptItem(BaseModel):
    template_id: str
    name: str | None = None
    outcome: WorkspaceStarterBulkReceiptOutcome
    archived: bool = False
    reason: WorkspaceStarterBulkSkipReason | None = None
    detail: str | None = None
    source_workflow_id: str | None = None
    source_workflow_version: str | None = None
    action_decision: WorkspaceStarterSourceActionDecision | None = None
    sandbox_dependency_changes: WorkspaceStarterSourceDiffSummary | None = None
    sandbox_dependency_nodes: list[str] = Field(default_factory=list)
    changed: bool | None = None
    rebase_fields: list[str] = Field(default_factory=list)


class WorkspaceStarterBulkSandboxDependencyItem(BaseModel):
    template_id: str
    name: str | None = None
    source_workflow_id: str | None = None
    source_workflow_version: str | None = None
    sandbox_dependency_changes: WorkspaceStarterSourceDiffSummary
    sandbox_dependency_nodes: list[str] = Field(default_factory=list)


class WorkspaceStarterBulkActionResult(BaseModel):
    workspace_id: str
    action: WorkspaceStarterBulkAction
    requested_count: int
    updated_count: int
    skipped_count: int
    updated_items: list[WorkspaceStarterTemplateItem] = Field(default_factory=list)
    deleted_items: list[WorkspaceStarterBulkDeletedItem] = Field(default_factory=list)
    skipped_items: list[WorkspaceStarterBulkSkippedItem] = Field(default_factory=list)
    skipped_reason_summary: list[WorkspaceStarterBulkSkippedSummary] = Field(
        default_factory=list
    )
    sandbox_dependency_changes: WorkspaceStarterSourceDiffSummary | None = None
    sandbox_dependency_items: list[WorkspaceStarterBulkSandboxDependencyItem] = Field(
        default_factory=list
    )
    receipt_items: list[WorkspaceStarterBulkReceiptItem] = Field(default_factory=list)
    outcome_explanation: SignalFollowUpExplanation | None = None
    follow_up_template_ids: list[str] = Field(default_factory=list)
