from collections.abc import Callable

import boto3
import redis
from fastapi import APIRouter

from app.core.config import get_settings
from app.core.database import check_database
from app.schemas.system import ServiceCheck, SystemOverview

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

    services = [postgres, redis_service, s3_service]
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
            "plugin-adapter-placeholder",
        ],
    )
