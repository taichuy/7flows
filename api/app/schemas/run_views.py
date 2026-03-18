from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.explanations import SignalFollowUpExplanation
from app.schemas.run import AICallItem, RunArtifactItem, ToolCallItem
from app.schemas.sensitive_access import SensitiveAccessTimelineEntryItem


class RunCallbackTicketItem(BaseModel):
    ticket: str
    run_id: str
    node_run_id: str
    tool_call_id: str | None = None
    tool_id: str | None = None
    tool_call_index: int = 0
    waiting_status: str
    status: str
    reason: str | None = None
    callback_payload: dict | None = None
    created_at: datetime
    expires_at: datetime | None = None
    consumed_at: datetime | None = None
    canceled_at: datetime | None = None
    expired_at: datetime | None = None


class RunCallbackWaitingSummary(BaseModel):
    node_count: int = 0
    terminated_node_count: int = 0
    issued_ticket_count: int = 0
    expired_ticket_count: int = 0
    consumed_ticket_count: int = 0
    canceled_ticket_count: int = 0
    late_callback_count: int = 0
    resume_schedule_count: int = 0
    scheduled_resume_pending_node_count: int = 0
    scheduled_resume_requeued_node_count: int = 0
    resume_source_counts: dict[str, int] = Field(default_factory=dict)
    scheduled_resume_source_counts: dict[str, int] = Field(default_factory=dict)
    termination_reason_counts: dict[str, int] = Field(default_factory=dict)


class RunExecutionSummary(BaseModel):
    node_run_count: int = 0
    waiting_node_count: int = 0
    errored_node_count: int = 0
    execution_dispatched_node_count: int = 0
    execution_fallback_node_count: int = 0
    execution_blocked_node_count: int = 0
    execution_unavailable_node_count: int = 0
    artifact_count: int = 0
    tool_call_count: int = 0
    ai_call_count: int = 0
    assistant_call_count: int = 0
    callback_ticket_count: int = 0
    skill_reference_load_count: int = 0
    sensitive_access_request_count: int = 0
    sensitive_access_approval_ticket_count: int = 0
    sensitive_access_notification_count: int = 0
    artifact_kind_counts: dict[str, int] = Field(default_factory=dict)
    tool_status_counts: dict[str, int] = Field(default_factory=dict)
    ai_role_counts: dict[str, int] = Field(default_factory=dict)
    execution_requested_class_counts: dict[str, int] = Field(default_factory=dict)
    execution_effective_class_counts: dict[str, int] = Field(default_factory=dict)
    execution_executor_ref_counts: dict[str, int] = Field(default_factory=dict)
    execution_sandbox_backend_counts: dict[str, int] = Field(default_factory=dict)
    skill_reference_phase_counts: dict[str, int] = Field(default_factory=dict)
    skill_reference_source_counts: dict[str, int] = Field(default_factory=dict)
    callback_ticket_status_counts: dict[str, int] = Field(default_factory=dict)
    sensitive_access_decision_counts: dict[str, int] = Field(default_factory=dict)
    sensitive_access_approval_status_counts: dict[str, int] = Field(default_factory=dict)
    sensitive_access_notification_status_counts: dict[str, int] = Field(default_factory=dict)
    callback_waiting: RunCallbackWaitingSummary = Field(default_factory=RunCallbackWaitingSummary)


class CallbackWaitingLifecycleSummary(BaseModel):
    wait_cycle_count: int = 0
    issued_ticket_count: int = 0
    expired_ticket_count: int = 0
    consumed_ticket_count: int = 0
    canceled_ticket_count: int = 0
    late_callback_count: int = 0
    resume_schedule_count: int = 0
    max_expired_ticket_count: int = 0
    terminated: bool = False
    termination_reason: str | None = None
    terminated_at: datetime | None = None
    last_ticket_status: str | None = None
    last_ticket_reason: str | None = None
    last_ticket_updated_at: datetime | None = None
    last_late_callback_status: str | None = None
    last_late_callback_reason: str | None = None
    last_late_callback_at: datetime | None = None
    last_resume_delay_seconds: float | None = None
    last_resume_reason: str | None = None
    last_resume_source: str | None = None
    last_resume_backoff_attempt: int = 0


class SkillReferenceLoadReferenceItem(BaseModel):
    skill_id: str
    skill_name: str | None = None
    reference_id: str
    reference_name: str | None = None
    load_source: str
    fetch_reason: str | None = None
    fetch_request_index: int | None = None
    fetch_request_total: int | None = None
    retrieval_http_path: str | None = None
    retrieval_mcp_method: str | None = None
    retrieval_mcp_params: dict[str, str] = Field(default_factory=dict)


class SkillReferenceLoadItem(BaseModel):
    phase: str
    references: list[SkillReferenceLoadReferenceItem] = Field(default_factory=list)


RunExecutionFocusReason = Literal[
    "blocking_node_run",
    "blocked_execution",
    "current_node",
    "fallback_node",
]


