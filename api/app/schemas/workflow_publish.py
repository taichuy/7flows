from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.run import RunDetail

PublishedEndpointLifecycleStatus = Literal["draft", "published", "offline"]
PublishedEndpointApiKeyStatus = Literal["active", "revoked"]
PublishedEndpointInvocationStatus = Literal["succeeded", "failed", "rejected"]
PublishedEndpointInvocationRequestSource = Literal["workflow", "alias", "path"]


class WorkflowPublishedEndpointLifecycleUpdate(BaseModel):
    status: Literal["published", "offline"]


class WorkflowPublishedEndpointItem(BaseModel):
    id: str
    workflow_id: str
    workflow_version_id: str
    workflow_version: str
    target_workflow_version_id: str
    target_workflow_version: str
    compiled_blueprint_id: str
    endpoint_id: str
    endpoint_name: str
    endpoint_alias: str
    route_path: str
    protocol: str
    auth_mode: str
    streaming: bool
    lifecycle_status: PublishedEndpointLifecycleStatus
    input_schema: dict
    output_schema: dict | None = None
    published_at: datetime | None = None
    unpublished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    activity: PublishedEndpointInvocationSummary | None = None


class PublishedNativeRunRequest(BaseModel):
    input_payload: dict = Field(default_factory=dict)


class PublishedNativeRunResponse(BaseModel):
    binding_id: str
    endpoint_id: str
    endpoint_name: str
    endpoint_alias: str
    route_path: str
    workflow_id: str
    workflow_version: str
    compiled_blueprint_id: str
    run: RunDetail


class PublishedEndpointApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class PublishedEndpointApiKeyItem(BaseModel):
    id: str
    workflow_id: str
    endpoint_id: str
    name: str
    key_prefix: str
    status: PublishedEndpointApiKeyStatus
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PublishedEndpointApiKeyCreateResponse(PublishedEndpointApiKeyItem):
    secret_key: str


class PublishedEndpointInvocationSummary(BaseModel):
    total_count: int = 0
    succeeded_count: int = 0
    failed_count: int = 0
    rejected_count: int = 0
    last_invoked_at: datetime | None = None
    last_status: PublishedEndpointInvocationStatus | None = None
    last_run_id: str | None = None
    last_run_status: str | None = None


class PublishedEndpointInvocationItem(BaseModel):
    id: str
    workflow_id: str
    binding_id: str
    endpoint_id: str
    endpoint_alias: str
    route_path: str
    protocol: str
    auth_mode: str
    request_source: PublishedEndpointInvocationRequestSource
    status: PublishedEndpointInvocationStatus
    api_key_id: str | None = None
    run_id: str | None = None
    run_status: str | None = None
    error_message: str | None = None
    request_preview: dict
    response_preview: dict | None = None
    duration_ms: int | None = None
    created_at: datetime
    finished_at: datetime | None = None


class PublishedEndpointInvocationListResponse(BaseModel):
    summary: PublishedEndpointInvocationSummary
    items: list[PublishedEndpointInvocationItem]
