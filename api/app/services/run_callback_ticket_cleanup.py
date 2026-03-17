from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.run import NodeRun, Run, RunEvent
from app.services.callback_waiting_lifecycle import (
    apply_callback_waiting_termination_policy,
    compute_callback_cleanup_backoff_delay_seconds,
    load_callback_waiting_lifecycle,
    record_callback_resume_schedule,
    record_callback_ticket_expired,
    record_callback_waiting_terminated,
    should_terminate_callback_waiting,
)
from app.services.run_callback_tickets import CallbackTicketSnapshot, RunCallbackTicketService
from app.services.run_resume_scheduler import RunResumeScheduler, get_run_resume_scheduler

_CALLBACK_WAITING_TERMINATION_REASON = "callback_waiting_max_expired_tickets_reached"


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
    terminated_count: int
    run_ids: list[str]
    scheduled_resume_run_ids: list[str]
    terminated_run_ids: list[str]
    items: list[CallbackTicketCleanupItem]


@dataclass(frozen=True)
class CallbackTicketExpirationOutcome:
    snapshot: CallbackTicketSnapshot
    scheduled_resume: bool = False
    terminated: bool = False


class RunCallbackTicketCleanupService:
    def __init__(
        self,
        *,
        ticket_service: RunCallbackTicketService | None = None,
        resume_scheduler: RunResumeScheduler | None = None,
        batch_size: int | None = None,
        max_expired_cycles: int | None = None,
    ) -> None:
        resolved_batch_size = (
            get_settings().callback_ticket_cleanup_batch_size
            if batch_size is None
            else batch_size
        )
        resolved_max_expired_cycles = (
            get_settings().callback_ticket_max_expired_cycles
            if max_expired_cycles is None
            else max_expired_cycles
        )
        self._ticket_service = ticket_service or RunCallbackTicketService()
        self._resume_scheduler = resume_scheduler or get_run_resume_scheduler()
        self._batch_size = max(int(resolved_batch_size), 1)
        self._max_expired_ticket_count = max(int(resolved_max_expired_cycles), 0)

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
        run_id: str | None = None,
        node_run_id: str | None = None,
    ) -> CallbackTicketCleanupResult:
        effective_limit = max(int(limit or self._batch_size), 1)
        effective_now = now or _utcnow()
        records = self._ticket_service.list_expired_pending_tickets(
            db,
            now=effective_now,
            limit=effective_limit,
            run_id=run_id,
            node_run_id=node_run_id,
        )
        runs = self._load_runs(db, [record.run_id for record in records])
        node_runs = self._load_node_runs(db, [record.node_run_id for record in records])

        run_ids: list[str] = []
        seen_run_ids: set[str] = set()
        resume_scheduled_run_ids: set[str] = set()
        scheduled_resume_run_ids: list[str] = []
        terminated_run_ids: list[str] = []
        terminated_run_id_set: set[str] = set()
        items: list[CallbackTicketCleanupItem] = []
        for record in records:
            run = runs.get(record.run_id)
            node_run = node_runs.get(record.node_run_id)
            if dry_run:
                snapshot = self._ticket_service.snapshot(record)
            else:
                outcome = self.expire_ticket_and_follow_up(
                    db,
                    record=record,
                    run=run,
                    node_run=node_run,
                    source=source,
                    schedule_resumes=schedule_resumes,
                    resume_source=resume_source,
                    cleanup=True,
                    already_scheduled_run_ids=resume_scheduled_run_ids,
                    now=effective_now,
                )
                snapshot = outcome.snapshot
                if outcome.scheduled_resume and record.run_id not in resume_scheduled_run_ids:
                    resume_scheduled_run_ids.add(record.run_id)
                    scheduled_resume_run_ids.append(record.run_id)
                if outcome.terminated and record.run_id not in terminated_run_id_set:
                    terminated_run_id_set.add(record.run_id)
                    terminated_run_ids.append(record.run_id)
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
            terminated_count=len(terminated_run_ids),
            run_ids=run_ids,
            scheduled_resume_run_ids=scheduled_resume_run_ids,
            terminated_run_ids=terminated_run_ids,
            items=items,
        )

    def expire_ticket_and_follow_up(
        self,
        db: Session,
        *,
        record,
        run: Run | None,
        node_run: NodeRun | None,
        source: str,
        schedule_resumes: bool,
        resume_source: str,
        cleanup: bool,
        already_scheduled_run_ids: set[str] | None = None,
        now: datetime | None = None,
    ) -> CallbackTicketExpirationOutcome:
        effective_now = now or _utcnow()
        snapshot = self._ticket_service.expire_ticket(
            record,
            reason="callback_ticket_expired",
            expired_at=effective_now,
            callback_payload={
                "reason": "callback_ticket_expired",
                "source": source,
                "cleanup": cleanup,
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
                    cleanup=cleanup,
                ),
            )
        )

        scheduled_resume = False
        terminated = False
        if node_run is not None:
            existing_checkpoint_payload = dict(node_run.checkpoint_payload or {})
            checkpoint_payload = record_callback_ticket_expired(
                existing_checkpoint_payload,
                reason="callback_ticket_expired",
                expired_at=snapshot.expired_at,
            )
            checkpoint_payload = apply_callback_waiting_termination_policy(
                checkpoint_payload,
                max_expired_ticket_count=self._max_expired_ticket_count,
            )
            checkpoint_payload.pop("callback_ticket", None)
            node_run.checkpoint_payload = checkpoint_payload

            if run is not None and should_terminate_callback_waiting(checkpoint_payload):
                checkpoint_payload.pop("scheduled_resume", None)
                node_run.checkpoint_payload = checkpoint_payload
                terminated = self._terminate_waiting_callback(
                    db,
                    run=run,
                    node_run=node_run,
                    snapshot=snapshot,
                    source=source,
                    cleanup=cleanup,
                )
            elif (
                schedule_resumes
                and run is not None
                and self._is_current_waiting_callback_node(
                    run=run,
                    node_run=node_run,
                    snapshot=snapshot,
                )
                and run.id not in (already_scheduled_run_ids or set())
                and self._schedule_resume_if_needed(
                    db,
                    run=run,
                    node_run=node_run,
                    snapshot=snapshot,
                    source=resume_source,
                )
            ):
                scheduled_resume = True
            elif (
                run is not None
                and self._is_current_waiting_callback_node(
                    run=run,
                    node_run=node_run,
                    snapshot=snapshot,
                )
                and run.id in (already_scheduled_run_ids or set())
                and "scheduled_resume" in existing_checkpoint_payload
            ):
                checkpoint_payload["scheduled_resume"] = deepcopy(
                    existing_checkpoint_payload["scheduled_resume"]
                )
                node_run.checkpoint_payload = checkpoint_payload
            else:
                checkpoint_payload.pop("scheduled_resume", None)
                node_run.checkpoint_payload = checkpoint_payload

        return CallbackTicketExpirationOutcome(
            snapshot=snapshot,
            scheduled_resume=scheduled_resume,
            terminated=terminated,
        )

    def _is_current_waiting_callback_node(
        self,
        *,
        run: Run,
        node_run: NodeRun,
        snapshot: CallbackTicketSnapshot,
    ) -> bool:
        if run.status != "waiting":
            return False
        run_checkpoint_payload = dict(run.checkpoint_payload or {})
        if run_checkpoint_payload.get("waiting_node_run_id") != node_run.id:
            return False
        waiting_status = str(
            snapshot.waiting_status or node_run.phase or node_run.status or ""
        ).strip()
        if waiting_status != "waiting_callback":
            return False
        return (
            str(node_run.status or "").strip() == "waiting_callback"
            or str(node_run.phase or "").strip() == "waiting_callback"
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
            reason=node_run.waiting_reason or snapshot.reason or "callback pending",
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

    def _terminate_waiting_callback(
        self,
        db: Session,
        *,
        run: Run,
        node_run: NodeRun,
        snapshot: CallbackTicketSnapshot,
        source: str,
        cleanup: bool,
    ) -> bool:
        terminated_at = snapshot.expired_at or _utcnow()
        lifecycle = load_callback_waiting_lifecycle(node_run.checkpoint_payload)
        expired_ticket_count = lifecycle["expired_ticket_count"]
        max_expired_ticket_count = lifecycle["max_expired_ticket_count"]
        error_message = (
            "Callback waiting terminated after "
            f"{expired_ticket_count} expired ticket cycle(s) "
            f"(max {max_expired_ticket_count})."
        )

        checkpoint_payload = record_callback_waiting_terminated(
            node_run.checkpoint_payload,
            max_expired_ticket_count=max_expired_ticket_count,
            reason=_CALLBACK_WAITING_TERMINATION_REASON,
            terminated_at=terminated_at,
        )
        checkpoint_payload.pop("callback_ticket", None)
        checkpoint_payload.pop("scheduled_resume", None)
        node_run.checkpoint_payload = checkpoint_payload
        node_run.status = "failed"
        node_run.phase = "failed"
        node_run.phase_started_at = terminated_at
        node_run.error_message = error_message
        node_run.finished_at = terminated_at

        run.status = "failed"
        run.error_message = error_message
        run.finished_at = terminated_at
        run.current_node_id = None
        run_checkpoint_payload = dict(run.checkpoint_payload or {})
        run_checkpoint_payload["waiting_node_run_id"] = None
        run.checkpoint_payload = run_checkpoint_payload

        db.add(
            RunEvent(
                run_id=run.id,
                node_run_id=node_run.id,
                event_type="run.callback.waiting.terminated",
                payload={
                    "ticket": snapshot.ticket,
                    "node_id": node_run.node_id,
                    "tool_id": snapshot.tool_id,
                    "tool_call_id": snapshot.tool_call_id,
                    "source": source,
                    "cleanup": cleanup,
                    "expired_ticket_count": expired_ticket_count,
                    "max_expired_ticket_count": max_expired_ticket_count,
                    "reason": _CALLBACK_WAITING_TERMINATION_REASON,
                    "error": error_message,
                },
            )
        )
        db.add(
            RunEvent(
                run_id=run.id,
                node_run_id=node_run.id,
                event_type="node.failed",
                payload={"node_id": node_run.node_id, "error": error_message},
            )
        )
        db.add(
            RunEvent(
                run_id=run.id,
                node_run_id=None,
                event_type="run.failed",
                payload={"error": error_message},
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