class RunExecutionSkillTraceNodeItem(BaseModel):
    node_run_id: str
    node_id: str | None = None
    node_name: str | None = None
    reference_count: int = 0
    loads: list[SkillReferenceLoadItem] = Field(default_factory=list)


class RunExecutionSkillTrace(BaseModel):
    scope: Literal["execution_focus_node", "run"]
    reference_count: int = 0
    phase_counts: dict[str, int] = Field(default_factory=dict)
    source_counts: dict[str, int] = Field(default_factory=dict)
    nodes: list[RunExecutionSkillTraceNodeItem] = Field(default_factory=list)


RunExecutionFocusExplanation = SignalFollowUpExplanation


class RunExecutionNodeItem(BaseModel):
    node_run_id: str
    node_id: str
    node_name: str
    node_type: str
    status: str
    phase: str | None = None
    execution_class: str
    execution_source: str
    execution_profile: str | None = None
    execution_timeout_ms: int | None = None
    execution_network_policy: str | None = None
    execution_filesystem_policy: str | None = None
    execution_dependency_mode: str | None = None
    execution_builtin_package_set: str | None = None
    execution_dependency_ref: str | None = None
    execution_backend_extensions: dict | None = None
    execution_dispatched_count: int = 0
    execution_fallback_count: int = 0
    execution_blocked_count: int = 0
    execution_unavailable_count: int = 0
    effective_execution_class: str | None = None
    execution_executor_ref: str | None = None
    execution_sandbox_backend_id: str | None = None
    execution_sandbox_backend_executor_ref: str | None = None
    execution_blocking_reason: str | None = None
    execution_fallback_reason: str | None = None
    retry_count: int = 0
    waiting_reason: str | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    event_count: int = 0
    event_type_counts: dict[str, int] = Field(default_factory=dict)
    last_event_type: str | None = None
    artifact_refs: list[str] = Field(default_factory=list)
    artifacts: list[RunArtifactItem] = Field(default_factory=list)
    tool_calls: list[ToolCallItem] = Field(default_factory=list)
    ai_calls: list[AICallItem] = Field(default_factory=list)
    callback_tickets: list[RunCallbackTicketItem] = Field(default_factory=list)
    skill_reference_load_count: int = 0
    skill_reference_loads: list[SkillReferenceLoadItem] = Field(default_factory=list)
    sensitive_access_entries: list[SensitiveAccessTimelineEntryItem] = Field(
        default_factory=list
    )
    callback_waiting_lifecycle: CallbackWaitingLifecycleSummary | None = None
    callback_waiting_explanation: RunExecutionFocusExplanation | None = None
    scheduled_resume_delay_seconds: float | None = None
    scheduled_resume_reason: str | None = None
    scheduled_resume_source: str | None = None
    scheduled_waiting_status: str | None = None
    scheduled_resume_scheduled_at: datetime | None = None
    scheduled_resume_due_at: datetime | None = None
    scheduled_resume_requeued_at: datetime | None = None
    scheduled_resume_requeue_source: str | None = None


class RunExecutionView(BaseModel):
    run_id: str
    workflow_id: str
    workflow_version: str
    compiled_blueprint_id: str | None = None
    status: str
    summary: RunExecutionSummary = Field(default_factory=RunExecutionSummary)
    blocking_node_run_id: str | None = None
    execution_focus_reason: RunExecutionFocusReason | None = None
    execution_focus_node: RunExecutionNodeItem | None = None
    execution_focus_explanation: RunExecutionFocusExplanation | None = None
    skill_trace: RunExecutionSkillTrace | None = None
    nodes: list[RunExecutionNodeItem] = Field(default_factory=list)


class EvidenceEntryItem(BaseModel):
    title: str
    detail: str
    source_ref: str | None = None


class RunEvidenceSummary(BaseModel):
    node_count: int = 0
    artifact_count: int = 0
    tool_call_count: int = 0
    assistant_call_count: int = 0


class RunEvidenceNodeItem(BaseModel):
    node_run_id: str
    node_id: str
    node_name: str
    node_type: str
    status: str
    phase: str | None = None
    summary: str = ""
    key_points: list[str] = Field(default_factory=list)
    evidence: list[EvidenceEntryItem] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
    recommended_focus: list[str] = Field(default_factory=list)
    confidence: float | None = None
    artifact_refs: list[str] = Field(default_factory=list)
    decision_output: dict = Field(default_factory=dict)
    tool_calls: list[ToolCallItem] = Field(default_factory=list)
    assistant_calls: list[AICallItem] = Field(default_factory=list)
    supporting_artifacts: list[RunArtifactItem] = Field(default_factory=list)


class RunEvidenceView(BaseModel):
    run_id: str
    workflow_id: str
    workflow_version: str
    status: str
    summary: RunEvidenceSummary = Field(default_factory=RunEvidenceSummary)
    nodes: list[RunEvidenceNodeItem] = Field(default_factory=list)
