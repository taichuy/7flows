import json
from collections import Counter
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import boto3
import redis
from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import check_database, get_db
from app.models.run import NodeRun, Run, RunEvent
from app.models.workflow import Workflow
from app.schemas.system import (
    CallbackWaitingAutomationCheck,
    CallbackWaitingAutomationStepCheck,
    CallbackWaitingAutomationStepSchedulerHealthCheck,
    CompatibilityAdapterCheck,
    PluginToolCheck,
    RecentRunCheck,
    RecentRunEventCheck,
    RuntimeActivityCheck,
    SandboxBackendCapabilityCheck,
    SandboxBackendCheck,
    SandboxExecutionClassReadinessCheck,
    SandboxReadinessCheck,
    ServiceCheck,
    SystemOverviewRecommendedAction,
    SystemOverview,
)
from app.services.plugin_runtime import (
    get_compatibility_adapter_health_checker,
    get_plugin_registry,
)
from app.services.runtime_execution_policy import resolve_execution_policy
from app.services.sandbox_backends import (
    get_sandbox_backend_health_checker,
    get_sandbox_backend_registry,
)
from app.services.scheduled_task_activity import ScheduledTaskActivityService
from app.services.workflow_definition_governance import (
    collect_workflow_definition_tool_ids,
    summarize_workflow_definition_tool_governance,
)
from app.services.workflow_views import load_workflow_view_tool_index

router = APIRouter(tags=["system"])

