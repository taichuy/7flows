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
    def normalize_tags(self) -> "WorkspaceStarterTemplateBase":
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
    def ensure_update_payload(self) -> "WorkspaceStarterTemplateUpdate":
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
