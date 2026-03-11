from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.run import RunDetail

PublishedEndpointLifecycleStatus = Literal["draft", "published", "offline"]
PublishedEndpointApiKeyStatus = Literal["active", "revoked"]


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
