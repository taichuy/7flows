from datetime import UTC, datetime

from app.core.celery_app import celery_app


@celery_app.task(name="system.heartbeat")
def heartbeat() -> dict[str, str]:
    return {"status": "ok", "timestamp": datetime.now(UTC).isoformat()}
