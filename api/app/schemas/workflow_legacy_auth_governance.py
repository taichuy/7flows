from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.workflow_published_endpoint import (
    SUPPORTED_PUBLISHED_ENDPOINT_AUTH_MODES,
)

PublishedEndpointLifecycleStatus = Literal["draft", "published", "offline"]
WorkflowPublishedEndpointLegacyAuthGovernanceChecklistKey = Literal[
    "draft_cleanup",
    "published_follow_up",
    "offline_inventory",
]
WorkflowPublishedEndpointLegacyAuthGovernanceChecklistTone = Literal[
    "ready",
    "manual",
    "inventory",
]
RETIRED_LEGACY_PUBLISHED_ENDPOINT_AUTH_MODES = ("token",)


class WorkflowPublishedEndpointLegacyAuthModeContract(BaseModel):
    supported_auth_modes: list[str] = Field(
        default_factory=lambda: list(SUPPORTED_PUBLISHED_ENDPOINT_AUTH_MODES)
    )
    retired_legacy_auth_modes: list[str] = Field(
        default_factory=lambda: list(RETIRED_LEGACY_PUBLISHED_ENDPOINT_AUTH_MODES)
    )
    summary: str = (
        "当前 publish gateway 只支持 durable authMode=api_key/internal；token "
        "仅作为 legacy inventory 出现在治理 handoff 中。"
    )
    follow_up: str = (
        "先把 workflow draft endpoint 切回 api_key/internal 并保存，再补发 replacement "
        "binding，最后清理 draft/offline legacy backlog。"
    )


class WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem(BaseModel):
    workflow_id: str
    workflow_name: str
    binding_id: str
    endpoint_id: str
    endpoint_name: str
    workflow_version: str
    lifecycle_status: PublishedEndpointLifecycleStatus
    auth_mode: str


class WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem(BaseModel):
    key: WorkflowPublishedEndpointLegacyAuthGovernanceChecklistKey
    title: str
    tone: WorkflowPublishedEndpointLegacyAuthGovernanceChecklistTone
    tone_label: str
    count: int
    detail: str


class WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem(BaseModel):
    workflow_id: str
    workflow_name: str
    binding_count: int
    draft_candidate_count: int
    published_blocker_count: int
    offline_inventory_count: int


class WorkflowPublishedEndpointLegacyAuthGovernanceSummary(BaseModel):
    draft_candidate_count: int = 0
    published_blocker_count: int = 0
    offline_inventory_count: int = 0


class WorkflowPublishedEndpointLegacyAuthGovernanceBuckets(BaseModel):
    draft_candidates: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem] = Field(
        default_factory=list
    )
    published_blockers: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem] = Field(
        default_factory=list
    )
    offline_inventory: list[WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem] = Field(
        default_factory=list
    )


class WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot(BaseModel):
    generated_at: datetime
    workflow_count: int = 0
    binding_count: int = 0
    auth_mode_contract: WorkflowPublishedEndpointLegacyAuthModeContract = Field(
        default_factory=WorkflowPublishedEndpointLegacyAuthModeContract
    )
    summary: WorkflowPublishedEndpointLegacyAuthGovernanceSummary = Field(
        default_factory=WorkflowPublishedEndpointLegacyAuthGovernanceSummary
    )
    checklist: list[WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem] = Field(
        default_factory=list
    )
    workflows: list[WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem] = Field(
        default_factory=list
    )
    buckets: WorkflowPublishedEndpointLegacyAuthGovernanceBuckets = Field(
        default_factory=WorkflowPublishedEndpointLegacyAuthGovernanceBuckets
    )
