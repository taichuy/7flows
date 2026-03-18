from pydantic import BaseModel, Field


class OperatorRunSnapshot(BaseModel):
    workflow_id: str | None = None
    status: str | None = None
    current_node_id: str | None = None
    waiting_reason: str | None = None


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
