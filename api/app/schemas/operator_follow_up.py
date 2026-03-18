from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.explanations import SignalFollowUpExplanation


OperatorRunExecutionFocusReason = Literal[
    "blocking_node_run",
    "blocked_execution",
    "current_node",
    "fallback_node",
]


class OperatorRunSnapshot(BaseModel):
    workflow_id: str | None = None
    status: str | None = None
    current_node_id: str | None = None
    waiting_reason: str | None = None
    execution_focus_reason: OperatorRunExecutionFocusReason | None = None
    execution_focus_node_id: str | None = None
    execution_focus_node_run_id: str | None = None
    execution_focus_explanation: SignalFollowUpExplanation | None = None


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
