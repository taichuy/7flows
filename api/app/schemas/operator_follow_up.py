from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.explanations import SignalFollowUpExplanation

OperatorRunExecutionFocusReason = Literal[
    "blocking_node_run",
    "blocked_execution",
    "current_node",
    "fallback_node",
]


class OperatorRunFocusArtifactItem(BaseModel):
    artifact_kind: str
    content_type: str
    summary: str
    uri: str


class OperatorRunFocusToolCallItem(BaseModel):
    id: str
    tool_id: str
    tool_name: str
    phase: str
    status: str
    effective_execution_class: str | None = None
    execution_sandbox_backend_id: str | None = None
    execution_sandbox_runner_kind: str | None = None
    execution_blocking_reason: str | None = None
    execution_fallback_reason: str | None = None
    response_summary: str | None = None
    response_content_type: str | None = None
    raw_ref: str | None = None


class OperatorRunFocusSkillReferenceItem(BaseModel):
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


class OperatorRunFocusSkillLoadItem(BaseModel):
    phase: str
    references: list[OperatorRunFocusSkillReferenceItem] = Field(default_factory=list)


class OperatorRunFocusSkillTrace(BaseModel):
    reference_count: int = 0
    phase_counts: dict[str, int] = Field(default_factory=dict)
    source_counts: dict[str, int] = Field(default_factory=dict)
    loads: list[OperatorRunFocusSkillLoadItem] = Field(default_factory=list)


class OperatorRunSnapshot(BaseModel):
    workflow_id: str | None = None
    status: str | None = None
    current_node_id: str | None = None
    waiting_reason: str | None = None
    execution_focus_reason: OperatorRunExecutionFocusReason | None = None
    execution_focus_node_id: str | None = None
    execution_focus_node_run_id: str | None = None
    execution_focus_node_name: str | None = None
    execution_focus_node_type: str | None = None
    execution_focus_explanation: SignalFollowUpExplanation | None = None
    callback_waiting_explanation: SignalFollowUpExplanation | None = None
    execution_focus_artifact_count: int = 0
    execution_focus_artifact_ref_count: int = 0
    execution_focus_tool_call_count: int = 0
    execution_focus_raw_ref_count: int = 0
    execution_focus_artifact_refs: list[str] = Field(default_factory=list)
    execution_focus_artifacts: list[OperatorRunFocusArtifactItem] = Field(
        default_factory=list
    )
    execution_focus_tool_calls: list[OperatorRunFocusToolCallItem] = Field(
        default_factory=list
    )
    execution_focus_skill_trace: OperatorRunFocusSkillTrace | None = None


class OperatorRunSnapshotSample(BaseModel):
    run_id: str
    snapshot: OperatorRunSnapshot | None = None


class OperatorRunFollowUpSummary(BaseModel):
    affected_run_count: int = 0
    sampled_run_count: int = 0
    waiting_run_count: int = 0
    running_run_count: int = 0
    succeeded_run_count: int = 0
    failed_run_count: int = 0
    unknown_run_count: int = 0
    sampled_runs: list[OperatorRunSnapshotSample] = Field(default_factory=list)
    explanation: SignalFollowUpExplanation | None = None
