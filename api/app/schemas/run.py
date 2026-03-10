from datetime import datetime
from typing import Literal

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


class RunTraceEventItem(RunEventItem):
    sequence: int
    replay_offset_ms: int


class RunTraceFilters(BaseModel):
    cursor: str | None = None
    event_type: str | None = None
    node_run_id: str | None = None
    created_after: datetime | None = None
    created_before: datetime | None = None
    payload_key: str | None = None
    before_event_id: int | None = None
    after_event_id: int | None = None
    limit: int = 200
    order: Literal["asc", "desc"] = "asc"


class RunTraceSummary(BaseModel):
    total_event_count: int = 0
    matched_event_count: int = 0
    returned_event_count: int = 0
    available_event_types: list[str] = Field(default_factory=list)
    available_node_run_ids: list[str] = Field(default_factory=list)
    available_payload_keys: list[str] = Field(default_factory=list)
    trace_started_at: datetime | None = None
    trace_finished_at: datetime | None = None
    matched_started_at: datetime | None = None
    matched_finished_at: datetime | None = None
    returned_started_at: datetime | None = None
    returned_finished_at: datetime | None = None
    returned_duration_ms: int = 0
    next_cursor: str | None = None
    prev_cursor: str | None = None
    first_event_id: int | None = None
    last_event_id: int | None = None
    has_more: bool = False


class RunTrace(BaseModel):
    run_id: str
    filters: RunTraceFilters
    summary: RunTraceSummary = Field(default_factory=RunTraceSummary)
    events: list[RunTraceEventItem] = Field(default_factory=list)


class RunDetail(BaseModel):
    id: str
    workflow_id: str
    workflow_version: str
    status: str
    input_payload: dict
    output_payload: dict | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    event_count: int = 0
    event_type_counts: dict[str, int] = Field(default_factory=dict)
    first_event_at: datetime | None = None
    last_event_at: datetime | None = None
    node_runs: list[NodeRunItem]
    events: list[RunEventItem] = Field(default_factory=list)
