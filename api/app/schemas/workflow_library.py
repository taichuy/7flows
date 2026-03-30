from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.plugin import PluginToolItem
from app.schemas.workflow import WorkflowToolGovernanceSummary
from app.schemas.workspace_starter import (
    WorkflowBusinessTrack,
    WorkspaceStarterSourceGovernance,
)

WorkflowLibrarySourceKind = Literal["starter", "node", "tool"]
WorkflowLibrarySourceScope = Literal["builtin", "workspace", "ecosystem"]
WorkflowLibrarySourceStatus = Literal["available", "planned"]
WorkflowLibrarySourceGovernance = Literal["repo", "workspace", "adapter"]
WorkflowNodeSupportStatus = Literal["available", "planned"]
WorkflowNodeType = Literal[
    "trigger",
    "llm_agent",
    "tool",
    "sandbox_code",
    "mcp_query",
    "condition",
    "router",
    "loop",
    "output",
]
WorkflowNodeCapabilityGroup = Literal[
    "entry",
    "agent",
    "integration",
    "logic",
    "output",
]


class WorkflowLibrarySourceDescriptor(BaseModel):
    kind: WorkflowLibrarySourceKind
    scope: WorkflowLibrarySourceScope
    status: WorkflowLibrarySourceStatus
    governance: WorkflowLibrarySourceGovernance
    ecosystem: str
    label: str
    short_label: str
    summary: str


class WorkflowLibrarySourceLane(WorkflowLibrarySourceDescriptor):
    count: int = Field(default=0, ge=0)


class WorkflowNodeCatalogPosition(BaseModel):
    x: int
    y: int


class WorkflowNodeCatalogPalette(BaseModel):
    enabled: bool
    order: int = Field(ge=0)
    default_position: WorkflowNodeCatalogPosition


class WorkflowNodeCatalogDefaults(BaseModel):
    name: str
    config: dict[str, Any] = Field(default_factory=dict)


class WorkflowNodeCatalogItem(BaseModel):
    type: WorkflowNodeType
    label: str
    description: str
    ecosystem: str
    source: WorkflowLibrarySourceDescriptor
    capability_group: WorkflowNodeCapabilityGroup
    business_track: WorkflowBusinessTrack
    tags: list[str] = Field(default_factory=list)
    palette: WorkflowNodeCatalogPalette
    defaults: WorkflowNodeCatalogDefaults
    support_status: WorkflowNodeSupportStatus = "available"
    support_summary: str = ""
    binding_required: bool = False
    binding_source_lanes: list[WorkflowLibrarySourceLane] = Field(default_factory=list)


class WorkflowLibraryStarterItem(BaseModel):
    id: str
    origin: Literal["builtin", "workspace"]
    workspace_id: str | None = None
    name: str
    description: str = ""
    business_track: WorkflowBusinessTrack
    default_workflow_name: str
    workflow_focus: str = ""
    recommended_next_step: str = ""
    tags: list[str] = Field(default_factory=list)
    node_count: int = Field(default=0, ge=0)
    node_types: list[str] = Field(default_factory=list)
    publish_count: int = Field(default=0, ge=0)
    definition: dict[str, Any] | None = None
    source: WorkflowLibrarySourceDescriptor
    created_from_workflow_id: str | None = None
    created_from_workflow_version: str | None = None
    archived: bool = False
    archived_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    tool_governance: WorkflowToolGovernanceSummary = Field(
        default_factory=WorkflowToolGovernanceSummary
    )
    source_governance: WorkspaceStarterSourceGovernance | None = None


class WorkflowLibrarySnapshot(BaseModel):
    nodes: list[WorkflowNodeCatalogItem] = Field(default_factory=list)
    starters: list[WorkflowLibraryStarterItem] = Field(default_factory=list)
    starter_source_lanes: list[WorkflowLibrarySourceLane] = Field(default_factory=list)
    node_source_lanes: list[WorkflowLibrarySourceLane] = Field(default_factory=list)
    tool_source_lanes: list[WorkflowLibrarySourceLane] = Field(default_factory=list)
    tools: list[PluginToolItem] = Field(default_factory=list)
