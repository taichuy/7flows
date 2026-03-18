from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.explanations import SignalFollowUpExplanation
from app.schemas.operator_follow_up import OperatorRunFollowUpSummary
from app.schemas.sensitive_access import CallbackBlockerDeltaSummary


class RunCreate(BaseModel):
    input_payload: dict = Field(default_factory=dict)


class RunCallbackToolResult(BaseModel):
    status: Literal["success", "failed", "partial"] = "success"
    content_type: str = "json"
    summary: str = ""
    structured: dict = Field(default_factory=dict)
    meta: dict = Field(default_factory=dict)
    error_message: str | None = None


class RunCallbackRequest(BaseModel):
    source: str = "external_callback"
    result: RunCallbackToolResult


class RunResumeRequest(BaseModel):
    source: str = Field(default="manual_api", min_length=1, max_length=64)
    reason: str | None = Field(default=None, max_length=255)


class CallbackTicketCleanupRequest(BaseModel):
    source: str = Field(default="manual_cleanup", min_length=1, max_length=64)
    limit: int | None = Field(default=None, ge=1, le=1000)
    dry_run: bool = False
    schedule_resumes: bool = True
    run_id: str | None = Field(default=None, min_length=1, max_length=255)
    node_run_id: str | None = Field(default=None, min_length=1, max_length=255)


class CallbackTicketCleanupItem(BaseModel):
    ticket: str
    run_id: str
    node_run_id: str
    node_id: str | None = None
    tool_call_id: str | None = None
    tool_id: str | None = None
    tool_call_index: int = 0
    waiting_status: str
    status: str
    reason: str | None = None
    created_at: datetime
    expires_at: datetime | None = None
    expired_at: datetime | None = None


class CallbackTicketCleanupResponse(BaseModel):
    source: str
    dry_run: bool = False
    limit: int
    matched_count: int = 0
    expired_count: int = 0
    scheduled_resume_count: int = 0
    terminated_count: int = 0
    run_ids: list[str] = Field(default_factory=list)
    scheduled_resume_run_ids: list[str] = Field(default_factory=list)
    terminated_run_ids: list[str] = Field(default_factory=list)
    items: list[CallbackTicketCleanupItem] = Field(default_factory=list)
    run_follow_up: OperatorRunFollowUpSummary | None = None


class NodeRunItem(BaseModel):
    id: str
    node_id: str
    node_name: str
    node_type: str
    status: str
    phase: str | None = None
    retry_count: int = 0
    input_payload: dict
    output_payload: dict | None = None
    checkpoint_payload: dict = Field(default_factory=dict)
    working_context: dict = Field(default_factory=dict)
    evidence_context: dict | None = None
    artifact_refs: list[str] = Field(default_factory=list)
    error_message: str | None = None
    waiting_reason: str | None = None
    started_at: datetime | None = None
    phase_started_at: datetime | None = None
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


class RunArtifactItem(BaseModel):
    id: str
    run_id: str
    node_run_id: str | None = None
    artifact_kind: str
    content_type: str
    summary: str
    uri: str
    metadata_payload: dict = Field(default_factory=dict)
    created_at: datetime


class ToolCallItem(BaseModel):
    id: str
    run_id: str
    node_run_id: str
    tool_id: str
    tool_name: str
    phase: str
    status: str
    request_summary: str
    response_summary: str | None = None
    raw_ref: str | None = None
    latency_ms: int = 0
    retry_count: int = 0
    error_message: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


class AICallItem(BaseModel):
    id: str
    run_id: str
    node_run_id: str
    role: str
    status: str
    provider: str | None = None
    model_id: str | None = None
    input_summary: str
    output_summary: str | None = None
    input_ref: str | None = None
    output_ref: str | None = None
    latency_ms: int = 0
    token_usage: dict = Field(default_factory=dict)
    cost_payload: dict = Field(default_factory=dict)
    assistant: bool = False
    error_message: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


class RunDetail(BaseModel):
    id: str
    workflow_id: str
    workflow_version: str
    compiled_blueprint_id: str | None = None
    status: str
    input_payload: dict
    output_payload: dict | None = None
    checkpoint_payload: dict = Field(default_factory=dict)
    error_message: str | None = None
    current_node_id: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    event_count: int = 0
    event_type_counts: dict[str, int] = Field(default_factory=dict)
    first_event_at: datetime | None = None
    last_event_at: datetime | None = None
    node_runs: list[NodeRunItem]
    artifacts: list[RunArtifactItem] = Field(default_factory=list)
    tool_calls: list[ToolCallItem] = Field(default_factory=list)
    ai_calls: list[AICallItem] = Field(default_factory=list)
    events: list[RunEventItem] = Field(default_factory=list)


class RunResumeResponse(BaseModel):
    run: RunDetail
    outcome_explanation: SignalFollowUpExplanation | None = None
    callback_blocker_delta: CallbackBlockerDeltaSummary | None = None
    run_follow_up: OperatorRunFollowUpSummary | None = None


class RunCallbackResponse(BaseModel):
    callback_status: Literal["accepted", "already_consumed", "ignored", "expired"]
    ticket: str
    run_id: str
    node_run_id: str
    run: RunDetail


class WorkflowRunListItem(BaseModel):
    id: str
    workflow_id: str
    workflow_version: str
    status: str
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    node_run_count: int = 0
    event_count: int = 0
    last_event_at: datetime | None = None
