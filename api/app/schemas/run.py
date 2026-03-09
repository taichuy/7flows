from datetime import datetime

from pydantic import BaseModel, Field


class RunCreate(BaseModel):
    input_payload: dict = Field(default_factory=dict)


class NodeRunItem(BaseModel):
    id: str
    node_id: str
    node_name: str
    node_type: str
    status: str
    input_payload: dict
    output_payload: dict | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class RunEventItem(BaseModel):
    id: int
    run_id: str
    node_run_id: str | None = None
    event_type: str
    payload: dict
    created_at: datetime


class RunDetail(BaseModel):
    id: str
    workflow_id: str
    status: str
    input_payload: dict
    output_payload: dict | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    node_runs: list[NodeRunItem]
    events: list[RunEventItem]
