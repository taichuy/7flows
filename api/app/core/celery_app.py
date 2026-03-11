from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "sevenflows",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.heartbeat", "app.tasks.runtime"],
)

beat_schedule: dict[str, dict[str, object]] = {}
if (
    settings.callback_ticket_cleanup_schedule_enabled
    and settings.callback_ticket_cleanup_interval_seconds > 0
):
    beat_schedule["runtime.cleanup_callback_tickets"] = {
        "task": "runtime.cleanup_callback_tickets",
        "schedule": settings.callback_ticket_cleanup_interval_seconds,
        "kwargs": {"source": "scheduler_cleanup"},
    }

celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Shanghai",
    enable_utc=False,
    beat_schedule=beat_schedule,
)
