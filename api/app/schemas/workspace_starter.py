from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

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
    reason: WorkspaceStarterBulkSkipReason
    detail: str


class WorkspaceStarterBulkSkippedSummary(BaseModel):
    reason: WorkspaceStarterBulkSkipReason
    count: int
    detail: str


class WorkspaceStarterBulkDeletedItem(BaseModel):
    template_id: str
    name: str | None = None


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
