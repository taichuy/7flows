from collections.abc import Callable

import boto3
import redis
from fastapi import APIRouter

from app.core.config import get_settings
from app.core.database import check_database
from app.schemas.system import CompatibilityAdapterCheck, ServiceCheck, SystemOverview
from app.services.plugin_runtime import (
    get_compatibility_adapter_health_checker,
    get_plugin_registry,
)

router = APIRouter(tags=["system"])


def _probe(name: str, handler: Callable[[], None]) -> ServiceCheck:
    try:
        handler()
        return ServiceCheck(name=name, status="up")
    except Exception as exc:
        return ServiceCheck(name=name, status="down", detail=str(exc))


@router.get("/system/overview", response_model=SystemOverview)
def system_overview() -> SystemOverview:
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
    adapter_services = [
        ServiceCheck(
            name=f"plugin-adapter:{adapter.id}",
            status="up" if adapter.status == "up" else "down",
            detail=adapter.detail,
        )
        for adapter in adapter_healths
        if adapter.enabled
    ]

    services = [postgres, redis_service, s3_service, *adapter_services]
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
            "plugin-call-proxy-foundation",
            "plugin-adapter-health-probe",
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
