from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.run import RunDetail

PublishedEndpointLifecycleStatus = Literal["draft", "published", "offline"]


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
    workflow_id: str
    workflow_version: str
    compiled_blueprint_id: str
    run: RunDetail
