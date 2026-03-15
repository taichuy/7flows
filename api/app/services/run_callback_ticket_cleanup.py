from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.run import NodeRun, Run, RunEvent
from app.services.callback_waiting_lifecycle import (
    compute_callback_cleanup_backoff_delay_seconds,
    record_callback_resume_schedule,
    record_callback_ticket_expired,
)
from app.services.run_callback_tickets import CallbackTicketSnapshot, RunCallbackTicketService
from app.services.run_resume_scheduler import RunResumeScheduler, get_run_resume_scheduler


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _serialize_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


@dataclass(frozen=True)
class CallbackTicketCleanupItem:
    ticket: str
    run_id: str
    node_run_id: str
    node_id: str | None
    tool_call_id: str | None
    tool_id: str | None
    tool_call_index: int
    waiting_status: str
    status: str
    reason: str | None
    created_at: datetime
    expires_at: datetime | None
    expired_at: datetime | None


@dataclass(frozen=True)
class CallbackTicketCleanupResult:
    source: str
    dry_run: bool
    limit: int
    matched_count: int
    expired_count: int
    scheduled_resume_count: int
    run_ids: list[str]
    scheduled_resume_run_ids: list[str]
    items: list[CallbackTicketCleanupItem]


class RunCallbackTicketCleanupService:
    def __init__(
        self,
        *,
        ticket_service: RunCallbackTicketService | None = None,
        resume_scheduler: RunResumeScheduler | None = None,
        batch_size: int | None = None,
    ) -> None:
        resolved_batch_size = (
            get_settings().callback_ticket_cleanup_batch_size
            if batch_size is None
            else batch_size
        )
        self._ticket_service = ticket_service or RunCallbackTicketService()
        self._resume_scheduler = resume_scheduler or get_run_resume_scheduler()
        self._batch_size = max(int(resolved_batch_size), 1)

    def cleanup_stale_tickets(
        self,
        db: Session,
        *,
        source: str = "callback_ticket_cleanup",
        schedule_resumes: bool = False,
        resume_source: str = "callback_ticket_monitor",
        limit: int | None = None,
        dry_run: bool = False,
        now: datetime | None = None,
    ) -> CallbackTicketCleanupResult:
        effective_limit = max(int(limit or self._batch_size), 1)
        effective_now = now or _utcnow()
        records = self._ticket_service.list_expired_pending_tickets(
            db,
            now=effective_now,
            limit=effective_limit,
        )
        runs = self._load_runs(db, [record.run_id for record in records])
        node_runs = self._load_node_runs(db, [record.node_run_id for record in records])

        run_ids: list[str] = []
        seen_run_ids: set[str] = set()
        resume_scheduled_run_ids: set[str] = set()
        scheduled_resume_run_ids: list[str] = []
        items: list[CallbackTicketCleanupItem] = []
        for record in records:
            run = runs.get(record.run_id)
            node_run = node_runs.get(record.node_run_id)
            if dry_run:
                snapshot = self._ticket_service.snapshot(record)
            else:
                snapshot = self._ticket_service.expire_ticket(
                    record,
                    reason="callback_ticket_expired",
                    expired_at=effective_now,
                    callback_payload={
                        "reason": "callback_ticket_expired",
                        "source": source,
                        "cleanup": True,
                    },
                )
                db.add(
                    RunEvent(
                        run_id=record.run_id,
                        node_run_id=record.node_run_id,
                        event_type="run.callback.ticket.expired",
                        payload=self._build_expired_event_payload(
                            snapshot=snapshot,
                            node_run=node_run,
                            source=source,
                            cleanup=True,
                        ),
                    )
                )
                if node_run is not None:
                    node_run.checkpoint_payload = record_callback_ticket_expired(
                        node_run.checkpoint_payload,
                        reason="callback_ticket_expired",
                        expired_at=snapshot.expired_at,
                    )
                if (
                    schedule_resumes
                    and record.run_id not in resume_scheduled_run_ids
                    and self._schedule_resume_if_needed(
                        db,
                        run=run,
                        node_run=node_run,
                        snapshot=snapshot,
                        source=resume_source,
                    )
                ):
                    resume_scheduled_run_ids.add(record.run_id)
                    scheduled_resume_run_ids.append(record.run_id)
            if record.run_id not in seen_run_ids:
                seen_run_ids.add(record.run_id)
                run_ids.append(record.run_id)
            items.append(self._build_item(snapshot=snapshot, node_run=node_run))

        return CallbackTicketCleanupResult(
            source=source,
            dry_run=dry_run,
            limit=effective_limit,
            matched_count=len(records),
            expired_count=0 if dry_run else len(records),
            scheduled_resume_count=len(scheduled_resume_run_ids),
            run_ids=run_ids,
            scheduled_resume_run_ids=scheduled_resume_run_ids,
            items=items,
        )

    def _load_runs(
        self,
        db: Session,
        run_ids: list[str],
    ) -> dict[str, Run]:
        unique_ids = [run_id for run_id in dict.fromkeys(run_ids) if run_id]
        if not unique_ids:
            return {}
        records = db.scalars(select(Run).where(Run.id.in_(unique_ids))).all()
        return {record.id: record for record in records}

    def _load_node_runs(
        self,
        db: Session,
        node_run_ids: list[str],
    ) -> dict[str, NodeRun]:
        unique_ids = [node_run_id for node_run_id in dict.fromkeys(node_run_ids) if node_run_id]
        if not unique_ids:
            return {}
        records = db.scalars(select(NodeRun).where(NodeRun.id.in_(unique_ids))).all()
        return {record.id: record for record in records}

    def _build_item(
        self,
        *,
        snapshot: CallbackTicketSnapshot,
        node_run: NodeRun | None,
    ) -> CallbackTicketCleanupItem:
        return CallbackTicketCleanupItem(
            ticket=snapshot.ticket,
            run_id=snapshot.run_id,
            node_run_id=snapshot.node_run_id,
            node_id=node_run.node_id if node_run is not None else None,
            tool_call_id=snapshot.tool_call_id,
            tool_id=snapshot.tool_id,
            tool_call_index=snapshot.tool_call_index,
            waiting_status=snapshot.waiting_status,
            status=snapshot.status,
            reason=snapshot.reason,
            created_at=snapshot.created_at,
            expires_at=snapshot.expires_at,
            expired_at=snapshot.expired_at,
        )

    def _schedule_resume_if_needed(
        self,
        db: Session,
        *,
        run: Run | None,
        node_run: NodeRun | None,
        snapshot: CallbackTicketSnapshot,
        source: str,
    ) -> bool:
        if run is None or run.status != "waiting" or node_run is None:
            return False

        waiting_status = str(
            snapshot.waiting_status or node_run.phase or node_run.status or ""
        ).strip()
        if waiting_status != "waiting_callback":
            return False

        checkpoint_payload = dict(node_run.checkpoint_payload or {})
        delay_seconds, backoff_attempt = compute_callback_cleanup_backoff_delay_seconds(
            checkpoint_payload
        )

        scheduled_resume = self._resume_scheduler.schedule(
            run_id=run.id,
            delay_seconds=delay_seconds,
            reason=snapshot.reason or node_run.waiting_reason or "callback pending",
            source=source,
            db=db,
        )
        checkpoint_payload = record_callback_resume_schedule(
            checkpoint_payload,
            delay_seconds=scheduled_resume.delay_seconds,
            reason=scheduled_resume.reason,
            source=scheduled_resume.source,
            backoff_attempt=backoff_attempt,
        )
        checkpoint_payload["scheduled_resume"] = {
            "delay_seconds": scheduled_resume.delay_seconds,
            "reason": scheduled_resume.reason,
            "source": scheduled_resume.source,
            "waiting_status": waiting_status,
            "backoff_attempt": backoff_attempt,
        }
        node_run.checkpoint_payload = checkpoint_payload
        db.add(
            RunEvent(
                run_id=run.id,
                node_run_id=node_run.id,
                event_type="run.resume.scheduled",
                payload={
                    "node_id": node_run.node_id,
                    "delay_seconds": scheduled_resume.delay_seconds,
                    "reason": scheduled_resume.reason,
                    "source": scheduled_resume.source,
                    "waiting_status": waiting_status,
                    "backoff_attempt": backoff_attempt,
                },
            )
        )
        return True

    def _build_expired_event_payload(
        self,
        *,
        snapshot: CallbackTicketSnapshot,
        node_run: NodeRun | None,
        source: str,
        cleanup: bool,
    ) -> dict[str, object]:
        return {
            "ticket": snapshot.ticket,
            "node_id": node_run.node_id if node_run is not None else None,
            "tool_id": snapshot.tool_id,
            "tool_call_id": snapshot.tool_call_id,
            "expires_at": _serialize_datetime(snapshot.expires_at),
            "expired_at": _serialize_datetime(snapshot.expired_at),
            "source": source,
            "cleanup": cleanup,
        }
