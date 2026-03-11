from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.run import RunDetail
from app.schemas.workflow import WorkflowPublishedEndpointRateLimitPolicy

PublishedEndpointLifecycleStatus = Literal["draft", "published", "offline"]
PublishedEndpointApiKeyStatus = Literal["active", "revoked"]
PublishedEndpointInvocationStatus = Literal["succeeded", "failed", "rejected"]
PublishedEndpointInvocationRequestSource = Literal["workflow", "alias", "path"]
PublishedEndpointInvocationTimeBucketGranularity = Literal["hour", "day"]


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
    rate_limit_policy: WorkflowPublishedEndpointRateLimitPolicy | None = None
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
    api_key_name: str | None = None
    api_key_prefix: str | None = None
    api_key_status: PublishedEndpointApiKeyStatus | None = None
    run_id: str | None = None
    run_status: str | None = None
    error_message: str | None = None
    request_preview: dict
    response_preview: dict | None = None
    duration_ms: int | None = None
    created_at: datetime
    finished_at: datetime | None = None


class PublishedEndpointInvocationFilters(BaseModel):
    status: PublishedEndpointInvocationStatus | None = None
    request_source: PublishedEndpointInvocationRequestSource | None = None
    api_key_id: str | None = None
    created_from: datetime | None = None
    created_to: datetime | None = None


class PublishedEndpointInvocationFacetItem(BaseModel):
    value: str
    count: int = 0
    last_invoked_at: datetime | None = None
    last_status: PublishedEndpointInvocationStatus | None = None


class PublishedEndpointInvocationApiKeyUsageItem(BaseModel):
    api_key_id: str
    name: str | None = None
    key_prefix: str | None = None
    status: PublishedEndpointApiKeyStatus | None = None
    invocation_count: int = 0
    last_invoked_at: datetime | None = None
    last_status: PublishedEndpointInvocationStatus | None = None


class PublishedEndpointInvocationFailureReasonItem(BaseModel):
    message: str
    count: int = 0
    last_invoked_at: datetime | None = None


class PublishedEndpointInvocationTimeBucketItem(BaseModel):
    bucket_start: datetime
    bucket_end: datetime
    total_count: int = 0
    succeeded_count: int = 0
    failed_count: int = 0
    rejected_count: int = 0


class PublishedEndpointInvocationFacets(BaseModel):
    status_counts: list[PublishedEndpointInvocationFacetItem] = Field(default_factory=list)
    request_source_counts: list[PublishedEndpointInvocationFacetItem] = Field(default_factory=list)
    api_key_usage: list[PublishedEndpointInvocationApiKeyUsageItem] = Field(default_factory=list)
    recent_failure_reasons: list[PublishedEndpointInvocationFailureReasonItem] = Field(
        default_factory=list
    )
    timeline_granularity: PublishedEndpointInvocationTimeBucketGranularity = "day"
    timeline: list[PublishedEndpointInvocationTimeBucketItem] = Field(default_factory=list)


class PublishedEndpointInvocationListResponse(BaseModel):
    filters: PublishedEndpointInvocationFilters
    summary: PublishedEndpointInvocationSummary
    facets: PublishedEndpointInvocationFacets
    items: list[PublishedEndpointInvocationItem]
