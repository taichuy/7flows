from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.workflow import WorkflowToolGovernanceSummary


class ServiceCheck(BaseModel):
    name: str
    status: str
    detail: str | None = None


class CompatibilityAdapterCheck(BaseModel):
    id: str
    ecosystem: str
    endpoint: str
    enabled: bool
    status: str
    detail: str | None = None


class SandboxBackendCapabilityCheck(BaseModel):
    supported_execution_classes: list[str] = Field(default_factory=list)
    supported_languages: list[str] = Field(default_factory=list)
    supported_profiles: list[str] = Field(default_factory=list)
    supported_dependency_modes: list[str] = Field(default_factory=list)
    supports_tool_execution: bool = False
    supports_builtin_package_sets: bool = False
    supports_backend_extensions: bool = False
    supports_network_policy: bool = False
    supports_filesystem_policy: bool = False


class SandboxBackendCheck(BaseModel):
    id: str
    kind: str
    endpoint: str
    enabled: bool
    status: str
    capability: SandboxBackendCapabilityCheck = Field(default_factory=SandboxBackendCapabilityCheck)
    detail: str | None = None


class SandboxExecutionClassReadinessCheck(BaseModel):
    execution_class: str
    available: bool
    backend_ids: list[str] = Field(default_factory=list)
    supported_languages: list[str] = Field(default_factory=list)
    supported_profiles: list[str] = Field(default_factory=list)
    supported_dependency_modes: list[str] = Field(default_factory=list)
    supports_tool_execution: bool = False
    supports_builtin_package_sets: bool = False
    supports_backend_extensions: bool = False
    supports_network_policy: bool = False
    supports_filesystem_policy: bool = False
    reason: str | None = None


class SandboxReadinessCheck(BaseModel):
    enabled_backend_count: int = 0
    healthy_backend_count: int = 0
    degraded_backend_count: int = 0
    offline_backend_count: int = 0
    execution_classes: list[SandboxExecutionClassReadinessCheck] = Field(default_factory=list)
    supported_languages: list[str] = Field(default_factory=list)
    supported_profiles: list[str] = Field(default_factory=list)
    supported_dependency_modes: list[str] = Field(default_factory=list)
    supports_tool_execution: bool = False
    supports_builtin_package_sets: bool = False
    supports_backend_extensions: bool = False
    supports_network_policy: bool = False
    supports_filesystem_policy: bool = False
    affected_run_count: int = 0
    affected_workflow_count: int = 0
    primary_blocker_kind: str | None = None
    recommended_action: SystemOverviewRecommendedAction | None = None


class PluginToolCheck(BaseModel):
    id: str
    name: str
    ecosystem: str
    source: str
    callable: bool


class RuntimeActivitySummary(BaseModel):
    recent_run_count: int = 0
    recent_event_count: int = 0
    run_statuses: dict[str, int] = Field(default_factory=dict)
    event_types: dict[str, int] = Field(default_factory=dict)


class RecentRunCheck(BaseModel):
    id: str
    workflow_id: str
    workflow_name: str | None = None
    workflow_version: str
    status: str
    created_at: datetime
    finished_at: datetime | None = None
    event_count: int = 0
    tool_governance: WorkflowToolGovernanceSummary = Field(
        default_factory=WorkflowToolGovernanceSummary
    )


class RecentRunEventCheck(BaseModel):
    id: int
    run_id: str
    node_run_id: str | None = None
    event_type: str
    payload_keys: list[str] = Field(default_factory=list)
    payload_preview: str = ""
    payload_size: int = 0
    created_at: datetime


class RuntimeActivityCheck(BaseModel):
    summary: RuntimeActivitySummary = Field(default_factory=RuntimeActivitySummary)
    recent_runs: list[RecentRunCheck] = Field(default_factory=list)
    recent_events: list[RecentRunEventCheck] = Field(default_factory=list)


class CallbackWaitingAutomationStepCheck(BaseModel):
    key: str
    label: str
    task: str
    source: str
    enabled: bool
    interval_seconds: int | None = None
    detail: str = ""
    scheduler_health: CallbackWaitingAutomationStepSchedulerHealthCheck = Field(
        default_factory=lambda: CallbackWaitingAutomationStepSchedulerHealthCheck()
    )


class CallbackWaitingAutomationStepSchedulerHealthCheck(BaseModel):
    health_status: str = "unknown"
    detail: str = ""
    last_status: str | None = None
    last_started_at: datetime | None = None
    last_finished_at: datetime | None = None
    matched_count: int = 0
    affected_count: int = 0


class SystemOverviewRecommendedAction(BaseModel):
    kind: str
    entry_key: str
    href: str
    label: str


class CallbackWaitingAutomationCheck(BaseModel):
    status: str = "disabled"
    scheduler_required: bool = True
    detail: str = ""
    scheduler_health_status: str = "unknown"
    scheduler_health_detail: str = ""
    steps: list[CallbackWaitingAutomationStepCheck] = Field(default_factory=list)
    affected_run_count: int = 0
    affected_workflow_count: int = 0
    primary_blocker_kind: str | None = None
    recommended_action: SystemOverviewRecommendedAction | None = None


class SystemOverview(BaseModel):
    status: str
    environment: str
    services: list[ServiceCheck]
    capabilities: list[str]
    plugin_adapters: list[CompatibilityAdapterCheck] = Field(default_factory=list)
    sandbox_backends: list[SandboxBackendCheck] = Field(default_factory=list)
    sandbox_readiness: SandboxReadinessCheck = Field(default_factory=SandboxReadinessCheck)
    plugin_tools: list[PluginToolCheck] = Field(default_factory=list)
    runtime_activity: RuntimeActivityCheck = Field(default_factory=RuntimeActivityCheck)
    callback_waiting_automation: CallbackWaitingAutomationCheck = Field(
        default_factory=CallbackWaitingAutomationCheck
    )