_RECENT_RUN_LIMIT = 5
_RECENT_EVENT_LIMIT = 8
_PAYLOAD_PREVIEW_LIMIT = 180
_SANDBOX_EXECUTION_CLASSES = ("sandbox", "microvm")
_OPERABLE_SANDBOX_STATUSES = {"healthy", "degraded"}
_ACTIVE_RUN_STATUSES = ("queued", "running", "waiting")
_SCHEDULED_TASK_ACTIVITY = ScheduledTaskActivityService()


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _normalize_execution_class(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized not in {"inline", "subprocess", "sandbox", "microvm"}:
        return None
    return normalized


def _build_tool_default_execution_class_lookup(registry) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for tool in registry.list_tools():
        normalized = _normalize_execution_class(
            getattr(tool, "default_execution_class", None)
        )
        if normalized is None:
            continue
        lookup[str(tool.id)] = normalized
    return lookup


def _collect_workflow_required_execution_classes(
    definition: dict | None,
    *,
    tool_default_execution_class_lookup: dict[str, str],
) -> set[str]:
    required_execution_classes: set[str] = set()
    if not isinstance(definition, dict):
        return required_execution_classes

    nodes = definition.get("nodes")
    if isinstance(nodes, list):
        for node in nodes:
            if not isinstance(node, dict):
                continue
            required_execution_classes.add(resolve_execution_policy(node).execution_class)

    for tool_id in collect_workflow_definition_tool_ids(definition):
        execution_class = tool_default_execution_class_lookup.get(tool_id)
        if execution_class is not None:
            required_execution_classes.add(execution_class)

    return required_execution_classes


def _build_sandbox_recommended_action(
    *,
    primary_blocker_kind: str | None,
    affected_run_count: int,
    affected_workflow_count: int,
) -> SystemOverviewRecommendedAction | None:
    if primary_blocker_kind is None:
        return None

    label = (
        "查看受强隔离阻断的 workflows"
        if primary_blocker_kind == "execution_class_blocked"
        and (affected_run_count > 0 or affected_workflow_count > 0)
        else "查看 workflow 隔离需求"
    )
    return SystemOverviewRecommendedAction(
        kind=primary_blocker_kind,
        entry_key="workflowLibrary",
        href="/workflows",
        label=label,
    )


def _apply_sandbox_follow_up_contract(
    *,
    readiness: SandboxReadinessCheck,
    db: Session,
    registry,
) -> SandboxReadinessCheck:
    blocked_execution_classes = {
        execution_class.execution_class
        for execution_class in readiness.execution_classes
        if not execution_class.available
    }
    primary_blocker_kind: str | None = None
    if blocked_execution_classes:
        primary_blocker_kind = "execution_class_blocked"
    elif readiness.offline_backend_count > 0:
        primary_blocker_kind = "backend_offline"
    elif readiness.degraded_backend_count > 0:
        primary_blocker_kind = "backend_degraded"

    affected_workflow_ids: set[str] = set()
    affected_run_ids: set[str] = set()
    if blocked_execution_classes:
        tool_default_execution_class_lookup = _build_tool_default_execution_class_lookup(
            registry
        )
        workflows = db.query(Workflow).all()
        for workflow in workflows:
            required_execution_classes = _collect_workflow_required_execution_classes(
                workflow.definition,
                tool_default_execution_class_lookup=tool_default_execution_class_lookup,
            )
            if blocked_execution_classes.intersection(required_execution_classes):
                affected_workflow_ids.add(workflow.id)

        if affected_workflow_ids:
            active_runs = (
                db.query(Run.id)
                .filter(
                    Run.workflow_id.in_(sorted(affected_workflow_ids)),
                    Run.status.in_(_ACTIVE_RUN_STATUSES),
                )
                .all()
            )
            affected_run_ids = {run_id for (run_id,) in active_runs if run_id}

    readiness.affected_run_count = len(affected_run_ids)
    readiness.affected_workflow_count = len(affected_workflow_ids)
    readiness.primary_blocker_kind = primary_blocker_kind
    readiness.recommended_action = _build_sandbox_recommended_action(
        primary_blocker_kind=primary_blocker_kind,
        affected_run_count=readiness.affected_run_count,
        affected_workflow_count=readiness.affected_workflow_count,
    )
    return readiness


def _count_callback_attention_steps(
    automation: CallbackWaitingAutomationCheck,
) -> int:
    return sum(
        1
        for step in automation.steps
        if step.enabled and step.scheduler_health.health_status != "healthy"
    )


def _build_callback_recommended_action(
    *,
    primary_blocker_kind: str | None,
    affected_run_count: int,
) -> SystemOverviewRecommendedAction | None:
    if primary_blocker_kind is None:
        return None

    label = (
        "查看 waiting callback runs"
        if affected_run_count > 0
        else "查看 callback recovery 状态"
    )
    return SystemOverviewRecommendedAction(
        kind=primary_blocker_kind,
        entry_key="runLibrary",
        href="/runs",
        label=label,
    )


def _apply_callback_follow_up_contract(
    *,
    automation: CallbackWaitingAutomationCheck,
    db: Session,
) -> CallbackWaitingAutomationCheck:
    waiting_callback_rows = (
        db.query(NodeRun.run_id, Run.workflow_id)
        .join(Run, Run.id == NodeRun.run_id)
        .filter(
            Run.status == "waiting",
            or_(
                NodeRun.status == "waiting_callback",
                NodeRun.phase == "waiting_callback",
            ),
        )
        .all()
    )
    affected_run_ids = {run_id for run_id, _workflow_id in waiting_callback_rows if run_id}
    affected_workflow_ids = {
        workflow_id
        for _run_id, workflow_id in waiting_callback_rows
        if workflow_id is not None and str(workflow_id).strip()
    }

    attention_step_count = _count_callback_attention_steps(automation)
    primary_blocker_kind: str | None = None
    if automation.scheduler_required and automation.status == "disabled":
        primary_blocker_kind = "automation_disabled"
    elif automation.scheduler_health_status in {"failed", "offline"}:
        primary_blocker_kind = "scheduler_unhealthy"
    elif (
        automation.status != "configured"
        or automation.scheduler_health_status != "healthy"
        or attention_step_count > 0
    ):
        primary_blocker_kind = "automation_degraded"

    automation.affected_run_count = len(affected_run_ids)
    automation.affected_workflow_count = len(affected_workflow_ids)
    automation.primary_blocker_kind = primary_blocker_kind
    automation.recommended_action = _build_callback_recommended_action(
        primary_blocker_kind=primary_blocker_kind,
        affected_run_count=automation.affected_run_count,
    )
    return automation


def _build_callback_step_scheduler_health(
    *,
    step: CallbackWaitingAutomationStepCheck,
    latest_run,
    now: datetime,
) -> CallbackWaitingAutomationStepSchedulerHealthCheck:
    if not step.enabled:
        return CallbackWaitingAutomationStepSchedulerHealthCheck(
            health_status="disabled",
            detail="当前未启用该周期任务，无需检查 scheduler 最近执行事实。",
        )

    if latest_run is None:
        return CallbackWaitingAutomationStepSchedulerHealthCheck(
            health_status="stale",
            detail=(
                "调度已配置，但还没有记录到最近执行事实；"
                "无法确认 scheduler / worker 是否真的跑过。"
            ),
        )

    last_started_at = _normalize_datetime(latest_run.started_at)
    last_finished_at = _normalize_datetime(latest_run.finished_at)
    last_seen_at = last_finished_at or last_started_at
    interval_seconds = max(int(step.interval_seconds or 0), 0)
    stale_after = timedelta(seconds=max(interval_seconds * 2, 60))

    base = CallbackWaitingAutomationStepSchedulerHealthCheck(
        last_status=latest_run.status,
        last_started_at=last_started_at,
        last_finished_at=last_finished_at,
        matched_count=max(int(latest_run.matched_count or 0), 0),
        affected_count=max(int(latest_run.affected_count or 0), 0),
    )

    if latest_run.status == "failed":
        base.health_status = "failed"
        base.detail = (
            latest_run.detail
            or "最近一次 scheduler 执行失败；需要检查 beat / worker 日志和任务异常。"
        )
        return base

    if latest_run.status == "running":
        if last_started_at is not None and now - last_started_at <= stale_after:
            base.health_status = "running"
            base.detail = "最近一次 scheduler 执行仍在进行中，暂未超出调度窗口。"
        else:
            base.health_status = "stale"
            base.detail = (
                "最近一次 scheduler 执行长时间停留在 running，"
                "可能存在 worker 卡住或结果未回写。"
            )
        return base

    if last_seen_at is None:
        base.health_status = "stale"
        base.detail = "已记录任务实例，但缺少 started/finished 时间，无法确认 scheduler 新鲜度。"
        return base

    if now - last_seen_at > stale_after:
        base.health_status = "stale"
        base.detail = (
            "最近一次 scheduler 执行已超过两个调度周期；"
            "可能存在 beat 未运行、worker 漏跑或任务未继续入队。"
        )
        return base

    base.health_status = "healthy"
    base.detail = "最近一次 scheduler 执行事实仍在调度窗口内。"
    return base


def _summarize_callback_waiting_scheduler_health(
    steps: list[CallbackWaitingAutomationStepCheck],
) -> tuple[str, str]:
    enabled_steps = [step for step in steps if step.enabled]
    if not enabled_steps:
        return (
            "disabled",
            "当前没有启用的 callback waiting 后台调度步骤，因此不存在 scheduler 新鲜度可检查项。",
        )

    health_statuses = {step.scheduler_health.health_status for step in enabled_steps}
    if "failed" in health_statuses:
        return (
            "failed",
            "至少一个已启用的 callback waiting 后台任务最近执行失败；当前补偿链路不可信。",
        )
    if health_statuses.issubset({"healthy", "running"}):
        return (
            "healthy",
            "所有已启用的 callback waiting 后台任务都记录到了最近执行事实。",
        )
    return (
        "degraded",
        "callback waiting 后台任务虽然已配置，但至少一个步骤缺少最近执行事实或已超过调度窗口。",
    )


def _serialize_sandbox_backend(backend) -> SandboxBackendCheck:
    return SandboxBackendCheck(
        id=backend.id,
        kind=backend.kind,
        endpoint=backend.endpoint,
        enabled=backend.enabled,
        status=backend.status,
        detail=backend.detail,
        capability=SandboxBackendCapabilityCheck(
            supported_execution_classes=list(backend.capability.supported_execution_classes),
            supported_languages=list(backend.capability.supported_languages),
            supported_profiles=list(backend.capability.supported_profiles),
            supported_dependency_modes=list(backend.capability.supported_dependency_modes),
            supports_tool_execution=backend.capability.supports_tool_execution,
            supports_builtin_package_sets=backend.capability.supports_builtin_package_sets,
            supports_backend_extensions=backend.capability.supports_backend_extensions,
            supports_network_policy=backend.capability.supports_network_policy,
            supports_filesystem_policy=backend.capability.supports_filesystem_policy,
        ),
    )


def _build_sandbox_readiness(sandbox_backends: list) -> SandboxReadinessCheck:
    enabled_backends = [backend for backend in sandbox_backends if backend.enabled]
    operable_backends = [
        backend for backend in enabled_backends if backend.status in _OPERABLE_SANDBOX_STATUSES
    ]
    execution_classes = [
        _build_sandbox_execution_class_readiness(
            enabled_backends=enabled_backends,
            operable_backends=operable_backends,
            execution_class=execution_class,
        )
        for execution_class in _SANDBOX_EXECUTION_CLASSES
    ]

    languages = sorted(
        {
            language
            for backend in operable_backends
            for language in backend.capability.supported_languages
        }
    )
    profiles = sorted(
        {
            profile
            for backend in operable_backends
            for profile in backend.capability.supported_profiles
        }
    )
    dependency_modes = sorted(
        {
            dependency_mode
            for backend in operable_backends
            for dependency_mode in backend.capability.supported_dependency_modes
        }
    )

    return SandboxReadinessCheck(
        enabled_backend_count=len(enabled_backends),
        healthy_backend_count=sum(1 for backend in enabled_backends if backend.status == "healthy"),
        degraded_backend_count=sum(
            1 for backend in enabled_backends if backend.status == "degraded"
        ),
        offline_backend_count=sum(1 for backend in enabled_backends if backend.status == "offline"),
        execution_classes=execution_classes,
        supported_languages=languages,
        supported_profiles=profiles,
        supported_dependency_modes=dependency_modes,
        supports_tool_execution=any(
            backend.capability.supports_tool_execution for backend in operable_backends
        ),
        supports_builtin_package_sets=any(
            backend.capability.supports_builtin_package_sets for backend in operable_backends
        ),
        supports_backend_extensions=any(
            backend.capability.supports_backend_extensions for backend in operable_backends
        ),
        supports_network_policy=any(
            backend.capability.supports_network_policy for backend in operable_backends
        ),
        supports_filesystem_policy=any(
            backend.capability.supports_filesystem_policy for backend in operable_backends
        ),
    )


def _build_sandbox_execution_class_readiness(
    *,
    enabled_backends: list,
    operable_backends: list,
    execution_class: str,
) -> SandboxExecutionClassReadinessCheck:
    class_operable_backends = [
        backend
        for backend in operable_backends
        if execution_class in backend.capability.supported_execution_classes
    ]
    backend_ids = sorted(backend.id for backend in class_operable_backends)
    return SandboxExecutionClassReadinessCheck(
        execution_class=execution_class,
        available=bool(backend_ids),
        backend_ids=backend_ids,
        supported_languages=sorted(
            {
                language
                for backend in class_operable_backends
                for language in backend.capability.supported_languages
            }
        ),
        supported_profiles=sorted(
            {
                profile
                for backend in class_operable_backends
                for profile in backend.capability.supported_profiles
            }
        ),
        supported_dependency_modes=sorted(
            {
                dependency_mode
                for backend in class_operable_backends
                for dependency_mode in backend.capability.supported_dependency_modes
            }
        ),
        supports_tool_execution=any(
            backend.capability.supports_tool_execution
            for backend in class_operable_backends
        ),
        supports_builtin_package_sets=any(
            backend.capability.supports_builtin_package_sets
            for backend in class_operable_backends
        ),
        supports_backend_extensions=any(
            backend.capability.supports_backend_extensions
            for backend in class_operable_backends
        ),
        supports_network_policy=any(
            backend.capability.supports_network_policy for backend in class_operable_backends
        ),
        supports_filesystem_policy=any(
            backend.capability.supports_filesystem_policy
            for backend in class_operable_backends
        ),
        reason=(
            None
            if backend_ids
            else _build_sandbox_execution_class_reason(
                enabled_backends=enabled_backends,
                operable_backends=operable_backends,
                execution_class=execution_class,
            )
        ),
    )


def _build_sandbox_execution_class_reason(
    *,
    enabled_backends: list,
    operable_backends: list,
    execution_class: str,
) -> str:
    if not enabled_backends:
        return (
            "No sandbox backend is currently enabled. Strong-isolation execution must fail closed "
            "until a compatible backend is configured."
        )
    if not operable_backends:
        backend_summary = ", ".join(
            f"{backend.id} ({backend.status})" for backend in enabled_backends
        )
        return (
            f"Enabled sandbox backends are not currently healthy for '{execution_class}': "
            f"{backend_summary}."
        )

    unsupported_backends = ", ".join(sorted(backend.id for backend in operable_backends))
    return (
        f"Healthy sandbox backends do not currently advertise execution class '{execution_class}': "
        f"{unsupported_backends}."
    )


def _build_callback_waiting_automation(
    settings,
    db: Session,
) -> CallbackWaitingAutomationCheck:
    latest_task_runs = _SCHEDULED_TASK_ACTIVITY.latest_runs_by_task(
        db,
        task_names=(
            "runtime.cleanup_callback_tickets",
            "runtime.monitor_waiting_resumes",
        ),
    )
    now = datetime.now(UTC)
    cleanup_enabled = (
        settings.callback_ticket_cleanup_schedule_enabled
        and settings.callback_ticket_cleanup_interval_seconds > 0
    )
    monitor_enabled = (
        settings.waiting_resume_monitor_schedule_enabled
        and settings.waiting_resume_monitor_interval_seconds > 0
    )

    steps = [
        CallbackWaitingAutomationStepCheck(
            key="callback_ticket_cleanup",
            label="Expire stale callback tickets",
            task="runtime.cleanup_callback_tickets",
            source="scheduler_cleanup",
            enabled=cleanup_enabled,
            interval_seconds=(
                settings.callback_ticket_cleanup_interval_seconds
                if cleanup_enabled
                else None
            ),
            detail=(
                "周期清理 stale callback ticket，并在条件满足时沿同一事实链补发即时 resume。"
                if cleanup_enabled
                else "当前未配置周期清理；过期 callback ticket 需要依赖手动治理入口。"
            ),
            scheduler_health=CallbackWaitingAutomationStepSchedulerHealthCheck(),
        ),
        CallbackWaitingAutomationStepCheck(
            key="waiting_resume_monitor",
            label="Requeue due waiting callbacks",
            task="runtime.monitor_waiting_resumes",
            source="scheduler_waiting_resume_monitor",
            enabled=monitor_enabled,
            interval_seconds=(
                settings.waiting_resume_monitor_interval_seconds
                if monitor_enabled
                else None
            ),
            detail=(
                "周期扫描到期的 `WAITING_CALLBACK` node，并补发后台 requeue / resume。"
                if monitor_enabled
                else (
                    "当前未配置周期 waiting resume monitor；"
                    "到期 waiting callback 仍需要依赖 callback 投递或手动恢复。"
                )
            ),
            scheduler_health=CallbackWaitingAutomationStepSchedulerHealthCheck(),
        ),
    ]

    for step in steps:
        step.scheduler_health = _build_callback_step_scheduler_health(
            step=step,
            latest_run=latest_task_runs.get(step.task),
            now=now,
        )

    if cleanup_enabled and monitor_enabled:
        status = "configured"
        detail = (
            "`WAITING_CALLBACK` 后台补偿链路已完成配置，但仍依赖独立 scheduler 进程实际运行。"
        )
    elif cleanup_enabled or monitor_enabled:
        status = "partial"
        detail = (
            "`WAITING_CALLBACK` 只完成了部分后台补偿配置；仍存在需要人工介入的恢复缺口。"
        )
    else:
        status = "disabled"
        detail = (
            "`WAITING_CALLBACK` 未启用后台补偿调度；"
            "当前仍依赖直接 callback、手动 cleanup 或手动 resume。"
        )

    scheduler_health_status, scheduler_health_detail = (
        _summarize_callback_waiting_scheduler_health(steps)
    )

    return CallbackWaitingAutomationCheck(
        status=status,
        scheduler_required=True,
        detail=detail,
        scheduler_health_status=scheduler_health_status,
        scheduler_health_detail=scheduler_health_detail,
        steps=steps,
    )


def _probe(name: str, handler: Callable[[], None]) -> ServiceCheck:
    try:
        handler()
        return ServiceCheck(name=name, status="up")
    except Exception as exc:
        return ServiceCheck(name=name, status="down", detail=str(exc))


def _summarize_payload(payload: dict) -> tuple[list[str], str, int]:
    payload_keys = sorted(str(key) for key in payload.keys())[:6]
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    payload_size = len(raw)
    if payload_size <= _PAYLOAD_PREVIEW_LIMIT:
        return payload_keys, raw, payload_size
    return payload_keys, f"{raw[:_PAYLOAD_PREVIEW_LIMIT]}...", payload_size


def _serialize_recent_event(event: RunEvent) -> RecentRunEventCheck:
    payload_keys, payload_preview, payload_size = _summarize_payload(event.payload)
    return RecentRunEventCheck(
        id=event.id,
        run_id=event.run_id,
        node_run_id=event.node_run_id,
        event_type=event.event_type,
        payload_keys=payload_keys,
        payload_preview=payload_preview,
        payload_size=payload_size,
        created_at=event.created_at,
    )


def _serialize_recent_run(
    run: Run,
    *,
    workflow: Workflow | None,
    event_count: int,
    workflow_tool_index: dict,
) -> RecentRunCheck:
    payload: dict[str, object] = {
        "id": run.id,
        "workflow_id": run.workflow_id,
        "workflow_version": run.workflow_version,
        "status": run.status,
        "created_at": run.created_at,
        "finished_at": run.finished_at,
        "event_count": event_count,
    }

    if workflow is not None:
        payload["workflow_name"] = workflow.name
        payload["tool_governance"] = summarize_workflow_definition_tool_governance(
            workflow.definition,
            tool_index=workflow_tool_index,
        )

    return RecentRunCheck(**payload)


def _build_runtime_activity(db: Session) -> RuntimeActivityCheck:
    recent_runs = db.query(Run).order_by(Run.created_at.desc()).limit(_RECENT_RUN_LIMIT).all()
    run_ids = [run.id for run in recent_runs]
    workflow_ids = sorted({run.workflow_id for run in recent_runs})

    event_counts: dict[str, int] = {}
    if run_ids:
        counts = (
            db.query(RunEvent.run_id, func.count(RunEvent.id))
            .filter(RunEvent.run_id.in_(run_ids))
            .group_by(RunEvent.run_id)
            .all()
        )
        event_counts = {run_id: count for run_id, count in counts}

    workflow_by_id: dict[str, Workflow] = {}
    workflow_tool_index = {}
    if workflow_ids:
        workflows = db.query(Workflow).filter(Workflow.id.in_(workflow_ids)).all()
        workflow_by_id = {workflow.id: workflow for workflow in workflows}
        workflow_tool_index = load_workflow_view_tool_index(db)

    recent_events = (
        db.query(RunEvent).order_by(RunEvent.created_at.desc()).limit(_RECENT_EVENT_LIMIT).all()
    )
    run_statuses = dict(sorted(Counter(run.status for run in recent_runs).items()))
    event_types = dict(sorted(Counter(event.event_type for event in recent_events).items()))

    return RuntimeActivityCheck(
        summary={
            "recent_run_count": len(recent_runs),
            "recent_event_count": len(recent_events),
            "run_statuses": run_statuses,
            "event_types": event_types,
        },
        recent_runs=[
            _serialize_recent_run(
                run,
                workflow=workflow_by_id.get(run.workflow_id),
                event_count=event_counts.get(run.id, 0),
                workflow_tool_index=workflow_tool_index,
            )
            for run in recent_runs
        ],
        recent_events=[
            _serialize_recent_event(event)
            for event in recent_events
        ],
    )


@router.get("/system/overview", response_model=SystemOverview)
def system_overview(db: Session = Depends(get_db)) -> SystemOverview:
    settings = get_settings()

    def verify_database() -> None:
        if not check_database():
            raise RuntimeError("database unavailable")

    postgres = _probe(
        "postgres",
        verify_database,
    )

    redis_service = _probe(
        "redis",
        lambda: redis.from_url(settings.redis_url).ping(),
    )

    s3_service = _probe(
        "object-storage",
        lambda: boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            use_ssl=settings.s3_use_ssl,
        ).list_buckets(),
    )

    adapter_healths = get_compatibility_adapter_health_checker().probe_all(get_plugin_registry())
    registry = get_plugin_registry()
    sandbox_backends = get_sandbox_backend_health_checker().probe_all(
        get_sandbox_backend_registry()
    )
    sandbox_readiness = _apply_sandbox_follow_up_contract(
        readiness=_build_sandbox_readiness(sandbox_backends),
        db=db,
        registry=registry,
    )
    callback_waiting_automation = _apply_callback_follow_up_contract(
        automation=_build_callback_waiting_automation(settings, db),
        db=db,
    )
    adapter_services = [
        ServiceCheck(
            name=f"plugin-adapter:{adapter.id}",
            status="up" if adapter.status in {"up", "degraded"} else "down",
            detail=adapter.detail,
        )
        for adapter in adapter_healths
        if adapter.enabled
    ]
    sandbox_services = [
        ServiceCheck(
            name=f"sandbox-backend:{backend.id}",
            status="up" if backend.status in {"healthy", "degraded"} else "down",
            detail=backend.detail,
        )
        for backend in sandbox_backends
        if backend.enabled
    ]

    services = [postgres, redis_service, s3_service, *adapter_services, *sandbox_services]
    status = "degraded" if any(item.status == "down" for item in services) else "ok"

    return SystemOverview(
        status=status,
        environment=settings.env,
        services=services,
        capabilities=[
            "workflow-crud-skeleton",
            "runtime-worker-skeleton",
            "runtime-run-tracking",
            "callback-waiting-automation-summary",
            "callback-waiting-automation-health",
            "callback-waiting-follow-up-contract",
            "sandbox-ready",
            "sandbox-backend-registry",
            "sandbox-readiness-summary",
            "sandbox-readiness-follow-up-contract",
            "plugin-call-proxy-foundation",
            "plugin-adapter-health-probe",
            "plugin-tool-catalog-visible",
            "runtime-events-visible",
        ],
        plugin_adapters=[
            CompatibilityAdapterCheck(
                id=adapter.id,
                ecosystem=adapter.ecosystem,
                endpoint=adapter.endpoint,
                enabled=adapter.enabled,
                status=adapter.status,
                detail=adapter.detail,
            )
            for adapter in adapter_healths
        ],
        sandbox_backends=[_serialize_sandbox_backend(backend) for backend in sandbox_backends],
        sandbox_readiness=sandbox_readiness,
        plugin_tools=[
            PluginToolCheck(
                id=tool.id,
                name=tool.name,
                ecosystem=tool.ecosystem,
                source=tool.source,
                callable=(tool.ecosystem != "native") or registry.has_native_invoker(tool.id),
            )
            for tool in registry.list_tools()
        ],
        runtime_activity=_build_runtime_activity(db),
        callback_waiting_automation=callback_waiting_automation,
    )


@router.get("/system/plugin-adapters", response_model=list[CompatibilityAdapterCheck])
def list_plugin_adapters() -> list[CompatibilityAdapterCheck]:
    adapter_healths = get_compatibility_adapter_health_checker().probe_all(get_plugin_registry())
    return [
        CompatibilityAdapterCheck(
            id=adapter.id,
            ecosystem=adapter.ecosystem,
            endpoint=adapter.endpoint,
            enabled=adapter.enabled,
            status=adapter.status,
            detail=adapter.detail,
        )
        for adapter in adapter_healths
    ]


@router.get("/system/sandbox-backends", response_model=list[SandboxBackendCheck])
def list_sandbox_backends() -> list[SandboxBackendCheck]:
    backend_healths = get_sandbox_backend_health_checker().probe_all(
        get_sandbox_backend_registry()
    )
    return [_serialize_sandbox_backend(backend) for backend in backend_healths]


@router.get("/system/runtime-activity", response_model=RuntimeActivityCheck)
def get_runtime_activity(db: Session = Depends(get_db)) -> RuntimeActivityCheck:
    return _build_runtime_activity(db)
