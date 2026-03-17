import json
from collections import Counter
from collections.abc import Callable

import boto3
import redis
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import check_database, get_db
from app.models.run import Run, RunEvent
from app.schemas.system import (
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
    SystemOverview,
)
from app.services.plugin_runtime import (
    get_compatibility_adapter_health_checker,
    get_plugin_registry,
)
from app.services.sandbox_backends import (
    get_sandbox_backend_health_checker,
    get_sandbox_backend_registry,
)

router = APIRouter(tags=["system"])

_RECENT_RUN_LIMIT = 5
_RECENT_EVENT_LIMIT = 8
_PAYLOAD_PREVIEW_LIMIT = 180
_SANDBOX_EXECUTION_CLASSES = ("sandbox", "microvm")
_OPERABLE_SANDBOX_STATUSES = {"healthy", "degraded"}


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
        SandboxExecutionClassReadinessCheck(
            execution_class=execution_class,
            available=bool(backend_ids := sorted(
                backend.id
                for backend in operable_backends
                if execution_class in backend.capability.supported_execution_classes
            )),
            backend_ids=backend_ids,
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


def _build_runtime_activity(db: Session) -> RuntimeActivityCheck:
    recent_runs = db.query(Run).order_by(Run.created_at.desc()).limit(_RECENT_RUN_LIMIT).all()
    run_ids = [run.id for run in recent_runs]

    event_counts: dict[str, int] = {}
    if run_ids:
        counts = (
            db.query(RunEvent.run_id, func.count(RunEvent.id))
            .filter(RunEvent.run_id.in_(run_ids))
            .group_by(RunEvent.run_id)
            .all()
        )
        event_counts = {run_id: count for run_id, count in counts}

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
            RecentRunCheck(
                id=run.id,
                workflow_id=run.workflow_id,
                workflow_version=run.workflow_version,
                status=run.status,
                created_at=run.created_at,
                finished_at=run.finished_at,
                event_count=event_counts.get(run.id, 0),
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
    adapter_services = [
        ServiceCheck(
            name=f"plugin-adapter:{adapter.id}",
            status="up" if adapter.status == "up" else "down",
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
            "sandbox-ready",
            "sandbox-backend-registry",
            "sandbox-readiness-summary",
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
        sandbox_readiness=_build_sandbox_readiness(sandbox_backends),
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
